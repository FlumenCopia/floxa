"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, KeyRound, AlertCircle } from "lucide-react";
import { requestPasswordReset } from "@/lib/authApi";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset({ email: cleanEmail });
      setIsSubmitted(true);
    } catch (err) {
      const msg = err?.detail || err?.message || "Failed to send reset link. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-recovery-screen">
      <div className="auth-recovery-card">
        <img src="/image/FLOXA_log.png" alt="FLOXA" className="auth-recovery-logo" />

        <div className="auth-recovery-pill-badge">
          <KeyRound size={13} strokeWidth={2.5} />
          <span>Password Recovery</span>
        </div>

        <h1 className="auth-recovery-title">
          {isSubmitted ? "Reset Link Dispatched" : "Reset Password"}
        </h1>
        <p className="auth-recovery-subtitle">
          {isSubmitted
            ? `If an account exists for ${email}, a secure password reset link has been dispatched to your inbox.`
            : "Enter your account email address and we'll send you an encrypted link to reset your password."}
        </p>

        {isSubmitted ? (
          <div className="auth-success-box">
            <div className="auth-success-icon-wrap">
              <CheckCircle2 size={38} color="#4dffa0" strokeWidth={2.2} />
            </div>

            <p style={{ fontSize: "13px", color: "#9bb5aa", lineHeight: 1.6, margin: "0 0 24px", maxWidth: "360px" }}>
              Please check your inbox (and spam/junk folder) within the next few minutes. The reset link expires in 30 minutes.
            </p>

            <Link
              href="/login?mode=login"
              className="auth-submit-btn"
              style={{ textDecoration: "none" }}
            >
              <span>Return to Login</span>
              <span className="auth-submit-arrow" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
            </Link>
          </div>
        ) : (
          <form className="auth-recovery-form" onSubmit={handleSubmit}>
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="recovery-email">
                <span>Account Email</span>
              </label>
              <div className="auth-glass-input-wrap">
                <span className="auth-glass-input-icon" aria-hidden="true">
                  <Mail size={17} strokeWidth={2.2} />
                </span>
                <input
                  id="recovery-email"
                  type="email"
                  name="email"
                  className="auth-glass-input"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {errorMessage && (
              <div className="auth-error-banner" role="alert">
                <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading || !email.trim()}
            >
              <span>{isLoading ? "Dispatching Link..." : "Send Reset Link"}</span>
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
