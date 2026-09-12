import { apiRequest, buildApiUrl } from "../lib/api.js";

class ChatService {
  async fetchConversations() {
    return apiRequest("/projects/chat/conversations/", {
      method: "GET",
    });
  }

  async fetchProjectMessages(projectId, limit = 100) {
    return apiRequest(`/projects/${projectId}/messages/?limit=${limit}`, {
      method: "GET",
    });
  }

  async markProjectMessagesRead(projectId) {
    return apiRequest(`/projects/${projectId}/messages/read/`, {
      method: "POST",
    });
  }

  async fetchPortalMessages(portalToken, limit = 100) {
    const url = buildApiUrl(`/client-portal/${portalToken}/messages/?limit=${limit}`);
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch portal messages (${response.status})`);
    }

    return response.json();
  }

  async markPortalMessagesRead(portalToken) {
    const url = buildApiUrl(`/client-portal/${portalToken}/messages/read/`);
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to mark portal messages read (${response.status})`);
    }

    return response.json();
  }

  async uploadProjectAttachment(projectId, file, duration = null) {
    const formData = new FormData();
    formData.append("file", file);
    if (duration !== null && duration !== undefined) {
      formData.append("duration", String(duration));
    }
    return apiRequest(`/projects/${projectId}/messages/upload/`, {
      method: "POST",
      body: formData,
    });
  }

  async uploadPortalAttachment(portalToken, file, duration = null) {
    const formData = new FormData();
    formData.append("file", file);
    if (duration !== null && duration !== undefined) {
      formData.append("duration", String(duration));
    }

    const url = buildApiUrl(`/client-portal/${portalToken}/messages/upload/`);
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload portal attachment (${response.status})`);
    }

    return response.json();
  }

  async sendProjectMessageFallback(projectId, text, clientTempId = null, extraData = {}) {
    return apiRequest(`/projects/${projectId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ text, clientTempId, ...extraData }),
    });
  }

  async sendPortalMessageFallback(portalToken, text, clientTempId = null, extraData = {}) {
    const url = buildApiUrl(`/client-portal/${portalToken}/messages/`);
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, clientTempId, ...extraData }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send portal message (${response.status})`);
    }

    return response.json();
  }
}

export const chatService = new ChatService();
export default chatService;
