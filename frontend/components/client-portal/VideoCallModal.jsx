"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Minimize2, Maximize2, Minus } from "lucide-react";
import { webRTCService } from "../../services/webRTCService";

export function VideoCallModal({ currentRole = "client", project = null }) {
  const [callState, setCallState] = useState(() => webRTCService.callState || "idle");
  const [callInfo, setCallInfo] = useState(() => webRTCService.currentCallInfo);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const minimizedVideoRef = useRef(null);

  useEffect(() => {
    const unsubState = webRTCService.on("state_change", (state) => {
      setCallState(state);
      setCallInfo(webRTCService.currentCallInfo);
      if (state === "connected") {
        setDuration(0);
      }
    });

    const unsubLocal = webRTCService.on("local_stream", (stream) => {
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }
    });

    const unsubRemote = webRTCService.on("remote_stream", (stream) => {
      if (remoteVideoRef.current && stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      if (minimizedVideoRef.current && stream) {
        minimizedVideoRef.current.srcObject = stream;
      }
    });

    const unsubAudio = webRTCService.on("audio_toggle", (muted) => setIsAudioMuted(muted));
    const unsubVideo = webRTCService.on("video_toggle", (muted) => setIsVideoMuted(muted));

    return () => {
      unsubState();
      unsubLocal();
      unsubRemote();
      unsubAudio();
      unsubVideo();
    };
  }, []);

  // Duration timer
  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // Audio synthesizer ring sound for incoming calls
  useEffect(() => {
    if (callState !== "incoming_ringing") return;

    let isPlaying = true;
    let audioCtx = null;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        const playTone = (freq, duration, delay) => {
          if (!isPlaying || !audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + duration);
        };

        const ringCycle = () => {
          if (!isPlaying) return;
          playTone(440, 0.4, 0);
          playTone(480, 0.4, 0);
          playTone(440, 0.4, 0.6);
          playTone(480, 0.4, 0.6);
        };

        ringCycle();
        const interval = setInterval(ringCycle, 2800);

        return () => {
          isPlaying = false;
          clearInterval(interval);
          if (audioCtx) {
            audioCtx.close().catch(() => {});
          }
        };
      }
    } catch (e) {
      console.warn("Ringtone could not play:", e);
    }
  }, [callState]);

  // Keep video elements bound when state changes
  useEffect(() => {
    if (webRTCService.localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = webRTCService.localStream;
    }
    if (webRTCService.remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = webRTCService.remoteStream;
    }
    if (webRTCService.remoteStream && minimizedVideoRef.current) {
      minimizedVideoRef.current.srcObject = webRTCService.remoteStream;
    }
  }, [callState, isMinimized]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getInitials = (name) => {
    if (!name) return "FL";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (callState === "idle") return null;

  // 1. INCOMING CALL RINGING DIALOG (Exact replica of user screenshot)
  if (callState === "incoming_ringing") {
    const callerName =
      callInfo?.clientName ||
      (callInfo?.role === "consultant" ? "Your Consultant" : "Client");
    const callerAvatar = callInfo?.avatar || project?.client?.avatar;

    return (
      <div className="floxa-video-overlay">
        <div className="floxa-flumenx-call-card">
          <div className="floxa-concentric-ring">
            <div className="floxa-concentric-avatar">
              {callerAvatar ? (
                <img src={callerAvatar} alt={callerName} className="floxa-call-avatar-img" />
              ) : (
                <span className="floxa-call-avatar-placeholder">
                  {getInitials(callerName)}
                </span>
              )}
            </div>
          </div>

          <h3 className="floxa-call-person-name">{callerName}</h3>
          <p className="floxa-call-status-subtitle">Incoming Video Call...</p>

          <div className="floxa-call-actions-row">
            <button
              type="button"
              className="floxa-call-circle-btn floxa-btn-decline"
              title="Decline Call"
              onClick={() => webRTCService.rejectCall()}
            >
              <PhoneOff size={24} strokeWidth={2.2} color="#ffffff" />
            </button>
            <button
              type="button"
              className="floxa-call-circle-btn floxa-btn-accept"
              title="Accept Call"
              onClick={() => webRTCService.acceptCall()}
            >
              <Phone size={24} strokeWidth={2.2} color="#ffffff" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. OUTGOING CALL CALLING DIALOG (Exact matching design)
  if (callState === "outgoing_ringing") {
    const calleeName =
      currentRole === "client"
        ? (project?.consultant?.name || project?.consultant_name || "Your Consultant")
        : (callInfo?.clientName || "Client");
    const calleeAvatar = callInfo?.avatar || project?.client?.avatar;

    return (
      <div className="floxa-video-overlay">
        <div className="floxa-flumenx-call-card">
          <div className="floxa-concentric-ring">
            <div className="floxa-concentric-avatar">
              {calleeAvatar ? (
                <img src={calleeAvatar} alt={calleeName} className="floxa-call-avatar-img" />
              ) : (
                <span className="floxa-call-avatar-placeholder">
                  {getInitials(calleeName)}
                </span>
              )}
            </div>
          </div>

          <h3 className="floxa-call-person-name">{calleeName}</h3>
          <p className="floxa-call-status-subtitle">Calling...</p>

          <div className="floxa-call-actions-row">
            <button
              type="button"
              className="floxa-call-circle-btn floxa-btn-decline"
              title="Cancel Call"
              onClick={() => webRTCService.endCall()}
            >
              <PhoneOff size={24} strokeWidth={2.2} color="#ffffff" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. MINIMIZED PICTURE-IN-PICTURE FLOATING BUBBLE
  if (isMinimized && callState === "connected") {
    return (
      <div className="floxa-video-minimized-bubble" onClick={() => setIsMinimized(false)}>
        <video
          ref={minimizedVideoRef}
          autoPlay
          playsInline
          className="floxa-minimized-video-thumb"
        />
        <div className="floxa-minimized-info">
          <span className="floxa-live-dot" />
          <span>{formatTime(duration)}</span>
        </div>
        <button
          type="button"
          className="floxa-expand-btn"
          title="Expand Video Call"
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
        >
          <Maximize2 size={13} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  // 4. ACTIVE CONNECTED MODAL (Centered in viewport with Apple/macOS design)
  return (
    <div className="floxa-video-overlay">
      <div className={`floxa-video-connected-modal ${isExpanded ? "floxa-video-expanded" : ""}`}>
        {/* macOS Style Window Header */}
        <div className="floxa-mac-window-header">
          <div className="floxa-mac-traffic-lights">
            <button
              type="button"
              className="floxa-traffic-dot floxa-dot-red"
              title="End Call"
              onClick={() => webRTCService.endCall()}
            />
            <button
              type="button"
              className="floxa-traffic-dot floxa-dot-yellow"
              title="Minimize to Corner"
              onClick={() => setIsMinimized(true)}
            />
            <button
              type="button"
              className="floxa-traffic-dot floxa-dot-green"
              title={isExpanded ? "Restore Size" : "Maximize View"}
              onClick={() => setIsExpanded((prev) => !prev)}
            />
          </div>

          <div className="floxa-mac-title-wrap">
            <span className="floxa-apple-live-dot" />
            <strong className="floxa-mac-title">
              {callInfo?.role === "consultant" || currentRole === "client"
                ? "Live Call with Consultant"
                : `Call with ${callInfo?.clientName || "Client"}`}
            </strong>
            <span className="floxa-apple-duration-pill">{formatTime(duration)}</span>
          </div>

          <div className="floxa-mac-header-actions">
            <button
              type="button"
              className="floxa-apple-header-btn"
              title={isExpanded ? "Restore View" : "Enlarge View"}
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? (
                <Minimize2 size={14} strokeWidth={2.2} />
              ) : (
                <Maximize2 size={14} strokeWidth={2.2} />
              )}
            </button>
            <button
              type="button"
              className="floxa-apple-header-btn"
              title="Minimize to floating bubble"
              onClick={() => setIsMinimized(true)}
            >
              <Minus size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="floxa-video-viewport">
          {/* Remote Video (Main View) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="floxa-remote-video"
          />

          {/* Local Video (Corner PIP) */}
          <div className="floxa-local-pip-container">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="floxa-local-video"
            />
            {isVideoMuted ? <span className="floxa-cam-off-badge">Cam Off</span> : null}
          </div>

          {/* Apple / macOS Floating Glass Control Island */}
          <div className="floxa-apple-toolbar-island">
            {/* Mute Button */}
            <button
              type="button"
              className={`floxa-apple-ctrl-btn ${isAudioMuted ? "muted" : "active"}`}
              onClick={() => webRTCService.toggleAudio()}
              title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              <div className="floxa-apple-icon-wrap">
                {isAudioMuted ? (
                  <MicOff size={22} strokeWidth={2.2} />
                ) : (
                  <Mic size={22} strokeWidth={2.2} />
                )}
              </div>
              <span className="floxa-apple-btn-label">{isAudioMuted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Camera Toggle Button */}
            <button
              type="button"
              className={`floxa-apple-ctrl-btn ${isVideoMuted ? "muted" : "active"}`}
              onClick={() => webRTCService.toggleVideo()}
              title={isVideoMuted ? "Start Camera" : "Stop Camera"}
            >
              <div className="floxa-apple-icon-wrap">
                {isVideoMuted ? (
                  <VideoOff size={22} strokeWidth={2.2} />
                ) : (
                  <Video size={22} strokeWidth={2.2} />
                )}
              </div>
              <span className="floxa-apple-btn-label">{isVideoMuted ? "Start Cam" : "Camera"}</span>
            </button>

            {/* End Call Button */}
            <button
              type="button"
              className="floxa-apple-ctrl-btn floxa-apple-end-btn"
              onClick={() => webRTCService.endCall()}
              title="End Video Call"
            >
              <div className="floxa-apple-icon-wrap">
                <PhoneOff size={22} strokeWidth={2.2} />
              </div>
              <span className="floxa-apple-btn-label">End</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
