// Note: Single-instance in-memory connection registry for local parity.
// In a multi-instance deployment, use a shared pub/sub adapter (such as Redis).

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import url from 'url';
import jwt from 'jsonwebtoken';
import { Consultant, Project, ProjectDiscovery, ProjectActivity } from '../models/index.js';
import { ENV } from '../config/env.js';
import { unsignPortalAccessToken } from '../utils/crypto.js';
import { logProjectActivity } from '../services/project.service.js';

export interface ClientConnection {
  ws: WebSocket;
  role: 'client' | 'consultant';
  userId?: string;
  projectId: string;
  portalToken: string;
}

export interface ActiveHelpSession {
  page_id: string;
  field_key: string;
  question: string;
  is_active: boolean;
  requested_at: string;
}

export const VALID_WEBRTC_ACTIONS = new Set([
  'call_initiate',
  'call_accept',
  'call_reject',
  'call_cancel',
  'call_end',
  'offer',
  'answer',
  'ice_candidate',
]);

const ALLOWED_PAGE_PATTERN = /^(discovery|frame_\d+|step\s*\d+|brand_dna|client_profile)$/i;

const ALLOWED_FIELD_KEYS = new Set([
  'what_business_does',
  'basics.whatDo',
  'basics.businessDescription',
  'answers.whatDoYouDo',
  'target_customer',
  'basics.targetCustomer',
  'answers.targetCustomer',
  'why_choose_us',
  'basics.whyChooseUs',
  'answers.whyChooseYou',
  'brand_feeling',
  'basics.brandFeeling',
  'answers.whyTrustYou',
  'client_name',
  'company_name',
  'industry',
  'sector',
  'sliders',
  'emotions',
  'selectedEmotions',
  'persona',
  'selectedAudience',
  'audience_archetype',
  'comps',
  'competitors',
  'styles',
  'selectedVisual',
  'visual_styles',
]);

function isAllowedFieldKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (ALLOWED_FIELD_KEYS.has(key)) return true;
  if (key.startsWith('slider.')) return true;
  return false;
}

// In-memory active help sessions per projectId
export const ACTIVE_HELP_SESSIONS: Record<string, ActiveHelpSession> = {};

// Connected clients registry
export const consultantSockets = new Map<string, Set<WebSocket>>(); // consultantId -> Set<ws>
export const projectSockets = new Map<string, Set<ClientConnection>>(); // projectId -> Set<ClientConnection>

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.join('=').trim());
    }
  });
  return list;
}

