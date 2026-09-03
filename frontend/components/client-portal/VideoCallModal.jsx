"use client";

import { useEffect, useRef, useState } from "react";
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
    // Sync current service state immediately
    if (webRTCService.callState) {
      setCallState(webRTCService.callState);
    }
    if (webRTCService.currentCallInfo) {
      setCallInfo(webRTCService.currentCallInfo);
    }

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
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.12-8.69 2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L3.91 9.91" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </button>
            <button
              type="button"
              className="floxa-call-circle-btn floxa-btn-accept"
              title="Accept Call"
              onClick={() => webRTCService.acceptCall()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.053 15.053 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1.01A11.36 11.36 0 0 1 8.57 3.9c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.52c0-.55-.45-1-.99-1z"/>
              </svg>
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
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.12-8.69 2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L3.91 9.91" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
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
          ↗
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
              )}
            </button>
            <button
              type="button"
              className="floxa-apple-header-btn"
              title="Minimize to floating bubble"
              onClick={() => setIsMinimized(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                    <path d="M5 10v2a7 7 0 0 0 12 5" />
                    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="m16 16-1.5-1.5" />
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="2" y="5" width="14" height="14" rx="2" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
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
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-1.07.51-2.02 1.2-2.81 2.05-.18.19-.44.3-.71.3-.28 0-.53-.11-.71-.29L.29 13.46a.996.996 0 0 1 0-1.41C3.28 9.17 7.42 7.5 12 7.5s8.72 1.67 11.71 4.55c.39.39.39 1.02 0 1.41l-2.32 2.32c-.18.18-.43.29-.71.29-.27 0-.53-.11-.71-.3-.79-.85-1.74-1.54-2.81-2.05-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
              </div>
              <span className="floxa-apple-btn-label">End</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
