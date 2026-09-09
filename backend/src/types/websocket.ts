import type { WebSocket } from 'ws';

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

export interface WSIncomingMessage {
  type?: string;
  payload?: Record<string, unknown>;
  action?: string;
  candidate?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

export interface WSFieldSyncPayload {
  page_id?: string;
  field_key?: string;
  value?: unknown;
  user_type?: 'client' | 'consultant';
}
