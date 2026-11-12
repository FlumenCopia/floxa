"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, Check } from "lucide-react";
import { confirmPasswordReset } from "@/lib/authApi";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const isMinLength = newPassword.length >= 8;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!token) {
      setErrorMessage("Password reset link is invalid or missing token. Please check the link from your email.");
      return;
    }

    if (!isMinLength) {
      setErrorMessage("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset({
        token,
        newPassword,
        confirmPassword,
      });
      setIsSuccess(true);
    } catch (err) {
      const msg = err?.detail || err?.message || "Failed to reset password. The link may have expired.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="login-screen">
      <div className="login-card is-login-mode">
        <div className="login-stage-track">
          <div className="login-stage-view login-access-wrap slide-in-view">
            {/* Left Column matching Login Studio Theme */}
            <div className="login-access-intro">
              <div className="login-brand-logo">
                <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
              </div>
              <p className="login-brand-subtitle">
                Discover Your Brand Clarity.
              </p>

              <Link
                href="/login?mode=login"
                className="login-begin-btn"
                style={{ textDecoration: "none" }}
              >
                <span>Back to Login</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowLeft size={14} strokeWidth={2.5} />
                </span>
              </Link>
            </div>

            {/* Right Column */}
            {!token && !isSuccess ? (
              <div className="login-pill-form" style={{ gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#f87171" }}>
                  <AlertCircle size={22} strokeWidth={2.2} />
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 500, color: "#ffffff" }}>
                    Invalid Reset Link
                  </h1>
                </div>

                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.72)", lineHeight: 1.55 }}>
                  No valid reset token was detected in your URL. Please open the link directly from your email or request a new reset link.
                </p>

                <Link
                  href="/forgot-password"
                  className="login-pill-submit-btn"
                  style={{ textDecoration: "none", marginTop: "4px" }}
                >
                  <span>Request New Reset Link</span>
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>
            ) : isSuccess ? (
              <div className="login-pill-form" style={{ gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#4dffa0" }}>
                  <CheckCircle2 size={22} strokeWidth={2.2} />
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 500, color: "#ffffff" }}>
                    Password Updated
                  </h1>
                </div>

                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.72)", lineHeight: 1.55 }}>
                  Your account password has been updated. You can now sign in to your FLOXA workspace with your new credentials.
                </p>

                <Link
                  href="/login?mode=login"
                  className="login-pill-submit-btn"
                  style={{ textDecoration: "none", marginTop: "4px" }}
                >
                  <span>Sign In with New Password</span>
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </Link>
              </div>
            ) : (
              <form className="login-pill-form" onSubmit={handleSubmit}>
                <div style={{ marginBottom: "4px" }}>
                  <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 500, color: "#ffffff", letterSpacing: "0.01em" }}>
                    Set New Password
                  </h1>
                  <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.65)", lineHeight: 1.5 }}>
                    Choose a strong password of at least 8 characters.
                  </p>
                </div>

                {/* New Password Pill */}
                <div className="login-pill-input-wrap">
                  <span className="login-pill-icon" aria-hidden="true">
                    <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    name="newPassword"
                    className="login-pill-input"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    title={showNewPassword ? "Hide password" : "Show password"}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#6b7280",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px",
                      flexShrink: 0,
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Confirm Password Pill */}
                <div className="login-pill-input-wrap">
                  <span className="login-pill-icon" aria-hidden="true">
                    <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    className="login-pill-input"
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#6b7280",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px",
                      flexShrink: 0,
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", paddingLeft: "8px", fontSize: "11.5px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: isMinLength ? "#4dffa0" : "rgba(255, 255, 255, 0.52)" }}>
                    <Check size={12} strokeWidth={2.6} />
                    <span>Min. 8 characters</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: isMatching ? "#4dffa0" : "rgba(255, 255, 255, 0.52)" }}>
                    <Check size={12} strokeWidth={2.6} />
                    <span>Passwords match</span>
                  </span>
                </div>

                {errorMessage && (
                  <p
                    className="login-error-msg"
                    role="alert"
                    style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "6px" }}
                  >
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </p>
                )}

                <button
                  type="submit"
                  className="login-pill-submit-btn"
                  disabled={isLoading || !isMinLength || !isMatching}
                >
                  <span>{isLoading ? "Updating Password..." : "Update Password"}</span>
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
