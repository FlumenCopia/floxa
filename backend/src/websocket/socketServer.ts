// Note: Single-instance in-memory connection registry for local parity.
// In a multi-instance deployment, use a shared pub/sub adapter (such as Redis).

import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import url from 'url';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Consultant, Project, ProjectDiscovery, ProjectActivity, Moodboard, Concept, ChatMessage } from '../models/index.js';
import { ENV } from '../config/env.js';
import { logProjectActivity, onActivityCreated } from '../services/project.service.js';
import { serializeProjectActivity, serializeClientPortalActivity } from '../utils/serializer.js';
import { unsignPortalAccessToken } from '../utils/crypto.js';
import { resolveSafeMediaPath, getMimeType } from '../services/storage.service.js';
import { notifyConsultant, notifyClient } from '../services/pushNotification.service.js';

export interface ClientConnection {
  ws: WebSocket;
  role: 'client' | 'consultant';
  userId?: string;
  consultantId?: string;
  projectId: string;
  portalToken: string;
}

export interface CachedProjectMeta {
  id: string;
  consultantId: string;
  clientName: string;
  projectTitle: string;
  portalToken: string;
  isArchived: boolean;
  cachedAt: number;
}

export const PROJECT_META_CACHE = new Map<string, CachedProjectMeta>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function getOrFetchProjectMeta(
  projectId: string,
  forceRefresh = false
): Promise<CachedProjectMeta | null> {
  const cached = PROJECT_META_CACHE.get(projectId);
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const proj = await Project.findOne({ _id: projectId, isArchived: false }).populate('client');
  if (!proj) {
    PROJECT_META_CACHE.delete(projectId);
    return null;
  }

  const meta: CachedProjectMeta = {
    id: proj.id,
    consultantId: String(proj.consultantId || ''),
    clientName: (proj.client as any)?.name || proj.companyName || 'Client',
    projectTitle: proj.title,
    portalToken: proj.portalToken,
    isArchived: proj.isArchived || false,
    cachedAt: now,
  };
  PROJECT_META_CACHE.set(projectId, meta);
  return meta;
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

export function isProjectClientOnline(projectId: string): boolean {
  const conns = projectSockets.get(projectId);
  if (!conns) return false;
  return Array.from(conns).some(
    (c) => c.role === 'client' && c.ws.readyState === WebSocket.OPEN
  );
}

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
    const cleanToken = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken;
    const payload = jwt.verify(cleanToken, ENV.JWT_ACCESS_SECRET) as { userId?: string; id?: string };
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
  },
  consultantId?: string
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

  if (consultantId && consultantSockets.has(consultantId)) {
    consultantSockets.get(consultantId)?.forEach((cws) => {
      if (cws.readyState === WebSocket.OPEN) {
        cws.send(resolveMsg);
      }
    });
  }
}

/**
 * Broadcasts project read event to consultant sockets and deactivates active help
 */
export function broadcastProjectRead(projectId: string, consultantId?: string) {
  if (ACTIVE_HELP_SESSIONS[projectId]) {
    ACTIVE_HELP_SESSIONS[projectId].is_active = false;
  }

  const payload = JSON.stringify({
    type: 'PROJECT_READ',
    projectId,
    project_id: projectId,
  });

  if (consultantId && consultantSockets.has(consultantId)) {
    consultantSockets.get(consultantId)?.forEach((cws) => {
      if (cws.readyState === WebSocket.OPEN) {
        cws.send(payload);
      }
    });
  } else {
    consultantSockets.forEach((sockets) => {
      sockets.forEach((cws) => {
        if (cws.readyState === WebSocket.OPEN) {
          cws.send(payload);
        }
      });
    });
  }
}

/**
 * Broadcasts a live activity notification to consultant and/or client project room
 */
