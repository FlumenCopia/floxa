import { storage } from './storage';
import { API_BASE_URL } from './api';

type SocketEventHandler = (data: any) => void;

class FloxaSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<SocketEventHandler>> = new Map();
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;
  private currentProjectId: string | null = null;

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;

    Promise.all([
      storage.getItem(storage.KEYS.ACCESS_TOKEN),
      storage.getItem(storage.KEYS.PORTAL_TOKEN),
      storage.getItem(storage.KEYS.USER_ROLE),
    ]).then(([token, portalToken, role]) => {
      // Convert HTTP(S) API URL to WS(S) URL
      const wsBase = API_BASE_URL.replace(/^http/i, 'ws').replace(/\/api\/?$/, '');
      let wsUrl = '';

      if (role === 'client' && portalToken) {
        wsUrl = `${wsBase}/ws/support/${encodeURIComponent(portalToken)}/`;
      } else if (token) {
        wsUrl = `${wsBase}/ws/support/consultant/?token=${encodeURIComponent(token)}`;
      } else {
        return;
      }

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.emit('connection_status', { status: 'connected' });
          if (this.currentProjectId) {
            this.joinProject(this.currentProjectId);
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const eventType = payload.type || payload.action || 'message';
            this.emit(eventType, payload);
          } catch {
            // Non-JSON message ignore
          }
        };

        this.ws.onclose = () => {
          this.emit('connection_status', { status: 'disconnected' });
          this.ws = null;
          if (!this.isExplicitlyClosed) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = () => {
          this.emit('connection_status', { status: 'error' });
        };
      } catch {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 4000);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public joinProject(projectId: string): void {
    this.currentProjectId = projectId;
    this.send({
      type: 'JOIN_PROJECT',
      project_id: projectId,
    });
  }

  public sendChatMessage(
    projectId: string,
    text: string,
    attachment?: {
      url?: string;
      type?: string;
      name?: string;
      duration?: number;
    }
  ): void {
    const isImage = attachment?.type?.startsWith('image');
    const isVoice = attachment?.type?.startsWith('audio');
    const messageType = isImage ? 'image' : isVoice ? 'voice' : attachment?.url ? 'file' : 'text';

    this.send({
      type: 'CHAT_MESSAGE_SEND',
      projectId,
      project_id: projectId,
      text: text || '',
      messageType,
      mediaUrl: attachment?.url || null,
      mediaMimeType: attachment?.type || null,
      fileName: attachment?.name || null,
      mediaDuration: attachment?.duration || null,
      attachment,
    });
  }

  public sendTyping(projectId: string, isTyping: boolean): void {
    this.send({
      type: 'TYPING_INDICATOR',
      project_id: projectId,
      is_typing: isTyping,
    });
  }

  public sendWebRTCSignal(action: string, projectId: string, data?: any): void {
    this.send({
      type: 'WEBRTC_SIGNAL',
      action,
      project_id: projectId,
      data: data || {},
    });
  }

  public send(payload: object): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public on(event: string, handler: SocketEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unbind function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.warn('Socket listener error:', err);
      }
    });
  }
}

export const socketService = new FloxaSocketService();