function verifyConsultantToken(rawToken?: string): string | null {
  if (!rawToken || rawToken === 'active') return null;
  try {
    const payload = jwt.verify(rawToken, ENV.JWT_ACCESS_SECRET) as { userId?: string; id?: string };
    return payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

/**
 * Rehydrates the latest active help session from MongoDB ProjectActivity
 */
export async function getLatestActiveHelp(projectId: string): Promise<ActiveHelpSession | null> {
  try {
    const latestReq = await ProjectActivity.findOne({
      projectId,
      action: 'client_help_requested',
    }).sort({ createdAt: -1 });

    if (!latestReq) return null;

    const latestResolved = await ProjectActivity.findOne({
      projectId,
      action: 'client_help_resolved',
      createdAt: { $gt: latestReq.createdAt },
    });

    if (latestResolved) return null;

    let meta: any = {};
    try {
      meta = typeof latestReq.metadata === 'string' ? JSON.parse(latestReq.metadata) : latestReq.metadata || {};
    } catch {
      meta = {};
    }

    const session: ActiveHelpSession = {
      page_id: meta.page_id || 'Step 1',
      field_key: meta.field_key || '',
      question: meta.question || latestReq.description,
      is_active: true,
      requested_at: latestReq.createdAt.toISOString(),
    };

    ACTIVE_HELP_SESSIONS[projectId] = session;
    return session;
  } catch (err) {
    console.error('Error rehydrating active help session from DB:', err);
    return null;
  }
}

export function getActiveHelpSession(projectId: string): ActiveHelpSession | null {
  const session = ACTIVE_HELP_SESSIONS[projectId];
  return session && session.is_active ? session : null;
}

/**
 * Persists draft field updates during live co-editing into MongoDB
 */
async function persistDraftField(projectId: string, fieldKey: string, value: any): Promise<void> {
  try {
    const updateData: any = {};
    if (['what_business_does', 'basics.whatDo', 'basics.businessDescription', 'answers.whatDoYouDo'].includes(fieldKey)) {
      updateData.whatBusinessDoes = String(value || '');
    } else if (['target_customer', 'basics.targetCustomer', 'answers.targetCustomer'].includes(fieldKey)) {
      updateData.targetCustomer = String(value || '');
    } else if (['why_choose_us', 'basics.whyChooseUs', 'answers.whyChooseYou'].includes(fieldKey)) {
      updateData.whyChooseUs = String(value || '');
    } else if (['brand_feeling', 'basics.brandFeeling', 'answers.whyTrustYou'].includes(fieldKey)) {
      updateData.brandFeeling = String(value || '');
    } else if (['persona', 'audience_archetype', 'selectedAudience'].includes(fieldKey)) {
      updateData.audienceArchetype = Array.isArray(value) ? value.join(', ') : String(value || '');
    } else if (fieldKey === 'sliders' && Array.isArray(value)) {
      updateData.sliders = value;
    } else if (fieldKey.startsWith('slider.')) {
      const sliderKey = fieldKey.replace('slider.', '');
      const discovery = await ProjectDiscovery.findOne({ projectId });
      const sliders = ((discovery?.sliders as any[]) || []).map((s: any) => ({ ...s }));
      const idx = sliders.findIndex((s: any) => s.sliderKey === sliderKey || s.slider_key === sliderKey);
      if (idx >= 0) {
        sliders[idx].value = Number(value);
      } else {
        sliders.push({ sliderKey, value: Number(value), leftLabel: '', rightLabel: '' });
      }
      updateData.sliders = sliders;
    } else if (['emotions', 'selectedEmotions'].includes(fieldKey) && Array.isArray(value)) {
      updateData.emotions = value.map((e: any) => (typeof e === 'string' ? e : e.emotion || ''));
    } else if (['comps', 'competitors'].includes(fieldKey) && Array.isArray(value)) {
      updateData.competitors = value;
    } else if (['styles', 'visual_styles', 'selectedVisual'].includes(fieldKey) && Array.isArray(value)) {
      updateData.visualStyles = value.map((v: any) => (typeof v === 'string' ? v : v.style || ''));
    }

    if (Object.keys(updateData).length > 0) {
      await ProjectDiscovery.findOneAndUpdate(
        { projectId },
        { $set: updateData },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.error('Failed to persist draft field in FIELD_SYNC:', err);
  }
}

/**
 * Broadcasts a help request notification to consultant and project room
 */
export function broadcastHelpRequested(
  projectId: string,
  consultantId: string,
  payload: {
    project_id: string;
    project_title: string;
    client_name: string;
    portal_token: string;
    page_id: string;
    field_key: string;
    question: string;
    requested_at: string;
  }
) {
  ACTIVE_HELP_SESSIONS[projectId] = {
    page_id: payload.page_id,
    field_key: payload.field_key,
    question: payload.question,
    is_active: true,
    requested_at: payload.requested_at,
  };

  const broadcastMsg = JSON.stringify({
    type: 'NOTIFICATION_HELP_REQUESTED',
    ...payload,
  });

  // Send to project room
  projectSockets.get(projectId)?.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(broadcastMsg);
    }
  });

  // Send to consultant channel
  consultantSockets.get(consultantId)?.forEach((cws) => {
    if (cws.readyState === WebSocket.OPEN) {
      cws.send(broadcastMsg);
    }
  });
}

/**
 * Broadcasts a help resolved event to project room
 */
export function broadcastHelpResolved(
  projectId: string,
  payload: {
    project_id: string;
    page_id: string;
    resolved_by: string;
  }
) {
  if (ACTIVE_HELP_SESSIONS[projectId]) {
    ACTIVE_HELP_SESSIONS[projectId].is_active = false;
  }

  const resolveMsg = JSON.stringify({
    type: 'HELP_RESOLVED',
    ...payload,
  });

  projectSockets.get(projectId)?.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(resolveMsg);
    }
  });
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const rawPath = url.parse(request.url || '').pathname || '';
    const normalizedPath = rawPath.replace(/\/+$/, '') || '/';

    // Route matching for /ws/support/consultant and /ws/support/:portal_token
    if (
      normalizedPath === '/ws/support/consultant' ||
      normalizedPath.startsWith('/ws/support/')
    ) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    const parsedUrl = url.parse(request.url || '', true);
    const normalizedPath = (parsedUrl.pathname || '').replace(/\/+$/, '');
    const query = parsedUrl.query;
    const cookies = parseCookies(request.headers.cookie);

    // =========================================================================
    // 1. CONSULTANT NOTIFICATION CHANNEL (/ws/support/consultant)
    // =========================================================================
    if (normalizedPath === '/ws/support/consultant') {
      let rawToken = (query.token as string) || (query.consultant_token as string);
      if (!rawToken || rawToken === 'active') {
        rawToken =
          cookies[ENV.AUTH_ACCESS_COOKIE_NAME] ||
          cookies['floxa_access'] ||
          cookies['access'] ||
          cookies['jwt'];
      }

      const consultantId = verifyConsultantToken(rawToken);
      if (!consultantId) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: 'Authentication credentials required. Connection rejected.',
          })
        );
        ws.close(4001);
        return;
      }

      const consultant = await Consultant.findById(consultantId);

      if (!consultant || !consultant.isActive) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: 'Authentication credentials required. Connection rejected.',
          })
        );
        ws.close(4001);
        return;
      }

      if (!consultantSockets.has(consultantId)) {
        consultantSockets.set(consultantId, new Set());
      }
      consultantSockets.get(consultantId)!.add(ws);

      ws.send(
        JSON.stringify({
          type: 'CONSULTANT_READY',
          consultant_id: consultant.id,
          consultant_name: consultant.name || consultant.email,
        })
      );

      ws.on('message', async (message: string) => {
        try {
          const content = JSON.parse(message.toString());
          if (content.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
          } else if (content.type === 'WEBRTC_SIGNAL') {
            const action = content.action;
            if (!VALID_WEBRTC_ACTIONS.has(action)) return;

            const projectId = content.project_id;
            if (!projectId) return;

            // Drop oversized payloads (> 64KB)
            const payloadStr = JSON.stringify(content.data || {});
            if (payloadStr.length > 65536) return;

            // Verify consultant owns this project
            const project = await Project.findOne({
              _id: projectId,
              consultantId: consultant.id,
              isArchived: false,
            });
            if (!project) return;

            const signalPayload = JSON.stringify({
              type: 'WEBRTC_SIGNAL',
              action,
              sender_role: 'consultant',
              project_id: project.id,
              portal_token: project.portalToken,
              data: content.data || {},
            });

            // Route to project room
            projectSockets.get(project.id)?.forEach((c) => {
              if (c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(signalPayload);
              }
            });

            // Global call state broadcast for call lifecycle actions
            if (['call_accept', 'call_reject', 'call_end', 'call_cancel'].includes(action)) {
              consultantSockets.get(consultant.id)?.forEach((cws) => {
                if (cws !== ws && cws.readyState === WebSocket.OPEN) {
                  cws.send(signalPayload);
                }
              });
            }
          }
        } catch {}
      });

      ws.on('close', () => {
        const set = consultantSockets.get(consultantId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            consultantSockets.delete(consultantId);
          }
        }
      });

      return;
    }

    // =========================================================================
    // 2. PROJECT SUPPORT ROOM (/ws/support/:portal_token)
    // =========================================================================
    const parts = normalizedPath.split('/');
    const portalToken = parts[parts.length - 1];

    if (!portalToken) {
      ws.close(4004);
      return;
    }

    const project = await Project.findOne({
      portalToken,
      isArchived: false,
    }).populate('client');

    if (!project) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Project not found' }));
      ws.close(4004);
      return;
    }

    // Determine role and authenticate
    let role: 'client' | 'consultant' = 'client';
    let consultantId: string | null = null;

    const consultantToken =
      (query.consultant_token as string) ||
      (query.token as string) ||
      cookies[ENV.AUTH_ACCESS_COOKIE_NAME] ||
      cookies['floxa_access'] ||
      cookies['access'] ||
      cookies['jwt'];

    if (consultantToken) {
      consultantId = verifyConsultantToken(consultantToken);
      if (consultantId) {
        const ownerId = String(project.consultantId || '');
        if (consultantId !== ownerId) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Permission denied' }));
          ws.close(4003);
          return;
        }
        role = 'consultant';
      }
    }

    // If client, verify portal password access credentials if project is password-protected
    if (role === 'client' && project.portalPasswordHash) {
      const signedAccess =
        cookies[ENV.PORTAL_ACCESS_COOKIE_NAME] ||
        (query.portal_access_token as string) ||
        (query.access_token as string);

      const verified = unsignPortalAccessToken(signedAccess, ENV.PORTAL_ACCESS_MAX_AGE);
      if (verified !== portalToken) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Portal password verification required' }));
        ws.close(4003);
        return;
      }
    }

    const clientConn: ClientConnection = {
      ws,
      role,
      userId: consultantId || undefined,
      projectId: project.id,
      portalToken,
    };

    if (!projectSockets.has(project.id)) {
      projectSockets.set(project.id, new Set());
    }
    projectSockets.get(project.id)!.add(clientConn);

    if (role === 'consultant' && consultantId) {
      if (!consultantSockets.has(consultantId)) {
        consultantSockets.set(consultantId, new Set());
      }
      consultantSockets.get(consultantId)!.add(ws);
    }

    // Initial state sync - rehydrate from DB if not in memory
    let currentHelp: ActiveHelpSession | null = ACTIVE_HELP_SESSIONS[project.id];
    if (!currentHelp || !currentHelp.is_active) {
      currentHelp = await getLatestActiveHelp(project.id);
    }

    ws.send(
      JSON.stringify({
        type: 'INITIAL_STATE',
        role,
        project_id: project.id,
        project_title: project.title,
        active_help: currentHelp && currentHelp.is_active ? currentHelp : null,
      })
    );

    ws.on('message', async (rawMessage: string) => {
      try {
        const content = JSON.parse(rawMessage.toString());
        const msgType = content.type;
        const currentProjectId = clientConn.projectId;

        // Verify project is still active (not archived)
        const currentProject = await Project.findOne({
          _id: currentProjectId,
          isArchived: false,
        }).populate('client');

        if (!currentProject) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Project not found' }));
          ws.close(4004);
          return;
        }

        if (msgType === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
          return;
        }

        // 1. CLIENT REQUESTS HELP
        if (msgType === 'CLIENT_REQUEST_HELP') {
          const pageId = String(content.page_id || 'Step 1');
          const fieldKey = String(content.field_key || '');
          const question = String(content.question || 'Client requested assistance on this step.');

          const helpSession: ActiveHelpSession = {
            page_id: pageId,
            field_key: fieldKey,
            question,
            is_active: true,
            requested_at: new Date().toISOString(),
          };
          ACTIVE_HELP_SESSIONS[currentProjectId] = helpSession;

          const clientDisplayName =
            currentProject.client?.name || currentProject.companyName || 'Client';

          const consId = String(currentProject.consultantId || '');

          await logProjectActivity({
            projectId: currentProjectId,
            consultantId: consId,
            actorType: 'client',
            action: 'client_help_requested',
            description: `${clientDisplayName} requested help on ${pageId}: "${question}"`,
            metadata: {
              page_id: pageId,
              field_key: fieldKey,
              question,
              portal_token: currentProject.portalToken,
              project_id: currentProject.id,
            },
            visibleToClient: true,
          });

          broadcastHelpRequested(currentProjectId, consId, {
            project_id: currentProjectId,
            project_title: currentProject.title,
            client_name: clientDisplayName,
            portal_token: currentProject.portalToken,
            page_id: pageId,
            field_key: fieldKey,
            question,
            requested_at: helpSession.requested_at,
          });
        }

        // 2. RESOLVE HELP
        else if (msgType === 'RESOLVE_HELP') {
          const pageId = String(content.page_id || '');
          if (ACTIVE_HELP_SESSIONS[currentProjectId]) {
            ACTIVE_HELP_SESSIONS[currentProjectId].is_active = false;
          }

          const consId = String(currentProject.consultantId || '');

          await logProjectActivity({
            projectId: currentProjectId,
            consultantId: consId,
            actorType: role === 'consultant' ? 'consultant' : 'client',
            action: 'client_help_resolved',
            description: `Help session on ${pageId || 'step'} resolved.`,
            metadata: { page_id: pageId },
            visibleToClient: true,
          });

          broadcastHelpResolved(currentProjectId, {
            project_id: currentProjectId,
            page_id: pageId,
            resolved_by: role,
          });
        }

        // 3. FIELD SYNC (CO-EDITING)
        else if (msgType === 'FIELD_SYNC') {
          const pageId = String(content.page_id || '');
          const fieldKey = String(content.field_key || '');
          const value = content.value;

          // Security check 1: Workflow page validation
          if (!ALLOWED_PAGE_PATTERN.test(pageId)) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_PAGE',
                message: 'Invalid or forbidden workflow page.',
              })
            );
            return;
          }

          // Security check 2: Field key whitelist
          if (!isAllowedFieldKey(fieldKey)) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_FIELD',
                message: 'Invalid or forbidden field key.',
              })
            );
            return;
          }

          // Security check 3: If consultant is typing, verify active help on this page
          if (role === 'consultant') {
            let activeSession: ActiveHelpSession | null | undefined = ACTIVE_HELP_SESSIONS[currentProjectId];
            if (!activeSession || !activeSession.is_active) {
              activeSession = await getLatestActiveHelp(currentProjectId);
            }

            const sessionPage = (activeSession?.page_id || '').toLowerCase();
            const curPage = pageId.toLowerCase();
            const isMatch =
              Boolean(activeSession?.is_active) &&
              (sessionPage === curPage ||
                (curPage && sessionPage.includes(curPage)) ||
                (sessionPage && curPage.includes(sessionPage)) ||
                [1, 2, 3, 4, 5, 6, 7, 8, 9].some(
                  (n) =>
                     (sessionPage.includes(`step ${n}`) || sessionPage.includes(`frame_${n}`)) &&
                     (curPage.includes(`step ${n}`) || curPage.includes(`frame_${n}`))
                ));

            if (!activeSession || !activeSession.is_active || !isMatch) {
              ws.send(
                JSON.stringify({
                  type: 'ERROR',
                  code: 'PERMISSION_DENIED',
                  message: 'Consultant can only edit fields on the page where client requested help.',
                })
              );
              return;
            }
          }

          // Broadcast to other sockets in this project room
          const syncMsg = JSON.stringify({
            type: 'FIELD_SYNC',
            page_id: pageId,
            field_key: fieldKey,
            value,
            sender_role: role,
          });

          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(syncMsg);
            }
          });

          // Persist draft changes into MongoDB
          await persistDraftField(currentProjectId, fieldKey, value);
        }

        // 4. STEP NAVIGATION SYNCHRONIZATION
        else if (msgType === 'STEP_NAVIGATE') {
          const step = Number(content.step);
          const pageId = String(content.page_id || `Step ${step}`);

          const navMsg = JSON.stringify({
            type: 'STEP_NAVIGATE',
            step,
            page_id: pageId,
            sender_role: role,
          });

          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(navMsg);
            }
          });
        }

        // 5. CONSULTANT JOINED ANNOUNCEMENT
        else if (msgType === 'CONSULTANT_JOINED') {
          let consultantName = 'Consultant';
          if (role === 'consultant' && consultantId) {
            const cons = await Consultant.findById(consultantId);
            if (cons) consultantName = cons.name || cons.email;
          }

          const joinMsg = JSON.stringify({
            type: 'CONSULTANT_JOINED',
            consultant_name: consultantName,
            page_id: content.page_id,
          });

          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(joinMsg);
            }
          });
        }

        // 6. WEBRTC VIDEO CALL SIGNALING
        else if (msgType === 'WEBRTC_SIGNAL') {
          const action = content.action;
          if (!VALID_WEBRTC_ACTIONS.has(action)) return;

          const dataPayload = content.data || {};
          if (JSON.stringify(dataPayload).length > 65536) return;

          const signalMsg = JSON.stringify({
            type: 'WEBRTC_SIGNAL',
            action,
            sender_role: role,
            project_id: currentProjectId,
            portal_token: currentProject.portalToken,
            client_name: currentProject.client?.name || currentProject.companyName || 'Client',
            project_title: currentProject.title,
            data: dataPayload,
          });

          // Peer media signals send to project room
          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(signalMsg);
            }
          });

          // Call lifecycle events notify the consultant globally
          if (
            role === 'client' &&
            ['call_initiate', 'call_end', 'call_reject', 'call_cancel'].includes(action)
          ) {
            const consId = String(currentProject.consultantId || '');
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(signalMsg);
              }
            });
          }
        }
      } catch (err) {
        console.error('Error handling support room message:', err);
      }
    });

    ws.on('close', () => {
      const set = projectSockets.get(project.id);
      if (set) {
        set.delete(clientConn);
        if (set.size === 0) {
          projectSockets.delete(project.id);
        }
      }

      if (role === 'consultant' && consultantId) {
        const cset = consultantSockets.get(consultantId);
        if (cset) {
          cset.delete(ws);
          if (cset.size === 0) {
            consultantSockets.delete(consultantId);
          }
        }
      }
    });
  });
}