export async function broadcastActivityNotification(activityDoc: any) {
  try {
    const consultantId = activityDoc.consultantId ? String(activityDoc.consultantId) : '';
    const projectId = activityDoc.projectId ? String(activityDoc.projectId) : '';
    const visibleToClient = Boolean(activityDoc.visibleToClient);

    // Populate project if needed for title / company name
    let project = null;
    if (projectId) {
      project = await Project.findById(projectId).select('title companyName portalToken');
    }

    const activityObj = activityDoc.toObject ? activityDoc.toObject() : { ...activityDoc };
    if (project) {
      activityObj.project = project;
    }

    // Track WebSockets that have already been sent to avoid duplicate sends across shared consultant/project connections
    const sentSockets = new Set<WebSocket>();

    // 1. Send to Consultant
    if (consultantId && consultantSockets.has(consultantId)) {
      const consultantPayload = JSON.stringify({
        type: 'NOTIFICATION_NEW',
        activity: serializeProjectActivity(activityObj),
      });

      consultantSockets.get(consultantId)?.forEach((cws) => {
        if (cws.readyState === WebSocket.OPEN && !sentSockets.has(cws)) {
          cws.send(consultantPayload);
          sentSockets.add(cws);
        }
      });
    }

    // 2. Send to Client Portal Room if visible to client
    if (visibleToClient && projectId && projectSockets.has(projectId)) {
      const clientPayload = JSON.stringify({
        type: 'NOTIFICATION_NEW',
        activity: serializeClientPortalActivity(activityObj),
      });

      projectSockets.get(projectId)?.forEach((clientConn) => {
        if (clientConn.ws.readyState === WebSocket.OPEN && !sentSockets.has(clientConn.ws)) {
          clientConn.ws.send(clientPayload);
          sentSockets.add(clientConn.ws);
        }
      });
    }
  } catch (err) {
    console.error('[SocketServer] Error broadcasting new activity notification:', err);
  }
}

