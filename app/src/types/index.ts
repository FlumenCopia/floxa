export type UserRole = 'consultant' | 'client';

export interface ConsultantUser {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  avatar?: string | null;
  isActive: boolean;
  isStaff: boolean;
}

export interface ClientProjectUser {
  id: string;
  projectId: string;
  portalToken: string;
  clientName: string;
  projectTitle: string;
  companyName?: string;
  consultantName?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  user: ConsultantUser | ClientProjectUser | null;
  token: string | null;
  portalToken: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  clientName: string;
  companyName?: string;
  portalToken?: string;
  progress?: number;
  unreadCount?: number;
  updatedAt?: string;
}

export interface ChatAttachment {
  name: string;
  url: string;
  type: string;
  size?: number;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  senderRole: 'consultant' | 'client' | 'system';
  senderName: string;
  text: string;
  attachment?: ChatAttachment | null;
  createdAt: string;
  isRead: boolean;
}

export interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  roomId: string | null;
  callerName: string;
  callerRole: 'consultant' | 'client';
  isVideo: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
}

