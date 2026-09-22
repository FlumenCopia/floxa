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
    return apiRequest(`/client-portal/${portalToken}/messages/?limit=${limit}`, {
      method: "GET",
    });
  }

  async markPortalMessagesRead(portalToken) {
    return apiRequest(`/client-portal/${portalToken}/messages/read/`, {
      method: "POST",
    });
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

    return apiRequest(`/client-portal/${portalToken}/messages/upload/`, {
      method: "POST",
      body: formData,
    });
  }

  async sendProjectMessageFallback(projectId, text, clientTempId = null, extraData = {}) {
    return apiRequest(`/projects/${projectId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ text, clientTempId, ...extraData }),
    });
  }

  async sendPortalMessageFallback(portalToken, text, clientTempId = null, extraData = {}) {
    return apiRequest(`/client-portal/${portalToken}/messages/`, {
      method: "POST",
      body: JSON.stringify({ text, clientTempId, ...extraData }),
    });
  }
}

export const chatService = new ChatService();
export default chatService;
