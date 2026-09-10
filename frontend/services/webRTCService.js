"use client";

import { supportSocket } from "./supportSocketService";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.screenStream = null;
    this.callState = "idle"; // "idle" | "outgoing_ringing" | "incoming_ringing" | "connected" | "ended"
    this.currentCallInfo = null; // { projectId, clientName, projectTitle, role }
    this.listeners = new Map();
    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.isScreenSharing = false;
    this.pendingCandidates = [];

    // Bind socket listener
    this.setupSocketListener();

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        if (this.callState !== "idle") {
          this.endCall();
        }
      });
    }
  }

  setupSocketListener() {
    supportSocket.on("connection_status", ({ isConnected }) => {
      if (!isConnected && this.callState !== "idle") {
        this.cleanUpCall();
        this.setCallState("idle");
        this.emit("call_disconnected", { message: "Call disconnected. Network connection lost." });
      }
    });

    supportSocket.on("webrtc_signal", async (payload) => {
      const { action, sender_role, data, project_id, client_name, project_title } = payload;

      if (action === "call_initiate") {
        // Prevent call collision if already busy
        if (this.callState !== "idle") {
          supportSocket.sendWebRTCSignal({
            action: "call_reject",
            data: { reason: "Participant is currently busy on another call." },
            projectId: project_id,
          });
          return;
        }

        this.currentCallInfo = {
          projectId: project_id,
          clientName: client_name || "Client",
          projectTitle: project_title || "Project",
          role: sender_role,
        };
        this.setCallState("incoming_ringing");

        // Auto time out incoming ringing after 40 seconds
        clearTimeout(this.ringingTimeout);
        this.ringingTimeout = setTimeout(() => {
          if (this.callState === "incoming_ringing") {
            this.cleanUpCall();
            this.setCallState("idle");
            this.emit("call_timeout", { message: "Incoming call timed out." });
          }
        }, 40000);
      } else if (action === "call_accept") {
        clearTimeout(this.ringingTimeout);
        if (this.callState === "outgoing_ringing") {
          this.setCallState("connected");
          // The caller creates and sends the initial WebRTC offer
          await this.initiatePeerConnectionAsCaller();
        }
      } else if (action === "call_reject" || action === "call_cancel") {
        clearTimeout(this.ringingTimeout);
        this.cleanUpCall();
        this.setCallState("idle");
        this.emit("call_rejected", { reason: data?.reason || "Call was declined." });
      } else if (action === "call_end") {
        clearTimeout(this.ringingTimeout);
        this.cleanUpCall();
        this.setCallState("ended");
        setTimeout(() => this.setCallState("idle"), 1200);
      } else if (action === "offer") {
        if (data?.sdp) await this.handleRemoteOffer(data.sdp);
      } else if (action === "answer") {
        if (data?.sdp) await this.handleRemoteAnswer(data.sdp);
      } else if (action === "ice_candidate") {
        if (data?.candidate) await this.handleRemoteCandidate(data.candidate);
      }
    });
  }

  setCallState(state) {
    this.callState = state;
    this.emit("state_change", state);
  }

  createFallbackVideoTrack() {
    if (typeof document === "undefined") return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, 16, 16);
      }
      const stream = canvas.captureStream ? canvas.captureStream(5) : null;
      const track = stream?.getVideoTracks()[0];
      if (track) track.enabled = false;
      return track;
    } catch {
      return null;
    }
  }

  async acquireLocalMedia() {
    if (this.localStream) return this.localStream;
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.emit("media_error", {
        type: "unsupported",
        message: "Your browser does not support audio/video calling.",
      });
      return null;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1, // Mono: cuts audio bitrate in half with zero loss
          sampleRate: 48000,
        },
      });
      this.isAudioMuted = false;
      this.isVideoMuted = false;
      this.emit("local_stream", this.localStream);
      return this.localStream;
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.emit("media_error", {
          type: "permission_denied",
          message: "Camera and microphone access was denied. Please allow permissions in browser settings.",
        });
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        this.emit("media_error", {
          type: "no_device",
          message: "No camera or microphone found on this device.",
        });
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        this.emit("media_error", {
          type: "device_busy",
          message: "Camera or microphone is already in use by another application.",
        });
      }
      console.warn("Could not acquire video & audio, trying audio with fallback video track:", err);
      let audioTrack = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        audioTrack = audioStream.getAudioTracks()[0];
      } catch (audioErr) {
        console.warn("Microphone not available, using silent audio fallback:", audioErr);
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const dst = osc.connect(ctx.createMediaStreamDestination());
            osc.start();
            audioTrack = dst.stream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = false;
          }
        } catch {}
      }

      const tracks = [];
      if (audioTrack) tracks.push(audioTrack);
      const fallbackVideo = this.createFallbackVideoTrack();
      if (fallbackVideo) tracks.push(fallbackVideo);

      this.localStream = new MediaStream(tracks);
      this.isAudioMuted = !audioTrack || !audioTrack.enabled;
      this.isVideoMuted = true;
      this.emit("local_stream", this.localStream);
      return this.localStream;
    }
  }

  createPeerConnection() {
    if (this.peerConnection) return this.peerConnection;

    this.peerConnection = new RTCPeerConnection(ICE_SERVERS);
    this.remoteStream = new MediaStream();
    this.emit("remote_stream", this.remoteStream);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Remote track handler (safely handles both event.streams and event.track)
    this.peerConnection.ontrack = (event) => {
      const incomingTracks =
        event.streams && event.streams[0] && event.streams[0].getTracks().length > 0
          ? event.streams[0].getTracks()
          : event.track
          ? [event.track]
          : [];

      incomingTracks.forEach((track) => {
        if (!this.remoteStream.getTracks().some((t) => t.id === track.id)) {
          this.remoteStream.addTrack(track);
        }
      });
      this.emit("remote_stream", this.remoteStream);
    };

    // ICE Candidate handler
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        supportSocket.sendWebRTCSignal({
          action: "ice_candidate",
          data: { candidate: event.candidate },
          projectId: this.currentCallInfo?.projectId,
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === "connected") {
        this.setCallState("connected");
      } else if (state === "failed") {
        this.cleanUpCall();
        this.setCallState("idle");
        this.emit("call_failed", { message: "Call connection failed. Please try again." });
      } else if (state === "disconnected" || state === "closed") {
        if (this.callState === "connected") {
          this.endCall();
        }
      }
    };

    return this.peerConnection;
  }

  async initiateCall({ projectId, clientName, projectTitle, role, portalToken }) {
    if (!projectId) {
      this.emit("call_error", { message: "Cannot initiate call: No project selected." });
      return;
    }
    if (this.callState !== "idle") {
      this.emit("call_error", { message: "A call is already in progress." });
      return;
    }
    this.currentCallInfo = { projectId, clientName, projectTitle, role, portalToken };
    this.setCallState("outgoing_ringing");

    // Timeout for outgoing ringing (40 seconds)
    clearTimeout(this.ringingTimeout);
    this.ringingTimeout = setTimeout(() => {
      if (this.callState === "outgoing_ringing") {
        this.cleanUpCall();
        this.setCallState("idle");
        this.emit("call_timeout", { message: "Call timed out. No answer." });
      }
    }, 40000);

    try {
      await this.acquireLocalMedia();
    } catch (err) {
      console.warn("Acquiring media deferred, proceeding with signaling:", err);
    }
    supportSocket.sendWebRTCSignal({
      action: "call_initiate",
      data: { clientName, projectTitle },
      projectId,
      portalToken,
    });
  }

  async acceptCall() {
    this.setCallState("connected");
    try {
      await this.acquireLocalMedia();
    } catch (err) {
      console.warn("Acquiring media on accept deferred:", err);
    }
    this.createPeerConnection();
    supportSocket.sendWebRTCSignal({
      action: "call_accept",
      data: {},
      projectId: this.currentCallInfo?.projectId,
    });
  }

  rejectCall() {
    supportSocket.sendWebRTCSignal({
      action: "call_reject",
      data: { reason: "Call declined" },
      projectId: this.currentCallInfo?.projectId,
    });
    this.cleanUpCall();
    this.setCallState("idle");
  }

  endCall() {
    supportSocket.sendWebRTCSignal({
      action: "call_end",
      data: {},
      projectId: this.currentCallInfo?.projectId,
    });
    this.cleanUpCall();
    this.setCallState("idle");
  }

  optimizeSDP(sdp) {
    if (!sdp) return sdp;
    // Low-latency Opus configuration: mono speech with forward error correction (FEC)
    let modified = sdp.replace(
      /a=fmtp:(\d+) minptime=\d+;useinbandfec=1/g,
      "a=fmtp:$1 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0"
    );
    // Bandwidth ceiling (1.5 Mbps) prevents buffer bloat and latency spikes
    if (!modified.includes("b=AS:") && modified.includes("m=video")) {
      modified = modified.replace(/m=video (\d+) [^\r\n]+/, "$&\r\nb=AS:1500");
    }
    return modified;
  }

  async optimizeSenderBitrates() {
    if (!this.peerConnection) return;
    try {
      const senders = this.peerConnection.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === "video");
      if (videoSender && videoSender.getParameters) {
        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 1200000; // 1.2 Mbps sweet spot
        params.encodings[0].maxFramerate = 30;
        params.degradationPreference = "maintain-framerate"; // Fluid motion without freezing
        await videoSender.setParameters(params);
      }

      const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
      if (audioSender && audioSender.getParameters) {
        const params = audioSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 48000; // 48 kbps clear voice
        await audioSender.setParameters(params);
      }
    } catch {
      // Best-effort browser support
    }
  }

  async initiatePeerConnectionAsCaller() {
    const pc = this.createPeerConnection();
    if (!pc || pc.signalingState === "closed") return;
    if (pc.signalingState !== "stable") {
      console.warn(`[WebRTC] Cannot initiate offer from signalingState: ${pc.signalingState}`);
      return;
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      offer.sdp = this.optimizeSDP(offer.sdp);
      await pc.setLocalDescription(offer);
      await this.optimizeSenderBitrates();
      supportSocket.sendWebRTCSignal({
        action: "offer",
        data: { sdp: pc.localDescription },
        projectId: this.currentCallInfo?.projectId,
      });
    } catch (err) {
      console.warn("[WebRTC] Warning creating WebRTC offer:", err);
    }
  }

  async handleRemoteOffer(sdp) {
    if (!this.localStream) {
      await this.acquireLocalMedia();
    }
    const pc = this.createPeerConnection();
    if (!pc || pc.signalingState === "closed") return;

    // Guard against glare or already stable state
    if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
      console.warn(`[WebRTC] Cannot process remote offer in signalingState: ${pc.signalingState}`);
      if (pc.signalingState === "have-local-offer") {
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch {
          return;
        }
      } else {
        return;
      }
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Guard: Ensure state transitioned to have-remote-offer before creating local answer
      if (pc.signalingState !== "have-remote-offer") {
        console.warn(`[WebRTC] Expected have-remote-offer after setRemoteDescription, got: ${pc.signalingState}`);
        return;
      }

      // Process buffered ICE candidates safely
      while (this.pendingCandidates.length) {
        const candidate = this.pendingCandidates.shift();
        try {
          await pc.addIceCandidate(candidate);
        } catch {}
      }

      const answer = await pc.createAnswer();
      answer.sdp = this.optimizeSDP(answer.sdp);

      // Verify still in have-remote-offer before setting local answer
      if (pc.signalingState === "have-remote-offer") {
        await pc.setLocalDescription(answer);
        await this.optimizeSenderBitrates();

        supportSocket.sendWebRTCSignal({
          action: "answer",
          data: { sdp: pc.localDescription },
          projectId: this.currentCallInfo?.projectId,
        });
      }
    } catch (err) {
      console.warn("[WebRTC] Warning handling remote offer:", err);
    }
  }

  async handleRemoteAnswer(sdp) {
    if (!this.peerConnection || this.peerConnection.signalingState === "closed") return;

    // Only set remote answer if we are actively expecting one (have-local-offer)
    if (this.peerConnection.signalingState !== "have-local-offer") {
      console.warn(
        `[WebRTC] Ignoring remote answer: signalingState is ${this.peerConnection.signalingState}, expected have-local-offer`
      );
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      while (this.pendingCandidates.length) {
        const candidate = this.pendingCandidates.shift();
        try {
          await this.peerConnection.addIceCandidate(candidate);
        } catch {}
      }
      await this.optimizeSenderBitrates();
    } catch (err) {
      console.warn("[WebRTC] Warning setting remote answer description:", err);
    }
  }

  async handleRemoteCandidate(candidate) {
    if (!candidate || !candidate.candidate) return;
    try {
      const rtcCandidate = new RTCIceCandidate(candidate);
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(rtcCandidate);
      } else {
        this.pendingCandidates.push(rtcCandidate);
      }
    } catch (err) {
      console.warn("[WebRTC] Warning adding remote ICE candidate:", err);
    }
  }

  toggleAudio() {
    if (!this.localStream) return this.isAudioMuted;
    this.isAudioMuted = !this.isAudioMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isAudioMuted;
    });
    this.emit("audio_toggle", this.isAudioMuted);
    return this.isAudioMuted;
  }

  toggleVideo() {
    if (!this.localStream) return this.isVideoMuted;
    this.isVideoMuted = !this.isVideoMuted;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this.isVideoMuted;
    });
    this.emit("video_toggle", this.isVideoMuted);
    return this.isVideoMuted;
  }

  async toggleScreenShare() {
    if (this.isScreenSharing) {
      // Revert to camera / fallback track
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
      }
      const videoTrack = this.localStream?.getVideoTracks()[0];
      if (this.peerConnection && videoTrack) {
        const sender = this.peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          try {
            await sender.replaceTrack(videoTrack);
          } catch (e) {
            console.warn("Could not revert video sender track:", e);
          }
        }
      }
      this.isScreenSharing = false;
      this.emit("screenshare_toggle", false);
      if (this.localStream) {
        this.emit("local_stream", this.localStream);
      }
      return false;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });
      const screenTrack = this.screenStream.getVideoTracks()[0];

      if (this.peerConnection && screenTrack) {
        const senders = this.peerConnection.getSenders();
        let videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (!videoSender) {
          videoSender = senders.find((s) => !s.track || s.track?.kind === "video");
        }
        if (videoSender) {
          try {
            await videoSender.replaceTrack(screenTrack);
          } catch (replaceErr) {
            console.warn("replaceTrack failed, adding track to peer connection:", replaceErr);
            this.peerConnection.addTrack(screenTrack, this.screenStream);
          }
        } else {
          this.peerConnection.addTrack(screenTrack, this.screenStream);
        }
      }

      screenTrack.onended = () => {
        this.toggleScreenShare();
      };

      this.isScreenSharing = true;
      this.emit("screenshare_toggle", true);
      // Update local preview to show the screen being shared
      this.emit("local_stream", this.screenStream);
      return true;
    } catch (err) {
      console.warn("Screen share cancelled or failed:", err);
      return false;
    }
  }

  cleanUpCall() {
    clearTimeout(this.ringingTimeout);
    this.ringingTimeout = null;
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop());
      this.remoteStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.pendingCandidates = [];
    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.isScreenSharing = false;
    this.currentCallInfo = null;
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
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`webRTCService event ${event} error:`, e);
        }
      });
    }
  }
}

export const webRTCService = new WebRTCService();