// Subscribe to activity service event hook
onActivityCreated((activity) => {
  broadcastActivityNotification(activity);
});

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

      // If a consultant_id was explicitly supplied in query, ensure it matches the verified token identity
      if (query.consultant_id) {
        const requestedId = Array.isArray(query.consultant_id)
          ? query.consultant_id[0]
          : String(query.consultant_id);
        if (requestedId !== String(consultantId)) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              message: 'Authentication credentials required. Connection rejected.',
            })
          );
          ws.close(4001);
          return;
        }
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
            if (!projectId || !mongoose.isValidObjectId(projectId)) return;

            // Drop oversized payloads (> 64KB)
            const payloadStr = JSON.stringify(content.data || {});
            if (payloadStr.length > 65536) return;

            // Use fast-path cached metadata for high-frequency media negotiation (ICE candidates, offer, answer)
            const isFastPath = ['ice_candidate', 'offer', 'answer'].includes(action);
            const project = await getOrFetchProjectMeta(projectId, !isFastPath);
            if (!project || project.consultantId !== consultant.id || project.isArchived) return;

            // Check if client is online when consultant initiates a call
            if (action === 'call_initiate') {
              const clientConns = projectSockets.get(project.id);
              const hasConnectedClient =
                clientConns &&
                Array.from(clientConns).some(
                  (c) => c.role === 'client' && c.ws.readyState === WebSocket.OPEN
                );

              if (!hasConnectedClient) {
                notifyClient(project.portalToken, {
                  title: `Incoming ${content.data?.is_video ? 'Video' : 'Audio'} Call`,
                  body: `${project.projectTitle || 'Floxa'}: Consultant is calling you...`,
                  isCall: true,
                  data: { projectId: project.id, type: 'call' },
                }).catch(() => {});

                ws.send(
                  JSON.stringify({
                    type: 'WEBRTC_SIGNAL',
                    action: 'call_reject',
                    project_id: project.id,
                    data: { reason: 'Client is offline. A call notification was sent to their phone.' },
                  })
                );
                return;
              }
            }

            const signalPayload = JSON.stringify({
              type: 'WEBRTC_SIGNAL',
              action,
              sender_role: 'consultant',
              project_id: project.id,
              portal_token: project.portalToken,
              client_name: project.clientName || 'Client',
              project_title: project.projectTitle,
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
          } else if (content.type === 'CHAT_MESSAGE_SEND' || content.type === 'CHAT_MESSAGE') {
            const projectId = content.projectId || content.project_id;
            const text = String(content.text || '').trim();
            const mediaUrl = content.mediaUrl ? String(content.mediaUrl) : null;
            const messageType = ['text', 'voice', 'image', 'file'].includes(content.messageType)
              ? content.messageType
              : (mediaUrl ? 'file' : 'text');
            const mediaMimeType = content.mediaMimeType ? String(content.mediaMimeType) : null;
            const mediaDuration = typeof content.mediaDuration === 'number'
              ? content.mediaDuration
              : (content.duration ? Number(content.duration) : null);
            const fileName = content.fileName ? String(content.fileName) : null;
            const fileSize = typeof content.fileSize === 'number' ? content.fileSize : null;
            const clientTempId = content.clientTempId || content.tempId || null;

            if (!projectId || (!text && !mediaUrl) || text.length > 5000) return;
            if (!mongoose.isValidObjectId(projectId)) return;

            const project = await Project.findOne({ _id: projectId, consultantId: consultant.id, isArchived: false });
            if (!project) return;

            const clientConns = projectSockets.get(project.id);
            const isClientOnline = Boolean(
              clientConns && Array.from(clientConns).some((c) => c.role === 'client' && c.ws.readyState === WebSocket.OPEN)
            );

            const chatMsg = await ChatMessage.create({
              projectId: project.id,
              consultantId: consultant.id,
              senderRole: 'consultant',
              senderName: consultant.name || 'Consultant',
              text,
              messageType,
              mediaUrl,
              mediaMimeType,
              mediaDuration,
              fileName,
              fileSize,
              status: isClientOnline ? 'delivered' : 'sent',
              clientTempId,
              createdAt: new Date(),
            });

            if (!isClientOnline) {
              notifyClient(project.portalToken, {
                title: project.title || 'New Message',
                body: `${consultant.name || 'Consultant'}: ${text || 'Sent an attachment'}`,
                data: { projectId: project.id, type: 'chat' },
              }).catch(() => {});
            }

            const chatPayload = JSON.stringify({
              type: 'CHAT_MESSAGE_NEW',
              message: {
                id: chatMsg.id,
                projectId: project.id,
                senderRole: chatMsg.senderRole,
                senderName: chatMsg.senderName,
                text: chatMsg.text,
                messageType: chatMsg.messageType,
                mediaUrl: chatMsg.mediaUrl,
                mediaMimeType: chatMsg.mediaMimeType,
                mediaDuration: chatMsg.mediaDuration,
                fileName: chatMsg.fileName,
                fileSize: chatMsg.fileSize,
                status: chatMsg.status,
                clientTempId: chatMsg.clientTempId,
                createdAt: chatMsg.createdAt,
              },
            });

            projectSockets.get(project.id)?.forEach((c) => {
              if (c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(chatPayload);
              }
            });

            consultantSockets.get(consultant.id)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(chatPayload);
              }
            });
          } else if (content.type === 'CHAT_TYPING') {
            const projectId = content.projectId || content.project_id;
            const isTyping = Boolean(content.isTyping);
            if (!projectId || !mongoose.isValidObjectId(projectId)) return;

            const typingPayload = JSON.stringify({
              type: 'CHAT_TYPING',
              projectId,
              senderRole: 'consultant',
              isTyping,
            });

            projectSockets.get(projectId)?.forEach((c) => {
              if (c.ws.readyState === WebSocket.OPEN && c.role === 'client') {
                c.ws.send(typingPayload);
              }
            });
          } else if (content.type === 'CHAT_MESSAGES_READ') {
            const projectId = content.projectId || content.project_id;
            if (!projectId || !mongoose.isValidObjectId(projectId)) return;

            const now = new Date();
            await ChatMessage.updateMany(
              { projectId, senderRole: 'client', status: { $ne: 'read' } },
              { $set: { status: 'read', readAt: now } }
            );

            const readPayload = JSON.stringify({
              type: 'CHAT_MESSAGES_READ',
              projectId,
              readBy: 'consultant',
              readAt: now,
            });

            projectSockets.get(projectId)?.forEach((c) => {
              if (c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(readPayload);
              }
            });

            consultantSockets.get(consultant.id)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(readPayload);
              }
            });
          } else if (content.type === 'PROJECT_READ') {
            const projectId = content.projectId || content.project_id;
            if (projectId) {
              broadcastProjectRead(String(projectId), consultant.id);
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

    // Only authenticate as consultant if explicitly requested via query parameter
    // This prevents client portal tabs from being misclassified as consultants due to background cookies
    const explicitConsultantToken =
      (query.consultant_token as string) ||
      (query.role === 'consultant' ? (query.token as string) : null) ||
      (query.mode === 'consultant' ? (query.token as string) : null);

    if (explicitConsultantToken) {
      let rawToken = explicitConsultantToken;
      if (rawToken === 'active') {
        rawToken =
          cookies[ENV.AUTH_ACCESS_COOKIE_NAME] ||
          cookies['floxa_access'] ||
          cookies['access'] ||
          cookies['jwt'] ||
          '';
      }
      consultantId = verifyConsultantToken(rawToken);
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

      if (signedAccess) {
        const verified = unsignPortalAccessToken(signedAccess, ENV.PORTAL_ACCESS_MAX_AGE);
        if (verified && verified !== portalToken) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Portal password verification required' }));
          ws.close(4003);
          return;
        }
      }
    }

    PROJECT_META_CACHE.set(project.id, {
      id: project.id,
      consultantId: String(project.consultantId || ''),
      clientName: (project.client as any)?.name || project.companyName || 'Client',
      projectTitle: project.title,
      portalToken: project.portalToken,
      isArchived: project.isArchived || false,
      cachedAt: Date.now(),
    });

    const clientConn: ClientConnection = {
      ws,
      role,
      userId: consultantId || undefined,
      consultantId: consultantId || undefined,
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

    if (role === 'client') {
      const now = new Date();
      Project.updateOne({ _id: project.id }, { $set: { clientLastSeenAt: now } }).catch(() => {});
      const consId = String(project.consultantId || '');
      if (consId) {
        const presencePayload = JSON.stringify({
          type: 'CLIENT_PRESENCE',
          projectId: project.id,
          isOnline: true,
          lastSeen: now.toISOString(),
        });
        consultantSockets.get(consId)?.forEach((cws) => {
          if (cws.readyState === WebSocket.OPEN) {
            cws.send(presencePayload);
          }
        });
      }
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

        // Immediate zero-latency response for heartbeat PING
        if (msgType === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
          return;
        }

        const currentProjectId = clientConn.projectId;

        // Fast path for high-frequency WebRTC media negotiation (ICE candidates, offer, answer)
        const isFastPathSignal =
          msgType === 'WEBRTC_SIGNAL' && ['ice_candidate', 'offer', 'answer'].includes(content.action);

        let currentProject: CachedProjectMeta | null = null;
        if (isFastPathSignal) {
          currentProject = await getOrFetchProjectMeta(currentProjectId, false);
        } else {
          // Full verification for lifecycle actions and project state
          const dbProj = await Project.findOne({
            _id: currentProjectId,
            isArchived: false,
          }).populate('client');

          if (dbProj) {
            currentProject = {
              id: dbProj.id,
              consultantId: String(dbProj.consultantId || ''),
              clientName: (dbProj.client as any)?.name || dbProj.companyName || 'Client',
              projectTitle: dbProj.title,
              portalToken: dbProj.portalToken,
              isArchived: dbProj.isArchived || false,
              cachedAt: Date.now(),
            };
            PROJECT_META_CACHE.set(currentProjectId, currentProject);
          }
        }

        if (!currentProject || currentProject.isArchived) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Project not found' }));
          ws.close(4004);
          return;
        }

        // 0. CLIENT REQUESTS PROTECTED ASSET STREAM (Concealed from Network tab, zero HTTP requests)
        if (msgType === 'GET_PROTECTED_ASSET') {
          const assetType = String(content.asset_type || content.assetType || '');
          const assetId = String(content.asset_id || content.assetId || '');

          let targetFilePath: string | null = null;
          if (assetType === 'moodboard') {
            const mb = await Moodboard.findOne({
              _id: assetId,
              projectId: currentProjectId,
              isShared: true,
            });
            if (mb) {
              targetFilePath = mb.watermarkImage || mb.image;
            }
          } else if (assetType === 'concept') {
            const cp = await Concept.findOne({
              _id: assetId,
              projectId: currentProjectId,
              status: { $in: ['shared', 'approved', 'changes_requested'] },
            });
            if (cp) {
              targetFilePath = cp.watermarkImage || cp.image;
            }
          }

          if (!targetFilePath) {
            ws.send(JSON.stringify({
              type: 'ASSET_STREAM_ERROR',
              asset_id: assetId,
              error: 'Asset not found',
            }));
            return;
          }

          try {
            let fileBuffer: Buffer | null = null;
            let mimeType = 'image/jpeg';

            if (targetFilePath.startsWith('http://') || targetFilePath.startsWith('https://')) {
              const resp = await fetch(targetFilePath);
              if (!resp.ok) throw new Error('Blob fetch failed');
              const arr = await resp.arrayBuffer();
              fileBuffer = Buffer.from(arr);
              mimeType = resp.headers.get('content-type') || 'image/jpeg';
            } else {
              const safePath = resolveSafeMediaPath(targetFilePath);
              if (!safePath || !fs.existsSync(safePath)) {
                ws.send(JSON.stringify({
                  type: 'ASSET_STREAM_ERROR',
                  asset_id: assetId,
                  error: 'Asset file not found',
                }));
                return;
              }
              fileBuffer = await fs.promises.readFile(safePath);
              mimeType = getMimeType(safePath);
            }

            const base64Data = fileBuffer.toString('base64');
            ws.send(JSON.stringify({
              type: 'ASSET_STREAM_DATA',
              asset_id: assetId,
              asset_type: assetType,
              mime_type: mimeType,
              data: `data:${mimeType};base64,${base64Data}`,
            }));
          } catch (err) {
            console.error('[SocketServer] Error streaming protected asset:', err);
            ws.send(JSON.stringify({
              type: 'ASSET_STREAM_ERROR',
              asset_id: assetId,
              error: 'Failed to stream asset',
            }));
          }
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

          const clientDisplayName = currentProject.clientName || 'Client';
          const consId = String(currentProject.consultantId || '');
          const description = `${clientDisplayName} requested help on ${pageId}: "${question}"`;

          // Deduplicate: ignore if an identical request was already logged within the last 5 seconds
          const recentDuplicate = await ProjectActivity.findOne({
            projectId: currentProjectId,
            action: 'client_help_requested',
            description,
            createdAt: { $gte: new Date(Date.now() - 5000) },
          });

          if (!recentDuplicate) {
            await logProjectActivity({
              projectId: currentProjectId,
              consultantId: consId,
              actorType: 'client',
              action: 'client_help_requested',
              description,
              metadata: {
                page_id: pageId,
                field_key: fieldKey,
                question,
                portal_token: currentProject.portalToken,
                project_id: currentProject.id,
              },
              visibleToClient: true,
            });
          }

          broadcastHelpRequested(currentProjectId, consId, {
            project_id: currentProjectId,
            project_title: currentProject.projectTitle,
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

          // Deduplicate: ignore if already resolved within the last 5 seconds
          const recentDuplicate = await ProjectActivity.findOne({
            projectId: currentProjectId,
            action: 'client_help_resolved',
            createdAt: { $gte: new Date(Date.now() - 5000) },
          });

          if (!recentDuplicate) {
            await logProjectActivity({
              projectId: currentProjectId,
              consultantId: consId,
              actorType: role === 'consultant' ? 'consultant' : 'client',
              action: 'client_help_resolved',
              description: `Help session on ${pageId || 'step'} resolved.`,
              metadata: { page_id: pageId },
              visibleToClient: true,
            });
          }

          broadcastHelpResolved(
            currentProjectId,
            {
              project_id: currentProjectId,
              page_id: pageId,
              resolved_by: role,
            },
            consId
          );
        }

        // 2b. PROJECT READ
        else if (msgType === 'PROJECT_READ') {
          const pId = content.projectId || content.project_id || currentProjectId;
          const projectConsId = String(currentProject?.consultantId || '');
          if (pId) {
            broadcastProjectRead(String(pId), projectConsId);
          }
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
          const frameData = content.frameData || content.data || null;

          const navMsg = JSON.stringify({
            type: 'STEP_NAVIGATE',
            step,
            page_id: pageId,
            frameData,
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

          // If client is calling consultant, check if consultant is online
          if (role === 'client' && action === 'call_initiate') {
            const consId = String(currentProject.consultantId || '');
            const consSockets = consultantSockets.get(consId);
            const projectRoomConns = projectSockets.get(currentProjectId);
            const hasConnectedConsultant =
              (consSockets && Array.from(consSockets).some((cws) => cws.readyState === WebSocket.OPEN)) ||
              (projectRoomConns && Array.from(projectRoomConns).some((c) => c.role === 'consultant' && c.ws.readyState === WebSocket.OPEN));

            if (!hasConnectedConsultant) {
              notifyConsultant(consId, {
                title: `Incoming ${dataPayload?.is_video ? 'Video' : 'Audio'} Call`,
                body: `${currentProject.clientName || 'Client'} is calling you for ${currentProject.projectTitle}...`,
                isCall: true,
                data: { projectId: currentProjectId, type: 'call' },
              }).catch(() => {});

              ws.send(
                JSON.stringify({
                  type: 'WEBRTC_SIGNAL',
                  action: 'call_reject',
                  project_id: currentProjectId,
                  portal_token: currentProject.portalToken,
                  data: { reason: 'Consultant is offline. A call notification was sent to their phone.' },
                })
              );
              return;
            }
          }

          const signalMsg = JSON.stringify({
            type: 'WEBRTC_SIGNAL',
            action,
            sender_role: role,
            project_id: currentProjectId,
            portal_token: currentProject.portalToken,
            client_name: currentProject.clientName || 'Client',
            project_title: currentProject.projectTitle,
            data: dataPayload,
          });

          // Peer media signals send to project room
          const projectRoomWs = new Set<WebSocket>();
          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(signalMsg);
              projectRoomWs.add(c.ws);
            }
          });

          // Route all WebRTC actions from client to assigned consultant
          if (role === 'client') {
            const consId = String(currentProject.consultantId || '');
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN && !projectRoomWs.has(cws)) {
                cws.send(signalMsg);
              }
            });
          }

          // If consultant acted inside the project room, update other consultant tabs on lifecycle changes
          if (
            role === 'consultant' &&
            consultantId &&
            ['call_accept', 'call_reject', 'call_end', 'call_cancel'].includes(action)
          ) {
            consultantSockets.get(consultantId)?.forEach((cws) => {
              if (cws !== ws && cws.readyState === WebSocket.OPEN && !projectRoomWs.has(cws)) {
                cws.send(signalMsg);
              }
            });
          }
        } else if (msgType === 'CHAT_MESSAGE_SEND' || msgType === 'CHAT_MESSAGE') {
          const text = String(content.text || '').trim();
          const mediaUrl = content.mediaUrl ? String(content.mediaUrl) : null;
          const messageType = ['text', 'voice', 'image', 'file'].includes(content.messageType)
            ? content.messageType
            : (mediaUrl ? 'file' : 'text');
          const mediaMimeType = content.mediaMimeType ? String(content.mediaMimeType) : null;
          const mediaDuration = typeof content.mediaDuration === 'number'
            ? content.mediaDuration
            : (content.duration ? Number(content.duration) : null);
          const fileName = content.fileName ? String(content.fileName) : null;
          const fileSize = typeof content.fileSize === 'number' ? content.fileSize : null;
          const clientTempId = content.clientTempId || content.tempId || null;

          if ((!text && !mediaUrl) || text.length > 5000) return;

          const consId = String(currentProject.consultantId || '');
          const isExplicitConsultant = content.senderRole === 'consultant' || Boolean(query.consultant_token);
          const senderRole: 'client' | 'consultant' = isExplicitConsultant ? 'consultant' : 'client';
          const senderName =
            senderRole === 'consultant'
              ? (content.senderName || 'Consultant')
              : (currentProject.clientName || 'Client');

          let isRecipientOnline = false;
          if (senderRole === 'client') {
            const consSockets = consultantSockets.get(consId);
            isRecipientOnline = Boolean(
              consSockets && Array.from(consSockets).some((s) => s.readyState === WebSocket.OPEN)
            );
          } else {
            const clientConns = projectSockets.get(currentProjectId);
            isRecipientOnline = Boolean(
              clientConns && Array.from(clientConns).some((c) => c.role === 'client' && c.ws.readyState === WebSocket.OPEN)
            );
          }

          const chatMsg = await ChatMessage.create({
            projectId: currentProjectId,
            consultantId: consId,
            senderRole,
            senderName,
            text,
            messageType,
            mediaUrl,
            mediaMimeType,
            mediaDuration,
            fileName,
            fileSize,
            status: isRecipientOnline ? 'delivered' : 'sent',
            clientTempId,
            createdAt: new Date(),
          });

          const chatPayload = JSON.stringify({
            type: 'CHAT_MESSAGE_NEW',
            message: {
              id: chatMsg.id,
              projectId: currentProjectId,
              senderRole: chatMsg.senderRole,
              senderName: chatMsg.senderName,
              text: chatMsg.text,
              messageType: chatMsg.messageType,
              mediaUrl: chatMsg.mediaUrl,
              mediaMimeType: chatMsg.mediaMimeType,
              mediaDuration: chatMsg.mediaDuration,
              fileName: chatMsg.fileName,
              fileSize: chatMsg.fileSize,
              status: chatMsg.status,
              clientTempId: chatMsg.clientTempId,
              createdAt: chatMsg.createdAt,
            },
          });

          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(chatPayload);
            }
          });

          if (consId) {
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(chatPayload);
              }
            });
          }
        } else if (msgType === 'CHAT_TYPING') {
          const isTyping = Boolean(content.isTyping);
          const typingRole: 'client' | 'consultant' =
            content.senderRole === 'consultant' || Boolean(query.consultant_token) ? 'consultant' : 'client';
          const typingPayload = JSON.stringify({
            type: 'CHAT_TYPING',
            projectId: currentProjectId,
            senderRole: typingRole,
            isTyping,
          });

          if (typingRole === 'client') {
            const consId = String(currentProject.consultantId || '');
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(typingPayload);
              }
            });
            projectSockets.get(currentProjectId)?.forEach((c) => {
              if (c.role === 'consultant' && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(typingPayload);
              }
            });
          } else {
            projectSockets.get(currentProjectId)?.forEach((c) => {
              if (c.role === 'client' && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(typingPayload);
              }
            });
          }
        } else if (msgType === 'CHAT_MESSAGES_READ') {
          const now = new Date();
          const readerRole: 'client' | 'consultant' =
            content.readBy === 'consultant' || Boolean(query.consultant_token) ? 'consultant' : 'client';
          const targetRole = readerRole === 'client' ? 'consultant' : 'client';
          await ChatMessage.updateMany(
            { projectId: currentProjectId, senderRole: targetRole, status: { $ne: 'read' } },
            { $set: { status: 'read', readAt: now } }
          );

          const readPayload = JSON.stringify({
            type: 'CHAT_MESSAGES_READ',
            projectId: currentProjectId,
            readBy: readerRole,
            readAt: now,
          });

          projectSockets.get(currentProjectId)?.forEach((c) => {
            if (c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(readPayload);
            }
          });

          const consId = String(currentProject.consultantId || '');
          if (consId) {
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(readPayload);
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

      if (role === 'client') {
        const remaining = Array.from(projectSockets.get(project.id) || []).filter(
          (c) => c.role === 'client' && c.ws.readyState === WebSocket.OPEN && c.ws !== ws
        );
        const isStillOnline = remaining.length > 0;
        const now = new Date();
        Project.updateOne({ _id: project.id }, { $set: { clientLastSeenAt: now } }).catch(() => {});
        if (!isStillOnline) {
          const consId = String(project.consultantId || '');
          if (consId) {
            const presencePayload = JSON.stringify({
              type: 'CLIENT_PRESENCE',
              projectId: project.id,
              isOnline: false,
              lastSeen: now.toISOString(),
            });
            consultantSockets.get(consId)?.forEach((cws) => {
              if (cws.readyState === WebSocket.OPEN) {
                cws.send(presencePayload);
              }
            });
          }
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
