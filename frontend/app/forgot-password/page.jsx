"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
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
      <div className="login-card is-login-mode" style={{ maxWidth: "460px", minHeight: "auto", padding: "40px 32px" }}>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="login-brand-logo" style={{ marginBottom: "16px" }}>
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
          </div>

          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f3f8f4", margin: "0 0 8px 0", textAlign: "center" }}>
            Reset Password
          </h2>
          <p style={{ fontSize: "13px", color: "#89aca0", margin: "0 0 24px 0", textAlign: "center", lineHeight: "1.5" }}>
            Enter your account email address and we will send you a secure password reset link.
          </p>

          {isSubmitted ? (
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
                Reset Link Sent
              </div>
              <p style={{ fontSize: "12px", color: "#b4cfc4", margin: 0, lineHeight: "1.6" }}>
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Please check your inbox and spam folder.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="email"
                  name="email"
                  className="login-pill-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {errorMessage && <p className="login-error-msg">{errorMessage}</p>}

              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={isLoading}
                style={{ marginTop: "4px" }}
              >
                <span>{isLoading ? "Sending..." : "Send Reset Link"}</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </button>
            </form>
          )}

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
                transition: "color 0.18s ease",
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
