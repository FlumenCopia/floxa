"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Phone,
  Minimize2,
  Maximize2,
  Minus,
  X,
  Zap,
  VolumeX,
  Volume2,
} from "lucide-react";
import { webRTCService } from "../../services/webRTCService";

export function VideoCallModal({ currentRole = "client", project = null }) {
  const [callState, setCallState] = useState(() => webRTCService.callState || "idle");
  const [callInfo, setCallInfo] = useState(() => webRTCService.currentCallInfo);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState(false);
  const [isAutoplayMuted, setIsAutoplayMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [stats, setStats] = useState(null);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const minimizedVideoRef = useRef(null);

  const attachAndPlayRemote = async (stream) => {
    if (!stream) return;

    const hasLiveVideoTrack = Boolean(
      stream.getVideoTracks().length > 0 &&
      stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)
    );
    setIsRemoteVideoActive(hasLiveVideoTrack);

    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      try {
        await remoteVideoRef.current.play();
        setIsAutoplayMuted(false);
      } catch (err) {
        console.warn("[VideoCallModal] Autoplay blocked by browser policy; muting to enable playback:", err);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.muted = true;
          setIsAutoplayMuted(true);
          try {
            await remoteVideoRef.current.play();
          } catch (e2) {
            console.error("[VideoCallModal] Secondary play failed:", e2);
          }
        }
      }
    }

    if (minimizedVideoRef.current) {
      if (minimizedVideoRef.current.srcObject !== stream) {
        minimizedVideoRef.current.srcObject = stream;
      }
      minimizedVideoRef.current.play().catch(() => {});
    }
  };

  const handleUnmuteRemoteAudio = (e) => {
    if (e) e.stopPropagation();
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = false;
      setIsAutoplayMuted(false);
      setIsSpeakerMuted(false);
      remoteVideoRef.current.play().catch(() => {});
    }
  };

  const toggleSpeaker = (e) => {
    if (e) e.stopPropagation();
    if (remoteVideoRef.current) {
      const nextMuted = !remoteVideoRef.current.muted;
      remoteVideoRef.current.muted = nextMuted;
      setIsSpeakerMuted(nextMuted);
    }
  };

  useEffect(() => {
    const unsubState = webRTCService.on("state_change", (state) => {
      setCallState(state);
      setCallInfo(webRTCService.currentCallInfo);
      if (state === "connected") {
        setDuration(0);
      }
      if (state === "idle" || state === "ended") {
        setIsRemoteVideoActive(false);
        setIsAutoplayMuted(false);
        setIsSpeakerMuted(false);
      }
    });

    const unsubLocal = webRTCService.on("local_stream", (stream) => {
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
    });

    const unsubRemote = webRTCService.on("remote_stream", (stream) => {
      attachAndPlayRemote(stream);
    });

    const unsubAudio = webRTCService.on("audio_toggle", (muted) => setIsAudioMuted(muted));
    const unsubVideo = webRTCService.on("video_toggle", (muted) => setIsVideoMuted(muted));
    const unsubStats = webRTCService.on("call_stats", (s) => setStats(s));

    return () => {
      unsubState();
      unsubLocal();
      unsubRemote();
      unsubAudio();
      unsubVideo();
      unsubStats();
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
        const playTone = (freq, durationSec, delay) => {
          if (!isPlaying || !audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + durationSec);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + durationSec);
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
      localVideoRef.current.play().catch(() => {});
    }
    if (webRTCService.remoteStream) {
      attachAndPlayRemote(webRTCService.remoteStream);
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

  const isAudioCall = callInfo?.callType === "audio";

  // 1. INCOMING CALL RINGING DIALOG
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
            <div className="floxa-call-type-indicator-badge" title={isAudioCall ? "Audio Call" : "Video Call"}>
              {isAudioCall ? <Phone size={13} color="#ffffff" /> : <Video size={13} color="#ffffff" />}
            </div>
          </div>

          <h3 className="floxa-call-person-name">{callerName}</h3>
          <p className="floxa-call-status-subtitle">
            Incoming {isAudioCall ? "Audio Call" : "Video Call"}...
          </p>
          {callInfo?.projectTitle ? (
            <span className="floxa-call-project-tag">{callInfo.projectTitle}</span>
          ) : null}

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
              title={isAudioCall ? "Accept Audio Call" : "Accept Video Call"}
              onClick={() => webRTCService.acceptCall()}
            >
              {isAudioCall ? (
                <Phone size={24} strokeWidth={2.2} color="#ffffff" />
              ) : (
                <Video size={24} strokeWidth={2.2} color="#ffffff" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. OUTGOING CALL CALLING DIALOG
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
            <div className="floxa-call-type-indicator-badge" title={isAudioCall ? "Voice Call" : "Video Call"}>
              {isAudioCall ? <Phone size={13} color="#ffffff" /> : <Video size={13} color="#ffffff" />}
            </div>
          </div>

          <h3 className="floxa-call-person-name">{calleeName}</h3>
          <p className="floxa-call-status-subtitle">
            Calling ({isAudioCall ? "Voice" : "Video"})...
          </p>
          {callInfo?.projectTitle ? (
            <span className="floxa-call-project-tag">{callInfo.projectTitle}</span>
          ) : null}

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
        {isAudioCall ? (
          <div className="floxa-minimized-audio-avatar">
            <span className="floxa-minimized-audio-initials">
              {getInitials(callInfo?.clientName || "Client")}
            </span>
          </div>
        ) : (
          <video
            ref={minimizedVideoRef}
            autoPlay
            playsInline
            className="floxa-minimized-video-thumb"
          />
        )}
        <div className="floxa-minimized-info">
          <span className="floxa-live-dot" />
          <span>{formatTime(duration)}</span>
        </div>
        <div className="floxa-minimized-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="floxa-minimized-btn"
            title="Expand Call"
            onClick={() => setIsMinimized(false)}
          >
            <Maximize2 size={13} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="floxa-minimized-btn floxa-minimized-btn-danger"
            title="End Call"
            onClick={() => webRTCService.endCall()}
          >
            <PhoneOff size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    );
  }

  // Determine other participant name and avatar for display
  const otherPartyName =
    callInfo?.role === "consultant" || currentRole === "client"
      ? (project?.consultant?.name || project?.consultant_name || "Your Consultant")
      : (callInfo?.clientName || project?.client_name || project?.company_name || "Client");
  const otherPartyAvatar =
    callInfo?.role === "consultant" || currentRole === "client"
      ? (project?.consultant?.avatar)
      : (callInfo?.avatar || project?.client?.avatar);

  // 4A. ACTIVE CONNECTED AUDIO CALL MODAL
  if (isAudioCall) {
    return (
      <div className="floxa-video-overlay" onClick={handleUnmuteRemoteAudio}>
        {/* Hidden video tag to safely sustain audio track playback without visual interruption */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />

        <div className="floxa-audio-connected-card">
          <div className="floxa-audio-pro-header">
            <div className="floxa-pro-live-tag">
              <span className="floxa-live-pulse-dot" />
              <span>LIVE VOICE</span>
            </div>
            <div className="floxa-audio-timer-badge">
              <span>{formatTime(duration)}</span>
            </div>
            <div className="floxa-audio-header-actions">
              <button
                type="button"
                className="floxa-pro-window-btn"
                title="Minimize to floating window"
                onClick={() => setIsMinimized(true)}
                aria-label="Minimize"
              >
                <Minus size={16} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="floxa-pro-window-btn floxa-btn-close-call"
                title="Leave call"
                onClick={() => webRTCService.endCall()}
                aria-label="Leave call"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div className="floxa-audio-call-body">
            <div className="floxa-voice-wave-ring">
              <div className="floxa-concentric-avatar" style={{ width: 104, height: 104 }}>
                {otherPartyAvatar ? (
                  <img src={otherPartyAvatar} alt={otherPartyName} className="floxa-call-avatar-img" />
                ) : (
                  <span className="floxa-call-avatar-placeholder" style={{ fontSize: 30 }}>
                    {getInitials(otherPartyName)}
                  </span>
                )}
              </div>
            </div>

            <h3 className="floxa-call-person-name" style={{ marginTop: 22 }}>{otherPartyName}</h3>
            <p className="floxa-call-status-subtitle" style={{ color: "#25d366" }}>
              Voice Call Connected • HD Audio
            </p>
            {callInfo?.projectTitle ? (
              <span className="floxa-call-project-tag">{callInfo.projectTitle}</span>
            ) : null}

            {/* Subtle animated voice bars */}
            <div className="floxa-voice-bars-wrap">
              <span className="floxa-voice-bar b1" />
              <span className="floxa-voice-bar b2" />
              <span className="floxa-voice-bar b3" />
              <span className="floxa-voice-bar b4" />
              <span className="floxa-voice-bar b5" />
            </div>
          </div>

          <div className="floxa-audio-controls-row" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`floxa-audio-ctrl-btn ${isAudioMuted ? "muted" : "active"}`}
              onClick={() => webRTCService.toggleAudio()}
              title={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <div className="floxa-audio-btn-icon">
                {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </div>
              <span className="floxa-audio-btn-text">{isAudioMuted ? "Unmute" : "Mute"}</span>
            </button>

            <button
              type="button"
              className={`floxa-audio-ctrl-btn ${isSpeakerMuted ? "muted" : "active"}`}
              onClick={toggleSpeaker}
              title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
            >
              <div className="floxa-audio-btn-icon">
                {isSpeakerMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </div>
              <span className="floxa-audio-btn-text">{isSpeakerMuted ? "Muted" : "Speaker"}</span>
            </button>

            <button
              type="button"
              className="floxa-audio-ctrl-btn floxa-audio-end-btn"
              onClick={() => webRTCService.endCall()}
              title="End voice call"
            >
              <div className="floxa-audio-btn-icon">
                <PhoneOff size={20} />
              </div>
              <span className="floxa-audio-btn-text">End</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4B. ACTIVE CONNECTED VIDEO MODAL (Standard, Clean Professional Enterprise UI)
  return (
    <div className="floxa-video-overlay" onClick={handleUnmuteRemoteAudio}>
      <div className={`floxa-video-connected-modal ${isExpanded ? "floxa-video-expanded" : ""}`}>
        {/* Professional Enterprise Header */}
        <div className="floxa-pro-header">
          <div className="floxa-pro-header-left">
            <div className="floxa-pro-live-tag">
              <span className="floxa-live-pulse-dot" />
              <span>LIVE</span>
            </div>
            <div className="floxa-pro-title-wrap">
              <span className="floxa-pro-call-title">
                {callInfo?.role === "consultant" || currentRole === "client"
                  ? "Live Consultant Session"
                  : `Session with ${callInfo?.clientName || "Client"}`}
              </span>
              <span className="floxa-pro-call-subtitle">
                Encrypted Peer-to-Peer • {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className="floxa-pro-header-center">
            <div className="floxa-latency-badge" title="Ultra-low latency real-time WebRTC pipeline">
              <Zap size={13} className="floxa-latency-icon" />
              <span>Ultra-Low Latency</span>
              <span className="floxa-latency-value">
                {stats?.rtt != null ? `${stats.rtt}ms` : "< 35ms"}
              </span>
            </div>
          </div>

          <div className="floxa-pro-header-right">
            <button
              type="button"
              className="floxa-pro-window-btn"
              title="Minimize to floating window"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize"
            >
              <Minus size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="floxa-pro-window-btn"
              title={isExpanded ? "Restore standard size" : "Expand to fullscreen"}
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? "Restore" : "Expand"}
            >
              {isExpanded ? (
                <Minimize2 size={16} strokeWidth={2} />
              ) : (
                <Maximize2 size={16} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              className="floxa-pro-window-btn floxa-btn-close-call"
              title="Leave call"
              onClick={() => webRTCService.endCall()}
              aria-label="Leave call"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="floxa-video-viewport">
          {/* Remote Video (Main View) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onLoadedMetadata={(e) => {
              e.currentTarget.play().catch(() => {});
            }}
            className="floxa-remote-video"
            style={{ display: isRemoteVideoActive ? "block" : "none" }}
          />

          {/* Placeholder while remote video stream is connecting or remote camera is off */}
          {!isRemoteVideoActive ? (
            <div className="floxa-remote-placeholder">
              <div className="floxa-remote-placeholder-avatar">
                {otherPartyAvatar ? (
                  <img src={otherPartyAvatar} alt={otherPartyName} className="floxa-remote-avatar-img" />
                ) : (
                  <span className="floxa-remote-avatar-initials">{getInitials(otherPartyName)}</span>
                )}
              </div>
              <span className="floxa-remote-placeholder-name">{otherPartyName}</span>
              <span className="floxa-remote-placeholder-status">
                <span className="floxa-placeholder-spinner" /> Connecting live video...
              </span>
            </div>
          ) : null}

          {/* Unmute floating banner if browser autoplay policy forced muted initial playback */}
          {isAutoplayMuted ? (
            <button
              type="button"
              className="floxa-unmute-chip"
              onClick={handleUnmuteRemoteAudio}
              title="Click to enable sound"
            >
              <VolumeX size={14} />
              <span>Click to enable sound</span>
            </button>
          ) : null}

          {/* Local Video (Corner Self-View Tile) */}
          <div className="floxa-local-pip-container">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              className="floxa-local-video"
            />
            <div className="floxa-local-pip-tag">
              <span>You</span>
              {isVideoMuted ? <span className="floxa-pip-muted">Cam Off</span> : null}
            </div>
          </div>

          {/* Standard Professional Bottom Control Dock */}
          <div className="floxa-pro-control-bar" onClick={(e) => e.stopPropagation()}>
            {/* Audio Mute/Unmute */}
            <button
              type="button"
              className={`floxa-pro-ctrl-btn ${isAudioMuted ? "muted" : "active"}`}
              onClick={() => webRTCService.toggleAudio()}
              title={isAudioMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <div className="floxa-pro-btn-icon">
                {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </div>
              <span className="floxa-pro-btn-text">{isAudioMuted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Video Camera Toggle */}
            <button
              type="button"
              className={`floxa-pro-ctrl-btn ${isVideoMuted ? "muted" : "active"}`}
              onClick={() => webRTCService.toggleVideo()}
              title={isVideoMuted ? "Start camera" : "Stop camera"}
            >
              <div className="floxa-pro-btn-icon">
                {isVideoMuted ? <VideoOff size={20} /> : <Video size={20} />}
              </div>
              <span className="floxa-pro-btn-text">{isVideoMuted ? "Start Video" : "Stop Video"}</span>
            </button>

            {/* End Call */}
            <button
              type="button"
              className="floxa-pro-ctrl-btn floxa-pro-end-btn"
              onClick={() => webRTCService.endCall()}
              title="End video call"
            >
              <div className="floxa-pro-btn-icon">
                <PhoneOff size={20} />
              </div>
              <span className="floxa-pro-btn-text">End</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
