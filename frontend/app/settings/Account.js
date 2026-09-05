"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentConsultant, updateCurrentConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";
import { Camera, Upload, Trash2 } from "lucide-react";

function getAccountErrorMessage(error, fallback = "Profile could not be updated.") {
  if (error?.detail) {
    return Array.isArray(error.detail) ? error.detail.join(" ") : error.detail;
  }

  if (error?.message) {
    return error.message;
  }

  const firstFieldError = Object.values(error || {}).flat()[0];
  if (firstFieldError) {
    return Array.isArray(firstFieldError) ? firstFieldError.join(" ") : firstFieldError;
  }

  return fallback;
}

export default function Account() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");

  // Camera capture states
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      try {
        const consultant = await getCurrentConsultant();

        if (!isMounted) {
          return;
        }

        setFormData({
          name: consultant?.name || "",
          email: consultant?.email || "",
          company: consultant?.company || "",
          phone: consultant?.phone || "",
        });
        setAvatarUrl(consultant?.avatar_url || consultant?.avatar || "");
      } catch (error) {
        console.error("Failed to load account profile:", error);
        if (isMounted) {
          const message = getAccountErrorMessage(error, "Profile could not be loaded.");
          setMessage(message);
          showError(message);
        }
      }
    }

    loadAccount();

    return () => {
      isMounted = false;
    };
  }, []);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // Stop camera tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  };

  const handleAvatarSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showError("Please select a valid image file (JPG, PNG, WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError("Profile image must be smaller than 5MB.");
      return;
    }

    const payload = new FormData();
    payload.append("avatar", file);

    setUploadingAvatar(true);
    setMenuOpen(false);
    try {
      const updated = await updateCurrentConsultant(payload);
      setAvatarUrl(updated?.avatar_url || updated?.avatar || "");
      showSuccess("Profile picture updated.");
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      showError(getAccountErrorMessage(err, "Failed to upload profile picture."));
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleAvatarRemove = async () => {
    const payload = new FormData();
    payload.append("avatar", "");

    setUploadingAvatar(true);
    setMenuOpen(false);
    try {
      const updated = await updateCurrentConsultant(payload);
      setAvatarUrl("");
      showSuccess("Profile picture removed.");
    } catch (err) {
      console.error("Failed to remove avatar:", err);
      showError(getAccountErrorMessage(err, "Failed to remove profile picture."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Camera Handlers
  const startCamera = async () => {
    setMenuOpen(false);
    setCameraOpen(true);
    setCameraError("");
    setCapturedImage(null);
    setCapturedBlob(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported on this browser or device.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Camera permission was denied. Please allow camera access in your browser settings."
          : err.message || "Unable to access camera."
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCapturedImage(null);
    setCapturedBlob(null);
    setCameraError("");
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
    const startX = ((video.videoWidth || 480) - size) / 2;
    const startY = ((video.videoHeight || 480) - size) / 2;

    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // Mirror image for natural selfie feel
    ctx.translate(480, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 480, 480);

    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedImage(previewUrl);
      }
    }, "image/jpeg", 0.92);
  };

  const retakePhoto = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
  };

  const saveCapturedPhoto = async () => {
    if (!capturedBlob) return;

    const file = new File([capturedBlob], `camera-avatar-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    const payload = new FormData();
    payload.append("avatar", file);

    setUploadingAvatar(true);
    try {
      const updated = await updateCurrentConsultant(payload);
      setAvatarUrl(updated?.avatar_url || updated?.avatar || "");
      showSuccess("Profile photo updated from camera.");
      stopCamera();
    } catch (err) {
      console.error("Failed to upload camera avatar:", err);
      showError(getAccountErrorMessage(err, "Failed to save camera photo."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return "C";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleSave = async () => {
    setMessage("");

    const name = formData.name.trim();
    const company = formData.company.trim();
    const phone = formData.phone.trim();

    if (!name || !company) {
      const message = "Please complete all required account fields.";
      setMessage(message);
      showError(message);
      return;
    }

    if (phone && !/^\d{10}$/.test(phone)) {
      const message = "Phone number must be exactly 10 digits.";
      setMessage(message);
      showError(message);
      return;
    }

    try {
      const updatedConsultant = await updateCurrentConsultant({
        name,
        company,
        phone,
      });

      setFormData({
        name: updatedConsultant?.name || "",
        email: updatedConsultant?.email || "",
        company: updatedConsultant?.company || "",
        phone: updatedConsultant?.phone || "",
      });
      setMessage("Profile updated successfully.");
      showSuccess("Profile updated successfully.");
    } catch (error) {
      console.error("Failed to update account profile:", error);
      const message = getAccountErrorMessage(error);
      setMessage(message);
      showError(message);
    }
  };

  const handleDeleteAccount = () => {
    showError("Please contact support to request permanent account deletion.");
  };

  return (
    <>
      {/* Reference Styled Profile Picture Card */}
      <div
        className="card settings-card mb-3"
        ref={menuRef}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
          
          {/* Circular Avatar with Overlapping Camera Button */}
          <div style={{ position: "relative", width: "90px", height: "90px", flexShrink: 0 }}>
            <div
              onClick={() => setMenuOpen((open) => !open)}
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                overflow: "hidden",
                background: "#085744",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                fontWeight: "700",
                color: "#ffffff",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
              }}
              title="Click to update photo"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={formData.name || "Consultant"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                getInitials(formData.name)
              )}
            </div>

            {/* Overlapping Camera Action Badge */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={uploadingAvatar}
              aria-label="Change photo options"
              style={{
                position: "absolute",
                bottom: "-2px",
                right: "-2px",
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: "#085744",
                color: "#ffffff",
                border: "2.5px solid #ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(0, 0, 0, 0.5)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Camera size={17} strokeWidth={2.2} />
            </button>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleAvatarSelect}
              style={{ display: "none" }}
            />

            {/* Floating Dropdown Menu */}
            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "100px",
                  left: "0",
                  zIndex: 100,
                  background: "#02231c",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "12px",
                  padding: "8px",
                  minWidth: "190px",
                  boxShadow: "0 15px 35px rgba(0, 0, 0, 0.6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#f8fafc",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Upload size={15} strokeWidth={2.2} stroke="#34d399" />
                  Upload Photo
                </button>

                <button
                  type="button"
                  onClick={startCamera}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#f8fafc",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Camera size={15} strokeWidth={2.2} stroke="#34d399" />
                  Take Photo
                </button>

                {avatarUrl ? (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      padding: "9px 12px",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Trash2 size={15} strokeWidth={2.2} stroke="#f87171" />
                    Remove Photo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* User Details & Clickable Photo Trigger matching reference */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: "220px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.45rem", fontWeight: "800", color: "#f8fafc", margin: 0, letterSpacing: "-0.01em" }}>
                {formData.email || formData.name || "Consultant"}
              </h2>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "20px",
                  padding: "2px 10px",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Admin
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", color: "#94a3b8" }}>
              <span>CONSULTANT</span>
              <span>•</span>
              <span>{formData.company || "General"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Capture Modal */}
      {cameraOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={stopCamera}
        >
          <div
            style={{
              background: "#02231c",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "480px",
              padding: "24px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                Take Profile Photo
              </h3>
              <button
                type="button"
                onClick={stopCamera}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {cameraError ? (
              <div
                style={{
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  fontSize: "0.88rem",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {cameraError}
              </div>
            ) : (
              <div
                style={{
                  width: "300px",
                  height: "300px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid #10b981",
                  boxShadow: "0 0 25px rgba(16, 185, 129, 0.35)",
                  position: "relative",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {capturedImage ? (
                  <img
                    src={capturedImage}
                    alt="Captured preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: "scaleX(-1)", // mirror view
                    }}
                  />
                )}
              </div>
            )}

            {/* Hidden Canvas for capture processing */}
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!cameraError ? (
              <div style={{ display: "flex", gap: "10px", marginTop: "8px", width: "100%", justifyContent: "center" }}>
                {capturedImage ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={retakePhoto}
                      style={{
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "#ffffff",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        padding: "9px 20px",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        cursor: "pointer",
                      }}
                    >
                      🔄 Retake
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={saveCapturedPhoto}
                      disabled={uploadingAvatar}
                      style={{
                        background: "#10b981",
                        color: "#02231c",
                        fontWeight: "700",
                        border: "none",
                        padding: "9px 22px",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                        cursor: uploadingAvatar ? "not-allowed" : "pointer",
                      }}
                    >
                      {uploadingAvatar ? "Saving..." : "✓ Use This Photo"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={capturePhoto}
                    style={{
                      background: "#10b981",
                      color: "#02231c",
                      fontWeight: "700",
                      border: "none",
                      padding: "10px 28px",
                      borderRadius: "8px",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    📸 Snap Photo
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card settings-card mb-3">
        <div className="font-6 settings-card-title">Account details</div>
        <div className="settings-form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="account-name">
              Full name
            </label>
            <input
              className="form-input settings-input"
              id="account-name"
              value={formData.name}
              onChange={(event) => handleChange("name", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-email">
              Email
            </label>
            <input
              className="form-input settings-input"
              id="account-email"
              value={formData.email}
              readOnly
            />
            <div className="form-hint">Email address cannot be changed</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-company">
              Company
            </label>
            <input
              className="form-input settings-input"
              id="account-company"
              value={formData.company}
              onChange={(event) => handleChange("company", event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-phone">
              Phone
            </label>
            <input
              className="form-input settings-input"
              id="account-phone"
              value={formData.phone}
              onChange={(event) => handleChange("phone", event.target.value)}
            />
          </div>
        </div>
        {message ? <div className="form-hint">{message}</div> : null}
        <button className="btn btn-primary settings-save-btn" type="button" onClick={handleSave}>
          Save changes
        </button>
      </div>

      <div className="card settings-card settings-danger-card">
        <div className="font-6 settings-card-title text-danger">Danger zone</div>
        <div className="text-sm text-muted mb-3">
          Permanently delete your account and all associated data. This action cannot be undone.
        </div>
        <button className="btn btn-danger" type="button" onClick={handleDeleteAccount}>
          Delete account
        </button>
      </div>
    </>
  );
}
