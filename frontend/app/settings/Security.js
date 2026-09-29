"use client";

import { useState } from "react";
import { showInfo, showSuccess, showError } from "@/lib/toast";
import { changePassword } from "@/lib/authApi";
import { Lock, KeyRound } from "lucide-react";

export default function Security() {
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const { currentPassword, newPassword, confirmPassword } = formData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg("New password cannot be the same as your current password.");
      return;
    }

    setIsSaving(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      showSuccess("Password updated successfully.");
      setSuccessMsg("Your password has been updated successfully.");
      setFormData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      const msg = err?.detail || err?.message || "Failed to update password. Please check your current password.";
      setErrorMsg(msg);
      showError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnable2FA = () => {
    showInfo("Two-factor authentication will be supported in a future release.");
  };

  const handleRevokeSessions = () => {
    showInfo("Remote session revocation will be supported in a future release.");
  };

  return (
    <>
      {/* Change Password Card */}
      <div className="card settings-card mb-3">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <KeyRound size={18} color="#4dffa0" />
          <div className="font-6 settings-card-title" style={{ margin: 0 }}>Change Password</div>
        </div>
        <div className="text-xs text-muted mb-3">
          Ensure your account stays secure by using a strong, unique password with at least 8 characters.
        </div>

        {errorMsg ? (
          <div style={{
            backgroundColor: "rgba(255, 107, 107, 0.12)",
            border: "1px solid rgba(255, 107, 107, 0.25)",
            color: "#ff6b6b",
            padding: "10px 14px",
            borderRadius: "6px",
            marginBottom: "14px",
            fontSize: "12px",
          }}>
            {errorMsg}
          </div>
        ) : null}

        {successMsg ? (
          <div style={{
            backgroundColor: "rgba(77, 255, 160, 0.1)",
            border: "1px solid rgba(77, 255, 160, 0.3)",
            color: "#4dffa0",
            padding: "10px 14px",
            borderRadius: "6px",
            marginBottom: "14px",
            fontSize: "12px",
          }}>
            {successMsg}
          </div>
        ) : null}

        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group mb-3">
            <label className="form-label" htmlFor="current-password">
              Current Password
            </label>
            <input
              type="password"
              className="form-input settings-input"
              id="current-password"
              placeholder="Enter your current password"
              value={formData.currentPassword}
              onChange={(e) => handleChange("currentPassword", e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">
                New Password
              </label>
              <input
                type="password"
                className="form-input settings-input"
                id="new-password"
                placeholder="Min 8 characters"
                value={formData.newPassword}
                onChange={(e) => handleChange("newPassword", e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <input
                type="password"
                className="form-input settings-input"
                id="confirm-password"
                placeholder="Re-enter new password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            className="btn btn-primary settings-save-btn"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Updating Password..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Security Features Card */}
      <div className="card settings-card settings-security-card">
        <div className="font-6 settings-card-title">Security & Sessions</div>

        <div className="settings-security-row">
          <div>
            <div className="text-sm font-5">Two-factor authentication</div>
            <div className="text-xs text-muted">Add extra security to your account</div>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={handleEnable2FA}>
            Enable 2FA
          </button>
        </div>

        <div className="divider" />

        <div className="settings-security-row">
          <div>
            <div className="text-sm font-5">Active sessions</div>
            <div className="text-xs text-muted">Current session active</div>
          </div>
          <button className="btn btn-danger btn-sm" type="button" onClick={handleRevokeSessions}>
            Revoke all
          </button>
        </div>
      </div>
    </>
  );
}
