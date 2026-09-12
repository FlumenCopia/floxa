"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  X,
  Send,
  Check,
  CheckCheck,
  Sparkles,
  ShieldCheck,
  Paperclip,
  Camera,
  Mic,
  Trash2,
  Play,
  Pause,
  Download,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  Video,
  Phone,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { supportSocket } from "@/services/supportSocketService";
import { chatService } from "@/services/chatService";
import { webRTCService } from "@/services/webRTCService";
import "./ClientPortalChatWidget.css";

function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSeconds(sec) {
  if (!sec || Number.isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ClientVoicePlayer({ mediaUrl, duration = 0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error("Voice playback failed:", e));
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalDuration = audio.duration || duration || 1;
    const newTime = Math.max(0, Math.min(totalDuration, (clickX / rect.width) * totalDuration));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const totalDur = audioRef.current?.duration || duration || 0;
  const progressPercent = totalDur > 0 ? (currentTime / totalDur) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200, padding: "4px 0" }}>
      <audio ref={audioRef} src={mediaUrl} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#00a884",
          border: "none",
          color: "#111b21",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          onClick={handleSeek}
          style={{
            width: "100%",
            height: 4,
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: 2,
            position: "relative",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: "100%",
              background: "#00a884",
              borderRadius: 2,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8696a0" }}>
          <span>{formatSeconds(isPlaying ? currentTime : totalDur)}</span>
          <Mic size={11} color="#00a884" />
        </div>
      </div>
    </div>
  );
}

export function ClientPortalChatWidget({ project = null, token = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDocked, setIsDocked] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inputText, setInputText] = useState("");
  const [consultantIsTyping, setConsultantIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  // Attachments & Voice & Camera
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioStreamRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const cameraFallbackRef = useRef(null);

  const projectId = project?.id || project?.project_id || null;
  const portalToken = token || project?.portal_token || null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Initial load or when opened
  useEffect(() => {
    if (!portalToken) return;

    let isMounted = true;
    chatService
      .fetchPortalMessages(portalToken)
      .then((data) => {
        if (isMounted && data?.messages) {
          setMessages(data.messages);
          if (!isOpen) {
            const unread = data.messages.filter(
              (m) => m.senderRole === "consultant" && m.status !== "read"
            ).length;
            setUnreadCount(unread);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [portalToken, isOpen]);

  // When widget opens: mark read
  useEffect(() => {
    if (!isOpen || !portalToken || !projectId) return;

    setUnreadCount(0);
    chatService.markPortalMessagesRead(portalToken).catch(() => {});
    supportSocket.sendChatRead({ projectId, readBy: "client" });
    setTimeout(scrollToBottom, 50);
  }, [isOpen, portalToken, projectId]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!projectId) return;

    const unsubMsg = supportSocket.on("chat_message_new", (newMsg) => {
      if (newMsg?.projectId !== projectId) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id || (m.clientTempId && m.clientTempId === newMsg.clientTempId))) {
          return prev.map((m) =>
            (m.id === newMsg.id || (m.clientTempId && m.clientTempId === newMsg.clientTempId)) ? newMsg : m
          );
        }
        return [...prev, newMsg];
      });

      if (isOpen) {
        if (newMsg.senderRole === "consultant") {
          supportSocket.sendChatRead({ projectId, readBy: "client" });
          if (portalToken) {
            chatService.markPortalMessagesRead(portalToken).catch(() => {});
          }
        }
        setTimeout(scrollToBottom, 50);
      } else {
        if (newMsg.senderRole === "consultant") {
          setUnreadCount((prev) => prev + 1);
        }
      }
    });

    const unsubTyping = supportSocket.on("chat_typing", (data) => {
      if (data?.projectId === projectId && data?.senderRole === "consultant") {
        setConsultantIsTyping(Boolean(data.isTyping));
      }
    });

    const unsubRead = supportSocket.on("chat_messages_read", (data) => {
      if (data?.projectId === projectId && data?.readBy === "consultant") {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderRole === "client" ? { ...m, status: "read", readAt: data.readAt || new Date() } : m
          )
        );
      }
    });

    return () => {
      unsubMsg();
      unsubTyping();
      unsubRead();
    };
  }, [projectId, portalToken, isOpen]);

  // Clean up streams
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (projectId) {
      supportSocket.sendChatTyping({ projectId, isTyping: true, senderRole: "client" });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        supportSocket.sendChatTyping({ projectId, isTyping: false, senderRole: "client" });
      }, 2000);
    }
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !projectId) return;

    const tempId = `client-temp-${Date.now()}`;
    const newMsg = {
      id: tempId,
      clientTempId: tempId,
      projectId,
      senderRole: "client",
      senderName: "You",
      text,
      messageType: "text",
      status: "sent",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText("");
    setTimeout(scrollToBottom, 50);

    clearTimeout(typingTimeoutRef.current);
    supportSocket.sendChatTyping({ projectId, isTyping: false, senderRole: "client" });

    const sent = supportSocket.sendChatMessage({
      projectId,
      text,
      clientTempId: tempId,
      senderRole: "client",
      messageType: "text",
    });

    if (!sent && portalToken) {
      try {
        await chatService.sendPortalMessageFallback(portalToken, text, tempId);
      } catch (err) {
        console.error("Client portal fallback message send failed:", err);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ---------------------------------------------------------------------------
  // CLIENT VOICE RECORDING
  // ---------------------------------------------------------------------------
  const startVoiceRecording = async () => {
    if (!portalToken) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported("audio/webm")) {
          if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
            mimeType = "audio/ogg";
          } else {
            mimeType = "";
          }
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Unable to access microphone. Please check browser permissions.");
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !portalToken) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const duration = recordingDuration;
    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("mp4")
          ? "mp4"
          : mimeType.includes("ogg")
          ? "ogg"
          : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioFile = new File([audioBlob], `voice_${Date.now()}.${extension}`, {
          type: mimeType,
        });

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        const uploadRes = await chatService.uploadPortalAttachment(portalToken, audioFile, duration);

        if (uploadRes?.mediaUrl) {
          const tempId = `client-temp-voice-${Date.now()}`;
          const newMsg = {
            id: tempId,
            clientTempId: tempId,
            projectId,
            senderRole: "client",
            senderName: "You",
            text: "",
            messageType: "voice",
            mediaUrl: uploadRes.mediaUrl,
            mediaMimeType: uploadRes.mediaMimeType,
            mediaDuration: duration,
            fileName: uploadRes.fileName,
            fileSize: uploadRes.fileSize,
            status: "sent",
            createdAt: new Date().toISOString(),
          };

          setMessages((prev) => [...prev, newMsg]);
          setTimeout(scrollToBottom, 50);

          supportSocket.sendChatMessage({
            projectId,
            text: "",
            clientTempId: tempId,
            senderRole: "client",
            messageType: "voice",
            mediaUrl: uploadRes.mediaUrl,
            mediaMimeType: uploadRes.mediaMimeType,
            mediaDuration: duration,
            fileName: uploadRes.fileName,
            fileSize: uploadRes.fileSize,
          });
        }
      } catch (err) {
        console.error("Failed to upload client voice note:", err);
      } finally {
        setIsRecording(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  // ---------------------------------------------------------------------------
  // CLIENT ATTACHMENTS & CAMERA
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (e, forcedType = null) => {
    const file = e.target.files?.[0];
    if (!file || !portalToken) return;

    e.target.value = "";
    setAttachmentMenuOpen(false);

    try {
      const uploadRes = await chatService.uploadPortalAttachment(portalToken, file);
      if (uploadRes?.mediaUrl) {
        const msgType =
          forcedType ||
          uploadRes.messageType ||
          (file.type.startsWith("image/") ? "image" : "file");
        const tempId = `client-temp-upload-${Date.now()}`;
        const newMsg = {
          id: tempId,
          clientTempId: tempId,
          projectId,
          senderRole: "client",
          senderName: "You",
          text: "",
          messageType: msgType,
          mediaUrl: uploadRes.mediaUrl,
          mediaMimeType: uploadRes.mediaMimeType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          status: "sent",
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, newMsg]);
        setTimeout(scrollToBottom, 50);

        supportSocket.sendChatMessage({
          projectId,
          text: "",
          clientTempId: tempId,
          senderRole: "client",
          messageType: msgType,
          mediaUrl: uploadRes.mediaUrl,
          mediaMimeType: uploadRes.mediaMimeType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
        });
      }
    } catch (err) {
      console.error("Failed to upload client attachment:", err);
      alert("Failed to upload attachment. Please try again.");
    }
  };

  const openCameraModal = async () => {
    setAttachmentMenuOpen(false);
    setCapturedPhoto(null);
    setPhotoCaption("");
    setCameraModalOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Direct camera access failed, triggering file fallback:", err);
      if (cameraFallbackRef.current) {
        cameraFallbackRef.current.click();
      }
      setCameraModalOpen(false);
    }
  };

  const closeCameraModal = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }
    setCameraStream(null);
    setCapturedPhoto(null);
    setCameraModalOpen(false);
  };

  const snapPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCapturedPhoto({ blob, url });
        }
      },
      "image/jpeg",
      0.9
    );
  };

  const retakePhoto = () => {
    if (capturedPhoto?.url) {
      URL.revokeObjectURL(capturedPhoto.url);
    }
    setCapturedPhoto(null);
  };

  const sendCapturedPhoto = async () => {
    if (!capturedPhoto?.blob || !portalToken) return;

    try {
      const imageFile = new File([capturedPhoto.blob], `camera_${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      closeCameraModal();

      const uploadRes = await chatService.uploadPortalAttachment(portalToken, imageFile);
      if (uploadRes?.mediaUrl) {
        const tempId = `client-temp-photo-${Date.now()}`;
        const caption = photoCaption.trim();
        const newMsg = {
          id: tempId,
          clientTempId: tempId,
          projectId,
          senderRole: "client",
          senderName: "You",
          text: caption,
          messageType: "image",
          mediaUrl: uploadRes.mediaUrl,
          mediaMimeType: uploadRes.mediaMimeType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
          status: "sent",
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, newMsg]);
        setTimeout(scrollToBottom, 50);

        supportSocket.sendChatMessage({
          projectId,
          text: caption,
          clientTempId: tempId,
          senderRole: "client",
          messageType: "image",
          mediaUrl: uploadRes.mediaUrl,
          mediaMimeType: uploadRes.mediaMimeType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
        });
      }
    } catch (err) {
      console.error("Failed to send captured photo:", err);
      alert("Failed to send captured photo. Please try again.");
    }
  };

  const consultantName =
    project?.consultant?.name || project?.consultant_name || "Floxa Consultant";

  return (
    <>
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip"
        onChange={(e) => handleFileUpload(e, "file")}
      />
      <input
        ref={mediaInputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*,video/*"
        onChange={(e) => handleFileUpload(e, "image")}
      />
      <input
        ref={cameraFallbackRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileUpload(e, "image")}
      />

      {/* Floating Action Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          className="floxa-client-chat-trigger-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat with consultant"
        >
          <MessageSquare size={15} strokeWidth={2} />
          <span>Chat with Consultant</span>
          {unreadCount > 0 && (
            <span className="floxa-client-chat-trigger-badge">{unreadCount}</span>
          )}
        </button>
      )}

      {/* Floating / Centered WhatsApp Style Chat Window */}
      {isOpen && (
        <div
          className={`floxa-client-chat-overlay ${isDocked ? "is-docked-overlay" : ""}`}
          onClick={() => {
            if (!isDocked) setIsOpen(false);
          }}
          role="dialog"
          aria-modal={!isDocked}
          aria-labelledby="floxa-client-chat-title"
        >
          <div
            className={`floxa-client-chat-modal ${isDocked ? "is-docked" : "is-centered"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="floxa-client-chat-header">
              <div className="floxa-client-chat-header-info">
                <div className="floxa-client-chat-avatar">
                  {consultantName.slice(0, 2).toUpperCase()}
                </div>
                <div className="floxa-client-chat-titles">
                  <span id="floxa-client-chat-title" className="floxa-client-chat-name">
                    {consultantName}
                  </span>
                  <span className="floxa-client-chat-status">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#25d366",
                        display: "inline-block",
                      }}
                    />
                    <span>Online • Direct Support</span>
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  className="floxa-client-chat-header-btn"
                  onClick={() => {
                    webRTCService.initiateCall({
                      projectId,
                      clientName: "Client",
                      projectTitle: project?.title || project?.company_name || "Brand Project",
                      role: "client",
                      portalToken,
                      callType: "video",
                    });
                  }}
                  title="Video Call Consultant"
                  aria-label="Start Video Call"
                >
                  <Video size={17} />
                </button>
                <button
                  type="button"
                  className="floxa-client-chat-header-btn"
                  onClick={() => {
                    webRTCService.initiateCall({
                      projectId,
                      clientName: "Client",
                      projectTitle: project?.title || project?.company_name || "Brand Project",
                      role: "client",
                      portalToken,
                      callType: "audio",
                    });
                  }}
                  title="Voice Call Consultant"
                  aria-label="Start Voice Call"
                >
                  <Phone size={16} />
                </button>
                <button
                  type="button"
                  className="floxa-client-chat-header-btn"
                  onClick={() => setIsDocked((prev) => !prev)}
                  title={isDocked ? "Center Chat View" : "Dock to Corner"}
                  aria-label={isDocked ? "Center Chat View" : "Dock to Corner"}
                >
                  {isDocked ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button
                  type="button"
                  className="floxa-client-chat-close-btn"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

          {/* Messages Body */}
          <div className="floxa-client-chat-body">
            {messages.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#8696a0",
                  textAlign: "center",
                  padding: 20,
                  fontSize: 13,
                }}
              >
                <ShieldCheck size={28} color="#25d366" style={{ marginBottom: 10 }} />
                <p style={{ color: "#e9edef", fontWeight: 600, marginBottom: 4 }}>
                  Private Project Chat
                </p>
                <p>Send a message directly to your consultant. Real-time notifications enabled.</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOutgoing = msg.senderRole === "client";
                return (
                  <div
                    key={msg.id || msg.clientTempId || index}
                    className={`floxa-client-bubble-row ${isOutgoing ? "outgoing" : "incoming"}`}
                  >
                    <div className="floxa-client-bubble">
                      {!isOutgoing && (
                        <div className="floxa-client-bubble-sender">{consultantName}</div>
                      )}

                      {/* Voice Note */}
                      {msg.messageType === "voice" && msg.mediaUrl ? (
                        <ClientVoicePlayer
                          mediaUrl={msg.mediaUrl}
                          duration={msg.mediaDuration || 0}
                        />
                      ) : null}

                      {/* Image */}
                      {msg.messageType === "image" && msg.mediaUrl ? (
                        <div
                          className="floxa-client-bubble-image"
                          onClick={() => setLightboxImage(msg.mediaUrl)}
                        >
                          <img
                            src={msg.mediaUrl}
                            alt={msg.fileName || "Image"}
                            loading="lazy"
                          />
                          {msg.text ? <p className="floxa-client-bubble-caption">{msg.text}</p> : null}
                        </div>
                      ) : null}

                      {/* File */}
                      {msg.messageType === "file" && msg.mediaUrl ? (
                        <div className="floxa-client-file-box">
                          <FileText size={20} color="#00a884" />
                          <div className="floxa-client-file-info">
                            <span className="floxa-client-file-name" title={msg.fileName || "File"}>
                              {msg.fileName || "Attachment"}
                            </span>
                            <span className="floxa-client-file-sub">
                              {formatFileSize(msg.fileSize)}
                            </span>
                          </div>
                          <a
                            href={msg.mediaUrl}
                            download={msg.fileName || "file"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="floxa-client-file-download-btn"
                            title="Download"
                          >
                            <Download size={14} />
                          </a>
                        </div>
                      ) : null}

                      {/* Text */}
                      {(!msg.messageType || msg.messageType === "text") && msg.text ? (
                        <span className="floxa-client-bubble-text">{msg.text}</span>
                      ) : null}

                      <div className="floxa-client-bubble-meta">
                        <span className="floxa-client-bubble-time">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {isOutgoing && (
                          <span className={`floxa-client-check-icon ${msg.status}`}>
                            {msg.status === "read" ? (
                              <CheckCheck size={13} className="read" />
                            ) : msg.status === "delivered" ? (
                              <CheckCheck size={13} className="delivered" />
                            ) : (
                              <Check size={13} className="sent" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {consultantIsTyping && (
              <div className="floxa-client-bubble-row incoming">
                <div className="floxa-client-typing">
                  <span className="floxa-client-typing-dot" />
                  <span className="floxa-client-typing-dot" />
                  <span className="floxa-client-typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer with Voice, Attachment, Camera */}
          <div className="floxa-client-chat-composer">
            {isRecording ? (
              <div className="floxa-client-recording-bar">
                <div className="floxa-client-recording-left">
                  <span className="floxa-client-recording-dot" />
                  <span className="floxa-client-recording-timer">{formatSeconds(recordingDuration)}</span>
                  <div className="floxa-client-recording-waveform">
                    <span className="floxa-client-wave-bar" />
                    <span className="floxa-client-wave-bar" />
                    <span className="floxa-client-wave-bar" />
                    <span className="floxa-client-wave-bar" />
                    <span className="floxa-client-wave-bar" />
                    <span className="floxa-client-wave-bar" />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    className="floxa-client-recording-trash-btn"
                    onClick={cancelVoiceRecording}
                    title="Discard"
                    aria-label="Discard Voice Note"
                  >
                    <Trash2 size={16} />
                  </button>

                  <button
                    type="button"
                    className="floxa-client-send-btn"
                    onClick={stopAndSendVoiceRecording}
                    title="Send Voice Note"
                    aria-label="Send Voice Note"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Attachment Menu */}
                <div className="floxa-client-attachment-wrapper">
                  <button
                    type="button"
                    className="floxa-client-composer-btn"
                    onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                    title="Attach"
                    aria-label="Attach file"
                  >
                    <Paperclip size={18} />
                  </button>

                  {attachmentMenuOpen && (
                    <div className="floxa-client-attachment-menu">
                      <button
                        type="button"
                        className="floxa-client-attachment-item"
                        onClick={() => fileInputRef.current?.click()}
                        title="Document"
                      >
                        <div className="floxa-client-attachment-circle document">
                          <FileText size={18} />
                        </div>
                        <span className="floxa-client-attachment-tooltip">Document</span>
                      </button>

                      <button
                        type="button"
                        className="floxa-client-attachment-item"
                        onClick={() => mediaInputRef.current?.click()}
                        title="Photos & Videos"
                      >
                        <div className="floxa-client-attachment-circle media">
                          <ImageIcon size={18} />
                        </div>
                        <span className="floxa-client-attachment-tooltip">Photos & Videos</span>
                      </button>

                      <button
                        type="button"
                        className="floxa-client-attachment-item"
                        onClick={openCameraModal}
                        title="Camera"
                      >
                        <div className="floxa-client-attachment-circle camera">
                          <Camera size={18} />
                        </div>
                        <span className="floxa-client-attachment-tooltip">Camera</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Direct Camera Button */}
                <button
                  type="button"
                  className="floxa-client-composer-btn"
                  onClick={openCameraModal}
                  title="Take Photo"
                  aria-label="Take Photo"
                >
                  <Camera size={18} />
                </button>

                <div className="floxa-client-composer-box">
                  <textarea
                    ref={textareaRef}
                    className="floxa-client-textarea"
                    placeholder="Type a message..."
                    rows={1}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                {inputText.trim() ? (
                  <button
                    type="button"
                    className="floxa-client-send-btn"
                    onClick={handleSendMessage}
                    aria-label="Send message"
                  >
                    <Send size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="floxa-client-composer-btn mic-btn"
                    onClick={startVoiceRecording}
                    title="Record voice note"
                    aria-label="Record voice note"
                  >
                    <Mic size={17} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Camera Snapshot Modal */}
          {cameraModalOpen && (
            <div
              className="wa-camera-modal-backdrop"
              onClick={closeCameraModal}
              style={{ position: "fixed", inset: 0, zIndex: 2000 }}
            >
              <div className="wa-camera-modal" onClick={(e) => e.stopPropagation()}>
                <div className="wa-camera-modal-header">
                  <div className="wa-camera-modal-title">
                    <Camera size={18} color="#00a884" />
                    <span>Take Photo</span>
                  </div>
                  <button
                    type="button"
                    className="wa-header-icon-btn"
                    onClick={closeCameraModal}
                    aria-label="Close camera"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="wa-camera-viewfinder-box">
                  {!capturedPhoto ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="wa-camera-video"
                    />
                  ) : (
                    <img
                      src={capturedPhoto.url}
                      alt="Captured"
                      className="wa-camera-preview-img"
                    />
                  )}
                </div>

                <div className="wa-camera-controls">
                  {!capturedPhoto ? (
                    <div className="wa-camera-shutter-row">
                      <button
                        type="button"
                        className="wa-camera-shutter-btn"
                        onClick={snapPhoto}
                        title="Capture Snapshot"
                        aria-label="Capture Snapshot"
                      >
                        <span style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", display: "block" }} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="wa-camera-caption-input-wrap">
                        <input
                          type="text"
                          className="wa-camera-caption-input"
                          placeholder="Add a caption..."
                          value={photoCaption}
                          onChange={(e) => setPhotoCaption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendCapturedPhoto();
                          }}
                        />
                      </div>

                      <div className="wa-camera-action-row">
                        <button
                          type="button"
                          className="wa-camera-retake-btn"
                          onClick={retakePhoto}
                        >
                          <RotateCcw size={15} />
                          <span>Retake</span>
                        </button>

                        <button
                          type="button"
                          className="wa-camera-send-btn"
                          onClick={sendCapturedPhoto}
                        >
                          <Send size={15} />
                          <span>Send Photo</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Image Lightbox Viewer */}
          {lightboxImage && (
            <div
              className="wa-lightbox-backdrop"
              onClick={() => setLightboxImage(null)}
              style={{ position: "fixed", inset: 0, zIndex: 2100 }}
            >
              <div className="wa-lightbox-header">
                <a
                  href={lightboxImage}
                  download="photo.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-lightbox-close-btn"
                  title="Download Photo"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={18} />
                </a>
                <button
                  type="button"
                  className="wa-lightbox-close-btn"
                  onClick={() => setLightboxImage(null)}
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <img
                src={lightboxImage}
                alt="Expanded"
                className="wa-lightbox-img"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          </div>
        </div>
      )}
    </>
  );
}

export default ClientPortalChatWidget;
