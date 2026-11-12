"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
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

            {/* Right Column (Pill Form matching Login Studio Theme) */}
            {isSubmitted ? (
              <div className="login-pill-form" style={{ gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#4dffa0" }}>
                  <CheckCircle2 size={22} strokeWidth={2.2} />
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 500, color: "#ffffff", letterSpacing: "0.01em" }}>
                    Reset Link Dispatched
                  </h1>
                </div>

                <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.72)", lineHeight: 1.55 }}>
                  If an account exists for <strong style={{ color: "#ffffff", fontWeight: 500 }}>{email}</strong>, a secure password reset link has been sent to your inbox. Please check your inbox or spam folder within 30 minutes.
                </p>

                <Link
                  href="/login?mode=login"
                  className="login-pill-submit-btn"
                  style={{ textDecoration: "none", marginTop: "4px" }}
                >
                  <span>Return to Login</span>
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setIsSubmitted(false);
                    setErrorMessage("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#89aca0",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  Try another email address
                </button>
              </div>
            ) : (
              <form className="login-pill-form" onSubmit={handleSubmit}>
                <div style={{ marginBottom: "4px" }}>
                  <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 500, color: "#ffffff", letterSpacing: "0.01em" }}>
                    Forgot Password
                  </h1>
                  <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.65)", lineHeight: 1.5 }}>
                    Enter your account email and we&apos;ll send an encrypted reset link.
                  </p>
                </div>

                {/* Email White Pill Input */}
                <div className="login-pill-input-wrap">
                  <span className="login-pill-icon" aria-hidden="true">
                    <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    id="recovery-email"
                    type="email"
                    name="email"
                    className="login-pill-input"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
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
                  disabled={isLoading || !email.trim()}
                >
                  <span>{isLoading ? "Dispatching Link..." : "Send Reset Link"}</span>
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </button>

                <div className="login-terms-note">
                  Reset links remain valid for 30 minutes
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
