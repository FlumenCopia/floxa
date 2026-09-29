"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { confirmPasswordReset } from "@/lib/authApi";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!token) {
      setErrorMessage("Password reset token is missing. Please use the link sent to your email.");
      return;
    }

    if (newPassword.length < 8) {
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
      <div id="login-screen">
        <div className="login-card is-login-mode" style={{ maxWidth: "460px", minHeight: "auto", padding: "40px 32px" }}>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div className="login-brand-logo" style={{ marginBottom: "16px" }}>
              <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
            </div>

            <div style={{
              width: "100%",
              backgroundColor: "rgba(255, 107, 107, 0.08)",
              border: "1px solid rgba(255, 107, 107, 0.25)",
              borderRadius: "12px",
              padding: "20px",
              textAlign: "center",
              marginBottom: "20px",
            }}>
              <AlertCircle size={36} color="#ff6b6b" style={{ margin: "0 auto 12px auto" }} />
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#ff6b6b", marginBottom: "6px" }}>
                Invalid or Missing Reset Link
              </div>
              <p style={{ fontSize: "12px", color: "#b4cfc4", margin: 0, lineHeight: "1.6" }}>
                No reset token was found in the link. Please request a new password reset link.
              </p>
            </div>

            <Link
              href="/forgot-password"
              className="login-pill-submit-btn"
              style={{ textDecoration: "none", marginTop: "8px" }}
            >
              <span>Request New Link</span>
              <span className="login-btn-arrow" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
            </Link>

            <div style={{ marginTop: "24px" }}>
              <Link
                href="/login?mode=login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#89aca0",
                  fontSize: "13px",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span>Back to Login</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="login-screen">
      <div className="login-card is-login-mode" style={{ maxWidth: "460px", minHeight: "auto", padding: "40px 32px" }}>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="login-brand-logo" style={{ marginBottom: "16px" }}>
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
          </div>

          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f3f8f4", margin: "0 0 8px 0", textAlign: "center" }}>
            Set New Password
          </h2>
          <p style={{ fontSize: "13px", color: "#89aca0", margin: "0 0 24px 0", textAlign: "center", lineHeight: "1.5" }}>
            Please choose a strong password of at least 8 characters.
          </p>

          {isSuccess ? (
            <div style={{
              width: "100%",
              backgroundColor: "rgba(77, 255, 160, 0.08)",
              border: "1px solid rgba(77, 255, 160, 0.25)",
              borderRadius: "12px",
              padding: "20px",
              textAlign: "center",
              marginBottom: "20px",
            }}>
              <CheckCircle2 size={36} color="#4dffa0" style={{ margin: "0 auto 12px auto" }} />
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#4dffa0", marginBottom: "6px" }}>
                Password Reset Successfully!
              </div>
              <p style={{ fontSize: "12px", color: "#b4cfc4", margin: "0 0 20px 0", lineHeight: "1.6" }}>
                Your account password has been updated. You can now sign in with your new password.
              </p>

              <Link
                href="/login?mode=login"
                className="login-pill-submit-btn"
                style={{ textDecoration: "none" }}
              >
                <span>Sign In Now</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="password"
                  name="newPassword"
                  className="login-pill-input"
                  placeholder="New password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
              </div>

              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="password"
                  name="confirmPassword"
                  className="login-pill-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              {errorMessage && <p className="login-error-msg">{errorMessage}</p>}

              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={isLoading}
                style={{ marginTop: "4px" }}
              >
                <span>{isLoading ? "Updating..." : "Reset Password"}</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </button>

              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <Link
                  href="/login?mode=login"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#89aca0",
                    fontSize: "13px",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  <ArrowLeft size={14} strokeWidth={2.5} />
                  <span>Back to Login</span>
                </Link>
              </div>
            </form>
          )}
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
