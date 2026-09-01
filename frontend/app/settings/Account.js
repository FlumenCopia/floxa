"use client";

import { useEffect, useState } from "react";
import { getCurrentConsultant, updateCurrentConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";

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
  const [message, setMessage] = useState("");

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
      {/* Profile Picture Card */}
      <div className="card settings-card mb-3">
        <div className="font-6 settings-card-title">Profile Picture</div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              overflow: "hidden",
              background: "linear-gradient(135deg, #174332, #50f39b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: "700",
              color: "#02231c",
              border: "2px solid rgba(16, 185, 129, 0.4)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              flexShrink: 0,
            }}
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

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <label
                className="btn btn-primary"
                style={{
                  margin: 0,
                  cursor: uploadingAvatar ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  padding: "8px 16px",
                }}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleAvatarSelect}
                  disabled={uploadingAvatar}
                  style={{ display: "none" }}
                />
                {uploadingAvatar ? "Uploading..." : "Upload New Picture"}
              </label>

              {avatarUrl ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAvatarRemove}
                  disabled={uploadingAvatar}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#f87171",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    fontSize: "0.85rem",
                    padding: "8px 16px",
                  }}
                >
                  Remove Picture
                </button>
              ) : null}
            </div>
            <div className="form-hint" style={{ marginTop: "2px" }}>
              Recommended: Square JPG, PNG or WebP, max 5MB. Appears in your sidebar and portal.
            </div>
          </div>
        </div>
      </div>

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
