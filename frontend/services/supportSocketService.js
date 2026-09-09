"use client";

class SupportSocketService {
  constructor() {
    this.ws = null;
    this.consultantWs = null;
    this.listeners = new Map();
    this.portalToken = null;
    this.consultantToken = null;
    this.reconnectTimer = null;
    this.consultantReconnectTimer = null;
    this.isConnected = false;
    this.isConsultantConnected = false;
    this.activeRole = "client";
    this.activeHelpSession = null;
  }

  getHost() {
    if (typeof window === "undefined") return "127.0.0.1:5000";
    if (process.env.NEXT_PUBLIC_WS_HOST) return process.env.NEXT_PUBLIC_WS_HOST;
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.hostname}:5000`;
    }
    return window.location.host;
  }

  getProtocol() {
    if (typeof window === "undefined") return "ws:";
    return window.location.protocol === "https:" ? "wss:" : "ws:";
  }

  connectConsultantNotifications({ consultantToken }) {
    if (!consultantToken) return;

    if (this.consultantWs && (this.consultantWs.readyState === WebSocket.OPEN || this.consultantWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = `${this.getProtocol()}//${this.getHost()}/ws/support/consultant/?token=${encodeURIComponent(consultantToken)}`;
    console.log("[SupportSocket] Connecting consultant notifications to:", wsUrl);

    try {
      this.consultantWs = new WebSocket(wsUrl);

      this.consultantWs.onopen = () => {
        console.log("[SupportSocket] Consultant notification WebSocket OPEN");
        this.isConsultantConnected = true;
      };

      this.consultantWs.onclose = (event) => {
        console.warn("[SupportSocket] Consultant WS closed with code:", event.code);
        this.isConsultantConnected = false;
        if (event.code !== 4003) {
          clearTimeout(this.consultantReconnectTimer);
          this.consultantReconnectTimer = setTimeout(() => {
            this.connectConsultantNotifications({ consultantToken });
          }, 3000);
        }
      };

      this.consultantWs.onerror = (error) => {
        console.warn("[SupportSocket] Consultant WS notice:", error);
      };

      this.consultantWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (err) {
          console.error("Failed to parse consultant WS message:", err);
        }
      };
    } catch (err) {
      console.error("Consultant WebSocket initiation error:", err);
    }
  }

  connect({ portalToken, consultantToken }) {
    if (!portalToken) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.portalToken === portalToken && this.consultantToken === consultantToken) {
        return;
      }
      this.disconnect();
    }

    this.portalToken = portalToken;
    this.consultantToken = consultantToken || null;

    let url = `${this.getProtocol()}//${this.getHost()}/ws/support/${portalToken}/`;
    if (consultantToken) {
      url += `?consultant_token=${encodeURIComponent(consultantToken)}`;
    }
    console.log("[SupportSocket] Connecting project WS to:", url);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[SupportSocket] Project WebSocket OPEN:", portalToken);
        this.isConnected = true;
        this.emit("connection_status", { isConnected: true });
        if (this.consultantToken) {
          this.notifyConsultantJoined();
        }
      };

      this.ws.onclose = (event) => {
        console.warn("[SupportSocket] Project WS closed with code:", event.code);
        this.isConnected = false;
        this.emit("connection_status", { isConnected: false, code: event.code });
        if (event.code !== 4003 && event.code !== 4004 && this.portalToken) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.connect({ portalToken: this.portalToken, consultantToken: this.consultantToken });
          }, 3000);
        }
      };

      this.ws.onerror = (error) => {
        console.warn("[SupportSocket] Project WS notice:", error);
        this.emit("error", error);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (err) {
          console.error("Failed to parse support WS message:", err);
        }
      };
    } catch (err) {
      console.error("WebSocket connection initiation error:", err);
    }
  }

  handleMessage(data) {
    const { type } = data;

    if (type === "INITIAL_STATE") {
      this.activeRole = data.role;
      this.activeHelpSession = data.active_help;
      this.emit("initial_state", data);
    } else if (type === "NOTIFICATION_HELP_REQUESTED") {
      this.activeHelpSession = {
        page_id: data.page_id,
        field_key: data.field_key,
        question: data.question,
        is_active: true,
      };
      this.emit("help_requested", data);
    } else if (type === "HELP_RESOLVED") {
      this.activeHelpSession = null;
      this.emit("help_resolved", data);
    } else if (type === "FIELD_SYNC") {
      this.emit("field_sync", data);
    } else if (type === "STEP_NAVIGATE") {
      this.emit("step_navigate", data);
    } else if (type === "WEBRTC_SIGNAL") {
      this.emit("webrtc_signal", data);
    } else if (type === "ERROR") {
      this.emit("server_error", data);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  requestHelp({ pageId, fieldKey = "", question = "I need assistance on this step." }) {
    this.send({
      type: "CLIENT_REQUEST_HELP",
      page_id: pageId,
      field_key: fieldKey,
      question,
    });
  }

  resolveHelp({ pageId }) {
    this.send({
      type: "RESOLVE_HELP",
      page_id: pageId,
    });
  }

  syncField({ pageId, fieldKey, value }) {
    this.send({
      type: "FIELD_SYNC",
      page_id: pageId,
      field_key: fieldKey,
      value,
    });
  }

  navigateStep({ step, pageId }) {
    this.send({
      type: "STEP_NAVIGATE",
      step,
      page_id: pageId || `Step ${step}`,
    });
  }

  notifyConsultantJoined(pageId = "") {
    this.send({
      type: "CONSULTANT_JOINED",
      page_id: pageId,
    });
  }

  sendWebRTCSignal({ action, data = {}, projectId = null, portalToken = null }) {
    const payload = {
      type: "WEBRTC_SIGNAL",
      action,
      data,
      ...(projectId ? { project_id: projectId } : {}),
    };

    console.log("[SupportSocket] Sending WebRTC signal:", action, "payload:", payload);

    const targetSocket =
      this.ws && this.ws.readyState === WebSocket.OPEN
        ? this.ws
        : this.consultantWs && this.consultantWs.readyState === WebSocket.OPEN
        ? this.consultantWs
        : this.ws && this.ws.readyState === WebSocket.CONNECTING
        ? this.ws
        : this.consultantWs;

    if (targetSocket) {
      if (targetSocket.readyState === WebSocket.OPEN) {
        targetSocket.send(JSON.stringify(payload));
        console.log("[SupportSocket] WebRTC signal sent immediately via OPEN socket.");
      } else if (targetSocket.readyState === WebSocket.CONNECTING) {
        console.log("[SupportSocket] WebRTC socket CONNECTING; queuing message for open event...");
        targetSocket.addEventListener(
          "open",
          () => {
            targetSocket.send(JSON.stringify(payload));
            console.log("[SupportSocket] Queued WebRTC signal dispatched on socket open.");
          },
          { once: true }
        );
      }
    } else {
      console.warn("[SupportSocket] No active socket to send signal! Attempting emergency connect...");
      const tokenToUse = portalToken || this.portalToken;
      if (tokenToUse) {
        this.connect({ portalToken: tokenToUse });
        if (this.ws) {
          this.ws.addEventListener(
            "open",
            () => {
              this.ws.send(JSON.stringify(payload));
              console.log("[SupportSocket] WebRTC signal dispatched after emergency connect.");
            },
            { once: true }
          );
        }
      }
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(payload);
        } catch (err) {
          console.error("SupportSocketService event callback error:", err);
        }
      });
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const supportSocket = new SupportSocketService();
