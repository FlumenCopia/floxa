"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Send,
  Check,
  CheckCheck,
  MessageSquare,
  Lock,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  Video,
  Phone,
  MoreVertical,
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
  ShieldCheck,
  User,
} from "lucide-react";
import { supportSocket } from "@/services/supportSocketService";
import { chatService } from "@/services/chatService";
import { webRTCService } from "@/services/webRTCService";
import "./WhatsAppChatView.css";

function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatGroupDate(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const now = new Date();
  if (Number.isNaN(d.getTime())) return "";

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "offline";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "offline";

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "last seen just now";
  }

  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return `last seen today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `last seen yesterday at ${timeStr}`;
  }

  return `last seen on ${d.toLocaleDateString([], { day: "numeric", month: "short" })} at ${timeStr}`;
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

function getInitials(name = "Client") {
  const parts = String(name).trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarGradient(index = 0) {
  const gradients = [
    "gradient-1",
    "gradient-2",
    "gradient-3",
    "gradient-4",
    "gradient-5",
  ];
  return gradients[index % gradients.length];
}

/**
 * WhatsApp Voice Note Player Component
 */
function WhatsAppVoicePlayer({ mediaUrl, duration = 0 }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
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
      audio.playbackRate = playbackSpeed;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Playback error:", err));
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

  const toggleSpeed = (e) => {
    e.stopPropagation();
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const totalDur = audioRef.current?.duration || duration || 0;
  const progressPercent = totalDur > 0 ? (currentTime / totalDur) * 100 : 0;

  return (
    <div className="wa-voice-bubble">
      <audio ref={audioRef} src={mediaUrl} preload="metadata" />
      <button
        type="button"
        className="wa-voice-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? (
          <Pause size={17} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />
        )}
      </button>

      <div className="wa-voice-track-wrap">
        <div className="wa-voice-progress-bar" onClick={handleSeek}>
          <div className="wa-voice-progress-fill" style={{ width: `${progressPercent}%` }}>
            <span className="wa-voice-progress-thumb" />
          </div>
        </div>

        <div className="wa-voice-meta-row">
          <span>{formatSeconds(isPlaying ? currentTime : totalDur)}</span>
          <span className="wa-voice-speed-pill" onClick={toggleSpeed}>
            {playbackSpeed}x
          </span>
          <span className="wa-voice-mic-badge">
            <Mic size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppChatView({ initialProjectId = null }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const [clientIsTyping, setClientIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [, setPresenceTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPresenceTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // In-Chat Search & Header controls
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);

  // Attachment & Camera & Voice Recording
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load conversations on mount
  useEffect(() => {
    let isMounted = true;
    const loadConversations = async () => {
      try {
        setLoading(true);
        const data = await chatService.fetchConversations();
        if (isMounted && data?.conversations) {
          setConversations(data.conversations);

          // If initialProjectId provided, select it
          if (initialProjectId) {
            const match = data.conversations.find((c) => c.projectId === initialProjectId);
            if (match) setSelectedConversation(match);
          } else if (data.conversations.length > 0) {
            const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
            if (!isMobile) {
              setSelectedConversation(data.conversations[0]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load chat conversations:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConversations();

    return () => {
      isMounted = false;
    };
  }, [initialProjectId]);

  // Load messages when selectedConversation changes
  useEffect(() => {
    if (!selectedConversation?.projectId) return;

    let isMounted = true;
    const loadMessages = async () => {
      try {
        setMessagesLoading(true);
        const data = await chatService.fetchProjectMessages(selectedConversation.projectId);
        if (isMounted && data?.messages) {
          setMessages(data.messages);
          scrollToBottom();

          // Mark as read on server
          chatService.markProjectMessagesRead(selectedConversation.projectId).catch(() => {});
          supportSocket.sendChatRead({ projectId: selectedConversation.projectId, readBy: "consultant" });

          // Reset unread count in local list
          setConversations((prev) =>
            prev.map((c) =>
              c.projectId === selectedConversation.projectId ? { ...c, unreadCount: 0 } : c
            )
          );
        }
      } catch (err) {
        console.error("Failed to load project messages:", err);
      } finally {
        if (isMounted) setMessagesLoading(false);
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedConversation?.projectId]);

  // Real-time WebSocket subscriptions
  useEffect(() => {
    const unsubMessage = supportSocket.on("chat_message_new", (newMsg) => {
      if (!newMsg) return;

      // Update conversation list item lastMessage & unread count
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.projectId === newMsg.projectId);
        if (idx === -1) return prev;

        const updated = [...prev];
        const isCurrentActive = selectedConversation?.projectId === newMsg.projectId;
        const currentUnread = updated[idx].unreadCount || 0;

        updated[idx] = {
          ...updated[idx],
          lastMessage: {
            id: newMsg.id,
            text: newMsg.text,
            messageType: newMsg.messageType || "text",
            mediaUrl: newMsg.mediaUrl || null,
            fileName: newMsg.fileName || null,
            senderRole: newMsg.senderRole,
            senderName: newMsg.senderName,
            status: newMsg.status,
            createdAt: newMsg.createdAt,
          },
          updatedAt: newMsg.createdAt,
          isOnline: newMsg.senderRole === "client" ? true : updated[idx].isOnline,
          lastSeen: newMsg.senderRole === "client" ? newMsg.createdAt : updated[idx].lastSeen,
          unreadCount:
            !isCurrentActive && newMsg.senderRole === "client"
              ? currentUnread + 1
              : isCurrentActive
              ? 0
              : currentUnread,
        };

        // Move active conversation to top
        const item = updated.splice(idx, 1)[0];
        return [item, ...updated];
      });

      // If active conversation, append message and mark read if from client
      if (selectedConversation?.projectId === newMsg.projectId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id || (m.clientTempId && m.clientTempId === newMsg.clientTempId))) {
            return prev.map((m) =>
              (m.id === newMsg.id || (m.clientTempId && m.clientTempId === newMsg.clientTempId)) ? newMsg : m
            );
          }
          return [...prev, newMsg];
        });

        if (newMsg.senderRole === "client") {
          supportSocket.sendChatRead({ projectId: newMsg.projectId, readBy: "consultant" });
          chatService.markProjectMessagesRead(newMsg.projectId).catch(() => {});
          setSelectedConversation((prevConv) => {
            if (prevConv?.projectId === newMsg.projectId) {
              return { ...prevConv, isOnline: true, lastSeen: newMsg.createdAt };
            }
            return prevConv;
          });
        }

        setTimeout(scrollToBottom, 50);
      }
    });

    const unsubTyping = supportSocket.on("chat_typing", (data) => {
      if (data?.projectId === selectedConversation?.projectId && data?.senderRole === "client") {
        setClientIsTyping(Boolean(data.isTyping));
        if (data.isTyping) {
          setSelectedConversation((prev) => (prev ? { ...prev, isOnline: true } : prev));
        }
      }
    });

    const unsubPresence = supportSocket.on("client_presence", (data) => {
      if (!data?.projectId) return;

      setConversations((prev) =>
        prev.map((c) =>
          c.projectId === data.projectId
            ? {
                ...c,
                isOnline: Boolean(data.isOnline),
                lastSeen: data.lastSeen || new Date().toISOString(),
              }
            : c
        )
      );

      setSelectedConversation((prev) => {
        if (prev?.projectId === data.projectId) {
          return {
            ...prev,
            isOnline: Boolean(data.isOnline),
            lastSeen: data.lastSeen || new Date().toISOString(),
          };
        }
        return prev;
      });
    });

    const unsubRead = supportSocket.on("chat_messages_read", (data) => {
      if (data?.projectId === selectedConversation?.projectId && data?.readBy === "client") {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderRole === "consultant" ? { ...m, status: "read", readAt: data.readAt || new Date() } : m
          )
        );
      }
    });

    return () => {
      unsubMessage();
      unsubTyping();
      unsubRead();
      unsubPresence();
    };
  }, [selectedConversation?.projectId]);

  // Clean up recording or camera stream on unmount
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

  // Handle typing debounce
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (selectedConversation?.projectId) {
      supportSocket.sendChatTyping({ projectId: selectedConversation.projectId, isTyping: true, senderRole: "consultant" });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        supportSocket.sendChatTyping({ projectId: selectedConversation.projectId, isTyping: false, senderRole: "consultant" });
      }, 2000);
    }
  };

  // Handle Send Text Message
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !selectedConversation?.projectId) return;

    const tempId = `temp-${Date.now()}`;
    const newMsg = {
      id: tempId,
      clientTempId: tempId,
      projectId: selectedConversation.projectId,
      senderRole: "consultant",
      senderName: "You",
      text,
      messageType: "text",
      status: "sent",
      createdAt: new Date().toISOString(),
    };

    // Optimistic append
    setMessages((prev) => [...prev, newMsg]);
    setInputText("");
    setTimeout(scrollToBottom, 50);

    // Stop typing indicator
    clearTimeout(typingTimeoutRef.current);
    supportSocket.sendChatTyping({ projectId: selectedConversation.projectId, isTyping: false, senderRole: "consultant" });

    // Send through WebSocket
    const sent = supportSocket.sendChatMessage({
      projectId: selectedConversation.projectId,
      text,
      clientTempId: tempId,
      senderRole: "consultant",
      messageType: "text",
    });

    // If socket failed, send via REST fallback
    if (!sent) {
      try {
        await chatService.sendProjectMessageFallback(selectedConversation.projectId, text, tempId);
      } catch (err) {
        console.error("REST fallback message send failed:", err);
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
  // VOICE RECORDING CONTROLS
  // ---------------------------------------------------------------------------
  const startVoiceRecording = async () => {
    if (!selectedConversation?.projectId) return;
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
      alert("Unable to access microphone. Please check your browser audio permissions.");
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
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
    if (!mediaRecorderRef.current || !selectedConversation?.projectId) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

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

        const uploadRes = await chatService.uploadProjectAttachment(
          selectedConversation.projectId,
          audioFile,
          duration
        );

        if (uploadRes?.mediaUrl) {
          const tempId = `temp-voice-${Date.now()}`;
          const newMsg = {
            id: tempId,
            clientTempId: tempId,
            projectId: selectedConversation.projectId,
            senderRole: "consultant",
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
            projectId: selectedConversation.projectId,
            text: "",
            clientTempId: tempId,
            senderRole: "consultant",
            messageType: "voice",
            mediaUrl: uploadRes.mediaUrl,
            mediaMimeType: uploadRes.mediaMimeType,
            mediaDuration: duration,
            fileName: uploadRes.fileName,
            fileSize: uploadRes.fileSize,
          });
        }
      } catch (err) {
        console.error("Failed to upload voice message:", err);
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
  // FILE & MEDIA ATTACHMENTS
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (e, forcedType = null) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation?.projectId) return;

    e.target.value = "";
    setAttachmentMenuOpen(false);

    try {
      const uploadRes = await chatService.uploadProjectAttachment(
        selectedConversation.projectId,
        file
      );

      if (uploadRes?.mediaUrl) {
        const msgType =
          forcedType ||
          uploadRes.messageType ||
          (file.type.startsWith("image/") ? "image" : "file");
        const tempId = `temp-upload-${Date.now()}`;
        const newMsg = {
          id: tempId,
          clientTempId: tempId,
          projectId: selectedConversation.projectId,
          senderRole: "consultant",
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
          projectId: selectedConversation.projectId,
          text: "",
          clientTempId: tempId,
          senderRole: "consultant",
          messageType: msgType,
          mediaUrl: uploadRes.mediaUrl,
          mediaMimeType: uploadRes.mediaMimeType,
          fileName: uploadRes.fileName,
          fileSize: uploadRes.fileSize,
        });
      }
    } catch (err) {
      console.error("Failed to upload attachment:", err);
      alert("Failed to upload attachment. Please try again.");
    }
  };

  // ---------------------------------------------------------------------------
  // CAMERA SNAPSHOT CONTROLS
  // ---------------------------------------------------------------------------
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
      console.warn("Direct camera access failed, falling back to file capture:", err);
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

  // Keep camera stream attached to video element across renders / retakes
  useEffect(() => {
    if (cameraModalOpen && cameraStream && videoRef.current && !capturedPhoto) {
      if (videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
      }
    }
  }, [cameraModalOpen, cameraStream, capturedPhoto]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  const sendCapturedPhoto = async () => {
    if (!capturedPhoto?.blob || !selectedConversation?.projectId) return;

    try {
      const imageFile = new File([capturedPhoto.blob], `camera_${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      closeCameraModal();

      const uploadRes = await chatService.uploadProjectAttachment(
        selectedConversation.projectId,
        imageFile
      );

      if (uploadRes?.mediaUrl) {
        const tempId = `temp-photo-${Date.now()}`;
        const caption = photoCaption.trim();
        const newMsg = {
          id: tempId,
          clientTempId: tempId,
          projectId: selectedConversation.projectId,
          senderRole: "consultant",
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
          projectId: selectedConversation.projectId,
          text: caption,
          clientTempId: tempId,
          senderRole: "consultant",
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

  // Filter conversations in sidebar
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.clientName?.toLowerCase().includes(q) ||
        c.projectTitle?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Filter messages in active chat
  const displayedMessages = useMemo(() => {
    if (!chatSearchOpen || !chatSearchQuery.trim()) return messages;
    const q = chatSearchQuery.toLowerCase().trim();
    return messages.filter(
      (m) =>
        m.text?.toLowerCase().includes(q) ||
        m.fileName?.toLowerCase().includes(q) ||
        m.messageType?.toLowerCase().includes(q)
    );
  }, [messages, chatSearchOpen, chatSearchQuery]);

  return (
    <div className={`wa-chat-container ${selectedConversation ? "has-active-chat" : "no-active-chat"}`}>
      {/* Hidden File Pickers */}
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

      {/* -------------------------------------------------------------------
          LEFT SIDEBAR: CONVERSATION LIST
          ------------------------------------------------------------------- */}
      <aside className="wa-sidebar">
        <div className="wa-search-bar-wrap">
          <div className="wa-search-input-box">
            <Search size={15} color="#8696a0" />
            <input
              type="text"
              className="wa-search-input"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="wa-search-clear"
                onClick={() => setSearchQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="wa-conversation-list">
          {loading ? (
            <div className="wa-empty-sidebar">
              <Sparkles size={28} className="wa-empty-sidebar-icon" />
              <p>Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="wa-empty-sidebar">
              <MessageSquare size={28} className="wa-empty-sidebar-icon" />
              <p>No active conversations found</p>
            </div>
          ) : (
            filteredConversations.map((conv, idx) => {
              const isSelected = selectedConversation?.projectId === conv.projectId;
              const lastMsg = conv.lastMessage;
              let snippetText = "No messages yet";
              if (lastMsg) {
                if (lastMsg.messageType === "voice") {
                  snippetText = "🎤 Voice message";
                } else if (lastMsg.messageType === "image") {
                  snippetText = "📷 Photo";
                } else if (lastMsg.messageType === "file") {
                  snippetText = `📄 ${lastMsg.fileName || "Document"}`;
                } else if (lastMsg.text) {
                  snippetText = lastMsg.text;
                }
              }

              return (
                <div
                  key={conv.projectId}
                  className={`wa-conv-item ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  <div className="wa-avatar-wrap" style={{ position: "relative" }}>
                    <div className={`wa-avatar ${getAvatarGradient(idx)}`}>
                      {getInitials(conv.clientName)}
                    </div>
                    {conv.isOnline && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 1,
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: "#25d366",
                          border: "2px solid #111b21",
                          boxShadow: "0 0 4px #25d366",
                        }}
                        title="Online"
                      />
                    )}
                  </div>

                  <div className="wa-conv-content">
                    <div className="wa-conv-top">
                      <span className="wa-conv-name">{conv.clientName}</span>
                      <span className="wa-conv-time">
                        {lastMsg ? formatMessageTime(lastMsg.createdAt) : ""}
                      </span>
                    </div>

                    <div className="wa-conv-bottom">
                      <div className="wa-conv-snippet">
                        <span className="wa-conv-project-tag">{conv.projectTitle}</span>
                        {lastMsg?.senderRole === "consultant" && (
                          <span className="wa-check-icon sent">
                            <Check size={13} />
                          </span>
                        )}
                        <span>{snippetText}</span>
                      </div>

                      {conv.unreadCount > 0 && (
                        <span className="wa-unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* -------------------------------------------------------------------
          RIGHT CHAT PANE
          ------------------------------------------------------------------- */}
      <main className="wa-chat-main">
        <div className="wa-chat-pattern" />

        {selectedConversation ? (
          <>
            {/* Top Bar with WhatsApp Controls */}
            <div className="wa-chat-header">
              <div className="wa-chat-header-left">
                <button
                  type="button"
                  className="wa-mobile-back-btn"
                  onClick={() => setSelectedConversation(null)}
                  title="Back to chats"
                  aria-label="Back to conversations list"
                >
                  <ArrowLeft size={20} />
                </button>
                <div
                  className="wa-chat-header-info"
                  style={{ cursor: "pointer" }}
                  onClick={() => setIsContactDrawerOpen(true)}
                >
                  <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                    <div className="wa-avatar gradient-1">
                      {getInitials(selectedConversation.clientName)}
                    </div>
                    {selectedConversation.isOnline && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          right: 0,
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "#25d366",
                          border: "2px solid #202c33",
                          boxShadow: "0 0 6px #25d366",
                        }}
                        title="Online"
                      />
                    )}
                  </div>
                  <div className="wa-chat-header-text">
                    <div className="wa-chat-header-name">
                      {selectedConversation.clientName}
                    </div>
                    <div className="wa-chat-header-subtitle">
                      <span>{selectedConversation.projectTitle}</span>
                      <span>•</span>
                      {clientIsTyping ? (
                        <span style={{ color: "#25d366", fontStyle: "italic", fontWeight: 500 }}>
                          typing...
                        </span>
                      ) : selectedConversation.isOnline ? (
                        <span style={{ color: "#25d366", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#25d366",
                              display: "inline-block",
                              boxShadow: "0 0 6px #25d366",
                            }}
                          />
                          <span>online</span>
                        </span>
                      ) : (
                        <span style={{ color: "#8696a0" }}>
                          {formatLastSeen(selectedConversation.lastSeen)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Authentic WhatsApp Header Actions */}
              <div className="wa-chat-header-actions">
                <button
                  type="button"
                  className="wa-header-icon-btn"
                  title="Video Call"
                  onClick={() => {
                    if (!selectedConversation?.projectId) return;
                    webRTCService.initiateCall({
                      projectId: selectedConversation.projectId,
                      clientName: selectedConversation.clientName || selectedConversation.companyName || "Client",
                      projectTitle: selectedConversation.projectTitle || "Project",
                      role: "consultant",
                      callType: "video",
                    });
                  }}
                  aria-label="Start Video Call"
                >
                  <Video size={20} />
                </button>

                <button
                  type="button"
                  className="wa-header-icon-btn"
                  title="Voice Call"
                  onClick={() => {
                    if (!selectedConversation?.projectId) return;
                    webRTCService.initiateCall({
                      projectId: selectedConversation.projectId,
                      clientName: selectedConversation.clientName || selectedConversation.companyName || "Client",
                      projectTitle: selectedConversation.projectTitle || "Project",
                      role: "consultant",
                      callType: "audio",
                    });
                  }}
                  aria-label="Start Voice Call"
                >
                  <Phone size={19} />
                </button>

                <button
                  type="button"
                  className={`wa-header-icon-btn ${chatSearchOpen ? "active" : ""}`}
                  title="Search in Chat"
                  onClick={() => {
                    setChatSearchOpen((prev) => !prev);
                    if (chatSearchOpen) setChatSearchQuery("");
                  }}
                  aria-label="Search Messages"
                >
                  <Search size={19} />
                </button>

                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={`wa-header-icon-btn ${headerMenuOpen ? "active" : ""}`}
                    title="More Options"
                    onClick={() => setHeaderMenuOpen((prev) => !prev)}
                    aria-label="More Options"
                  >
                    <MoreVertical size={20} />
                  </button>

                  {headerMenuOpen && (
                    <div
                      className="wa-header-dropdown"
                      onClick={() => setHeaderMenuOpen(false)}
                    >
                      <button
                        type="button"
                        className="wa-dropdown-item"
                        onClick={() => setIsContactDrawerOpen(true)}
                      >
                        <User size={16} />
                        <span>Contact info</span>
                      </button>
                      <button
                        type="button"
                        className="wa-dropdown-item"
                        onClick={() => {
                          setChatSearchOpen(true);
                        }}
                      >
                        <Search size={16} />
                        <span>Search messages</span>
                      </button>
                      <button
                        type="button"
                        className="wa-dropdown-item"
                        onClick={() => {
                          setMessages([]);
                        }}
                      >
                        <Trash2 size={16} />
                        <span>Clear messages view</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* In-Chat Search Bar */}
            {chatSearchOpen && (
              <div className="wa-inchat-search-bar">
                <div className="wa-inchat-search-input-wrap">
                  <Search size={15} color="#8696a0" />
                  <input
                    type="text"
                    className="wa-inchat-search-input"
                    placeholder="Search messages in this chat..."
                    autoFocus
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                  />
                  {chatSearchQuery && (
                    <span className="wa-inchat-search-count">
                      {displayedMessages.length} match{displayedMessages.length === 1 ? "" : "es"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="wa-header-icon-btn"
                  onClick={() => {
                    setChatSearchOpen(false);
                    setChatSearchQuery("");
                  }}
                  aria-label="Close search"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Slide-over Contact Info Drawer */}
            {isContactDrawerOpen && (
              <div className="wa-contact-drawer">
                <div className="wa-drawer-header">
                  <button
                    type="button"
                    className="wa-header-icon-btn"
                    onClick={() => setIsContactDrawerOpen(false)}
                    aria-label="Close contact info"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <span className="wa-drawer-title">Contact Info</span>
                </div>

                <div className="wa-drawer-body">
                  <div className="wa-drawer-avatar gradient-1">
                    {getInitials(selectedConversation.clientName)}
                  </div>

                  <div className="wa-drawer-client-name">
                    {selectedConversation.clientName}
                  </div>

                  <div className="wa-drawer-section">
                    <div className="wa-drawer-label">Project Title</div>
                    <div className="wa-drawer-value">{selectedConversation.projectTitle}</div>
                  </div>

                  {selectedConversation.companyName && (
                    <div className="wa-drawer-section">
                      <div className="wa-drawer-label">Company</div>
                      <div className="wa-drawer-value">{selectedConversation.companyName}</div>
                    </div>
                  )}

                  <div className="wa-drawer-section">
                    <div className="wa-drawer-label">Shared Media & Files</div>
                    <div className="wa-drawer-value">
                      {messages.filter((m) => m.mediaUrl).length} attachment(s)
                    </div>
                  </div>

                  <div className="wa-drawer-section">
                    <div className="wa-drawer-label">Client Status</div>
                    <div
                      className="wa-drawer-value"
                      style={{
                        color: selectedConversation.isOnline ? "#25d366" : "#8696a0",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: selectedConversation.isOnline ? "#25d366" : "#8696a0",
                          boxShadow: selectedConversation.isOnline ? "0 0 6px #25d366" : "none",
                        }}
                      />
                      <span>
                        {clientIsTyping
                          ? "Typing..."
                          : selectedConversation.isOnline
                          ? "Online now"
                          : formatLastSeen(selectedConversation.lastSeen)}
                      </span>
                    </div>
                  </div>

                  {selectedConversation.portalToken && (
                    <Link
                      href={`/client/${selectedConversation.portalToken}?mode=consultant&consultant=true`}
                      target="_blank"
                      className="wa-action-btn"
                      style={{ width: "100%", justifyContent: "center", padding: "10px 16px" }}
                    >
                      <ExternalLink size={14} />
                      <span>Open Live Client Portal</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="wa-messages-area">
              <div className="wa-date-divider">
                <span>Direct Client Line</span>
              </div>

              {messagesLoading ? (
                <div className="wa-empty-sidebar" style={{ height: "100%" }}>
                  <p>Loading messages...</p>
                </div>
              ) : displayedMessages.length === 0 ? (
                <div className="wa-empty-sidebar" style={{ height: "100%" }}>
                  <p>{chatSearchQuery ? "No matching messages found." : "No messages yet. Say hello!"}</p>
                </div>
              ) : (
                displayedMessages.map((msg, index) => {
                  const isOutgoing = msg.senderRole === "consultant";
                  const prevMsg = displayedMessages[index - 1];
                  const showDate =
                    !prevMsg ||
                    formatGroupDate(prevMsg.createdAt) !== formatGroupDate(msg.createdAt);

                  return (
                    <React.Fragment key={msg.id || msg.clientTempId || index}>
                      {showDate && (
                        <div className="wa-date-divider">
                          <span>{formatGroupDate(msg.createdAt)}</span>
                        </div>
                      )}

                      <div className={`wa-message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
                        <div className="wa-bubble">
                          {!isOutgoing && (
                            <div className="wa-bubble-sender">
                              {selectedConversation.clientName}
                            </div>
                          )}

                          {/* 1. Voice Note Bubble */}
                          {msg.messageType === "voice" && msg.mediaUrl ? (
                            <WhatsAppVoicePlayer
                              mediaUrl={msg.mediaUrl}
                              duration={msg.mediaDuration || 0}
                              isOutgoing={isOutgoing}
                            />
                          ) : null}

                          {/* 2. Image Message Bubble */}
                          {msg.messageType === "image" && msg.mediaUrl ? (
                            <div className="wa-image-card" onClick={() => setLightboxImage(msg.mediaUrl)}>
                              <img
                                src={msg.mediaUrl}
                                alt={msg.fileName || "Chat image"}
                                className="wa-image-thumb"
                                loading="lazy"
                              />
                              {msg.text ? <p className="wa-image-caption">{msg.text}</p> : null}
                            </div>
                          ) : null}

                          {/* 3. Document / File Message Bubble */}
                          {msg.messageType === "file" && msg.mediaUrl ? (
                            <div className="wa-file-card">
                              <div className="wa-file-icon-box">
                                <FileText size={22} />
                              </div>
                              <div className="wa-file-info">
                                <span className="wa-file-name" title={msg.fileName || "File"}>
                                  {msg.fileName || "Attachment"}
                                </span>
                                <span className="wa-file-sub">
                                  {formatFileSize(msg.fileSize)}
                                </span>
                              </div>
                              <a
                                href={msg.mediaUrl}
                                download={msg.fileName || "file"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="wa-file-download-btn"
                                title="Download File"
                              >
                                <Download size={16} />
                              </a>
                            </div>
                          ) : null}

                          {/* 4. Text Message Bubble */}
                          {(!msg.messageType || msg.messageType === "text") && msg.text ? (
                            <span className="wa-bubble-text">{msg.text}</span>
                          ) : null}

                          {/* Timestamp & Delivery status checkmark */}
                          <div className="wa-bubble-meta">
                            <span className="wa-bubble-time">
                              {formatMessageTime(msg.createdAt)}
                            </span>

                            {isOutgoing && (
                              <span className={`wa-check-icon ${msg.status}`}>
                                {msg.status === "read" ? (
                                  <CheckCheck size={14} className="read" />
                                ) : msg.status === "delivered" ? (
                                  <CheckCheck size={14} className="delivered" />
                                ) : (
                                  <Check size={14} className="sent" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}

              {/* Typing indicator */}
              {clientIsTyping && (
                <div className="wa-message-row incoming">
                  <div className="wa-typing-bubble">
                    <span className="wa-typing-dot" />
                    <span className="wa-typing-dot" />
                    <span className="wa-typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Composer Bar */}
            <div className="wa-composer-bar">
              {isRecording ? (
                /* Active Recording Bar */
                <div className="wa-recording-bar">
                  <div className="wa-recording-left">
                    <span className="wa-recording-dot" />
                    <span className="wa-recording-timer">{formatSeconds(recordingDuration)}</span>
                    <div className="wa-recording-waveform">
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                      <span className="wa-wave-bar" />
                    </div>
                  </div>

                  <div className="wa-recording-right">
                    <button
                      type="button"
                      className="wa-recording-trash-btn"
                      onClick={cancelVoiceRecording}
                      title="Discard Voice Note"
                      aria-label="Discard Voice Note"
                    >
                      <Trash2 size={19} />
                    </button>

                    <button
                      type="button"
                      className="wa-send-btn"
                      onClick={stopAndSendVoiceRecording}
                      title="Send Voice Note"
                      aria-label="Send Voice Note"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Composer with WhatsApp Attachment & Camera buttons */
                <>
                  {/* Attachment Pop-up Menu */}
                  <div className="wa-attachment-wrapper">
                    <button
                      type="button"
                      className="wa-composer-btn"
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      title="Attach"
                      aria-label="Attach file"
                    >
                      <Paperclip size={20} />
                    </button>

                    {attachmentMenuOpen && (
                      <div className="wa-attachment-menu">
                        <button
                          type="button"
                          className="wa-attachment-item"
                          onClick={() => fileInputRef.current?.click()}
                          title="Document"
                        >
                          <div className="wa-attachment-circle document">
                            <FileText size={22} />
                          </div>
                          <span className="wa-attachment-tooltip">Document</span>
                        </button>

                        <button
                          type="button"
                          className="wa-attachment-item"
                          onClick={() => mediaInputRef.current?.click()}
                          title="Photos & Videos"
                        >
                          <div className="wa-attachment-circle media">
                            <ImageIcon size={22} />
                          </div>
                          <span className="wa-attachment-tooltip">Photos & Videos</span>
                        </button>

                        <button
                          type="button"
                          className="wa-attachment-item"
                          onClick={openCameraModal}
                          title="Camera"
                        >
                          <div className="wa-attachment-circle camera">
                            <Camera size={22} />
                          </div>
                          <span className="wa-attachment-tooltip">Camera</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Direct Camera Button */}
                  <button
                    type="button"
                    className="wa-composer-btn"
                    onClick={openCameraModal}
                    title="Take Photo"
                    aria-label="Take Photo"
                  >
                    <Camera size={20} />
                  </button>

                  {/* Text Input Wrap */}
                  <div className="wa-composer-input-wrap">
                    <textarea
                      ref={textareaRef}
                      className="wa-composer-textarea"
                      placeholder="Type a message (Press Enter to send)..."
                      rows={1}
                      value={inputText}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  {/* Right Action: Send (when text present) or Mic (when text empty) */}
                  {inputText.trim() ? (
                    <button
                      type="button"
                      className="wa-send-btn"
                      onClick={handleSendMessage}
                      title="Send message"
                      aria-label="Send message"
                    >
                      <Send size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wa-composer-btn mic-btn"
                      onClick={startVoiceRecording}
                      title="Record Voice Message"
                      aria-label="Record Voice Message"
                    >
                      <Mic size={20} />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Camera Snapshot Modal */}
            {cameraModalOpen && (
              <div className="wa-camera-modal-backdrop" onClick={closeCameraModal}>
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
                        alt="Captured frame"
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
                          <span className="wa-camera-shutter-inner" />
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

            {/* Lightbox Viewer */}
            {lightboxImage && (
              <div className="wa-lightbox-backdrop" onClick={() => setLightboxImage(null)}>
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
          </>
        ) : (
          <div className="wa-chat-empty-state">
            <div className="wa-chat-empty-hero-icon">
              <MessageSquare size={38} />
            </div>
            <h2 className="wa-chat-empty-title">Floxa Client Chat</h2>
            <p className="wa-chat-empty-desc">
              Send and receive real-time messages with your clients. Select a conversation from
              the left sidebar to view messages, share project feedback, and collaborate instantly.
            </p>
            <div className="wa-chat-lock-note">
              <Lock size={12} />
              <span>Real-time WebSocket connection enabled</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
