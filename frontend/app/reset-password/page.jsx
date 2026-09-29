"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, ShieldCheck, Check } from "lucide-react";
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

  if (!token && !isSuccess) {
    return (
      <div className="auth-recovery-screen">
        <div className="auth-recovery-card">
          <img src="/image/FLOXA_log.png" alt="FLOXA" className="auth-recovery-logo" />

          <div className="auth-error-banner" style={{ margin: "16px 0 24px", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <AlertCircle size={32} color="#f87171" style={{ marginBottom: "8px" }} />
            <div style={{ fontWeight: 600, color: "#fca5a5", fontSize: "14px", marginBottom: "4px" }}>
              Invalid or Missing Reset Link
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#e2e8f0", lineHeight: 1.5 }}>
              No valid reset token was detected in your URL. Please click the link directly from your email or request a new one.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="auth-submit-btn"
            style={{ textDecoration: "none" }}
          >
            <span>Request New Reset Link</span>
            <span className="auth-submit-arrow" aria-hidden="true">
              <ArrowRight size={14} strokeWidth={2.5} />
            </span>
          </Link>

          <Link href="/login?mode=login" className="auth-back-link">
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span>Back to Login</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-recovery-screen">
      <div className="auth-recovery-card">
        <img src="/image/FLOXA_log.png" alt="FLOXA" className="auth-recovery-logo" />

        <div className="auth-recovery-pill-badge">
          <ShieldCheck size={13} strokeWidth={2.5} />
          <span>Account Security</span>
        </div>

        <h1 className="auth-recovery-title">
          {isSuccess ? "Password Updated" : "Set New Password"}
        </h1>
        <p className="auth-recovery-subtitle">
          {isSuccess
            ? "Your account password has been successfully updated. You can now access your FLOXA workspace."
            : "Please choose a strong password of at least 8 characters to secure your consultant account."}
        </p>

        {isSuccess ? (
          <div className="auth-success-box">
            <div className="auth-success-icon-wrap">
              <CheckCircle2 size={38} color="#4dffa0" strokeWidth={2.2} />
            </div>

            <Link
              href="/login?mode=login"
              className="auth-submit-btn"
              style={{ textDecoration: "none" }}
            >
              <span>Sign In with New Password</span>
              <span className="auth-submit-arrow" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
            </Link>
          </div>
        ) : (
          <form className="auth-recovery-form" onSubmit={handleSubmit}>
            {/* Input 1: New Password */}
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="new-password">
                <span>New Password</span>
                <span style={{ fontSize: "11px", color: isMinLength ? "#4dffa0" : "#749688" }}>
                  {newPassword.length > 0 ? `${newPassword.length}/8+ chars` : "Min. 8 characters"}
                </span>
              </label>
              <div className="auth-glass-input-wrap">
                <span className="auth-glass-input-icon" aria-hidden="true">
                  <Lock size={17} strokeWidth={2.2} />
                </span>
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  name="newPassword"
                  className="auth-glass-input"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="auth-password-toggle-btn"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Input 2: Confirm Password */}
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="confirm-password">
                <span>Confirm New Password</span>
                {confirmPassword.length > 0 && (
                  <span style={{ fontSize: "11px", color: isMatching ? "#4dffa0" : "#f87171" }}>
                    {isMatching ? "Passwords match" : "Does not match"}
                  </span>
                )}
              </label>
              <div className="auth-glass-input-wrap">
                <span className="auth-glass-input-icon" aria-hidden="true">
                  <Lock size={17} strokeWidth={2.2} />
                </span>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  className="auth-glass-input"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle-btn"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Live Requirements Hint */}
            <div className="auth-requirements-box">
              <div className={`auth-req-item ${isMinLength ? "is-met" : ""}`}>
                <Check size={13} strokeWidth={2.8} />
                <span>At least 8 characters long</span>
              </div>
              <div className={`auth-req-item ${isMatching ? "is-met" : ""}`}>
                <Check size={13} strokeWidth={2.8} />
                <span>Passwords match</span>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="auth-error-banner" role="alert">
                <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading || !isMinLength || !isMatching}
            >
              <span>{isLoading ? "Updating Password..." : "Update Password"}</span>
              <span className="auth-submit-arrow" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
            </button>

            <div style={{ textAlign: "center" }}>
              <Link href="/login?mode=login" className="auth-back-link">
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span>Back to Login</span>
              </Link>
            </div>
          </form>
        )}
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
