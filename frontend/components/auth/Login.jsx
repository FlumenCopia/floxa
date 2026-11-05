"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginConsultant, requestReactivation } from "@/lib/authApi";
import { showError, showSuccess } from "@/lib/toast";
import { ArrowRight, ArrowLeft, Mail, Lock, Phone, PhoneCall, Bell, Send } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const [stage, setStage] = useState("splash");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "login") {
        setStage("login");
      }
    }
  }, []);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Suspension & Admin Contact States
  const [isSuspended, setIsSuspended] = useState(false);
  const [showAdminPhone, setShowAdminPhone] = useState(false);
  const [showNotifyAdmin, setShowNotifyAdmin] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState(
    "My Brand DNA deliverable is ready. Please review and reactivate my consultant account."
  );
  const [isNotifying, setIsNotifying] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      try {
        let response = await fetch("/api/auth/me/", { credentials: "include" });

        if (response.status === 401) {
          const refreshed = await fetch("/api/auth/token/refresh/", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });

          if (refreshed.ok) {
            response = await fetch("/api/auth/me/", { credentials: "include" });
          }
        }

        if (response.ok) {
          if (isMounted) {
            router.replace("/");
          }
          return;
        }
      } catch {
        // Keep the login form visible if the background session check fails.
      }
    }

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  };

  const getLoginError = (error) => {
    return error?.detail || error?.message || "Invalid email or password";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setIsSuspended(false);
    setNotifySuccess(false);
    setIsLoading(true);

    try {
      const loginData = await loginConsultant({
        email: formData.email,
        password: formData.password,
      });

      const username =
        loginData?.consultant?.name ||
        loginData?.consultant?.full_name ||
        loginData?.consultant?.username ||
        loginData?.consultant?.email ||
        "there";

      showSuccess(`Welcome back, ${username}!`);
      router.push("/");
    } catch (error) {
      const message = getLoginError(error);
      setErrorMessage(message);

      if (
        error?.code === "ACCOUNT_SUSPENDED_DEADLINE_BREACH" ||
        (typeof message === "string" && message.toLowerCase().includes("suspended"))
      ) {
        setIsSuspended(true);
      }
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendNotification = async () => {
    const targetEmail = (formData.email || "").trim();
    if (!targetEmail) {
      showError("Please enter your consultant email in the form above.");
      return;
    }

    setIsNotifying(true);
    try {
      await requestReactivation(targetEmail, notifyMessage);
      setNotifySuccess(true);
      showSuccess("Notification sent to SuperAdmin panel!");
    } catch (err) {
      showError(err?.detail || err?.message || "Failed to send notification to SuperAdmin.");
    } finally {
      setIsNotifying(false);
    }
  };

  const isLogin = stage === "login";

  return (
    <div id="login-screen">
      <div className={`login-card ${isLogin ? "is-login-mode" : ""}`}>
        <div className="login-stage-track">
          {/* 1st Section: Splash Center View */}
          <div
            className={`login-stage-view login-splash-view ${
              isLogin ? "slide-out-left" : "slide-in-center"
            }`}
          >
            <div className="login-brand-logo">
              <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
            </div>
            <p className="login-brand-subtitle">
              Discover Your Brand Clarity.
            </p>

            <button
              type="button"
              className="login-begin-btn"
              onClick={() => setStage("login")}
            >
              <span>Let&apos;s Begin</span>
              <span className="login-btn-arrow" aria-hidden="true">
                <ArrowRight size={14} strokeWidth={2.5} />
              </span>
            </button>
          </div>

          {/* 2nd Section: Login 2-Column View */}
          <div
            className={`login-stage-view login-access-wrap ${
              isLogin ? "slide-in-view" : "slide-out-right"
            }`}
          >
            {/* Left Column */}
            <div className="login-access-intro">
              <div className="login-brand-logo">
                <img src="/image/FLOXA_log.png" alt="FLOXA" className="login-brand-logo-img" />
              </div>
              <p className="login-brand-subtitle">
                Discover Your Brand Clarity.
              </p>

              <button
                type="button"
                className="login-begin-btn"
                onClick={() => setStage("splash")}
              >
                <span>Go Back</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowLeft size={14} strokeWidth={2.5} />
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="login-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Email */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="email"
                  name="email"
                  className="login-pill-input"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="username"
                />
              </div>

              {/* Input 2: Password */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="password"
                  name="password"
                  className="login-pill-input"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="login-forgot-row">
                <Link href="/forgot-password" className="login-forgot-link">
                  Forgot Password?
                </Link>
              </div>

              {errorMessage && (
                <div style={{ margin: "10px 0 14px", textAlign: "center" }}>
                  <p className="login-error-msg" style={{ margin: "0 0 8px" }}>
                    {errorMessage}
                  </p>

                  {(isSuspended || errorMessage.toLowerCase().includes("suspended")) && (
                    <div
                      style={{
                        background: "linear-gradient(180deg, rgba(239, 68, 68, 0.16) 0%, rgba(15, 23, 42, 0.6) 100%)",
                        border: "1px solid rgba(239, 68, 68, 0.45)",
                        borderRadius: "12px",
                        padding: "12px 14px",
                        marginTop: "10px",
                        textAlign: "left",
                        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "14px" }}>⚠️</span>
                        <span style={{ fontSize: "12px", color: "#fca5a5", fontWeight: 700 }}>
                          Account Suspended — Request Direct Admin Help
                        </span>
                      </div>
                      <p style={{ fontSize: "11px", color: "#9ca3af", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                        Call the SuperAdmin directly or send an instant notification to the admin panel:
                      </p>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: (showAdminPhone || showNotifyAdmin) ? "10px" : "0" }}>
                        <button
                          type="button"
                          onClick={() => setShowAdminPhone((prev) => !prev)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: showAdminPhone ? "#991b1b" : "#dc2626",
                            color: "#ffffff",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <Phone size={13} />
                          <span>Call SuperAdmin</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowNotifyAdmin((prev) => !prev)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: showNotifyAdmin ? "rgba(77, 255, 160, 0.2)" : "rgba(255, 255, 255, 0.08)",
                            color: showNotifyAdmin ? "#4dffa0" : "#e2e8f0",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: `1px solid ${showNotifyAdmin ? "rgba(77, 255, 160, 0.45)" : "rgba(255, 255, 255, 0.2)"}`,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <Bell size={13} />
                          <span>Notify SuperAdmin</span>
                        </button>
                      </div>

                      {/* Phone number display below when Call SuperAdmin is clicked */}
                      {showAdminPhone && (
                        <div
                          style={{
                            background: "rgba(0, 0, 0, 0.5)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                            marginBottom: showNotifyAdmin ? "10px" : "0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "10px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                              SuperAdmin Hotline Number
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: 800, color: "#ffffff", letterSpacing: "0.03em" }}>
                              89076 34900
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <a
                              href="tel:8907634900"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                background: "#16a34a",
                                color: "#ffffff",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700,
                                textDecoration: "none",
                              }}
                            >
                              <PhoneCall size={12} />
                              <span>Call Now</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof navigator !== "undefined" && navigator.clipboard) {
                                  navigator.clipboard.writeText("89076 34900");
                                  setCopiedPhone(true);
                                  setTimeout(() => setCopiedPhone(false), 2000);
                                }
                              }}
                              style={{
                                background: "rgba(255, 255, 255, 0.1)",
                                color: "#e2e8f0",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {copiedPhone ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Notify admin message input box */}
                      {showNotifyAdmin && (
                        <div
                          style={{
                            background: "rgba(0, 0, 0, 0.5)",
                            border: "1px solid rgba(77, 255, 160, 0.3)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                          }}
                        >
                          <div style={{ fontSize: "10px", color: "#4dffa0", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Dispatch Reactivation Alert to SuperAdmin Panel
                          </div>
                          {notifySuccess ? (
                            <div style={{ background: "rgba(77, 255, 160, 0.12)", border: "1px solid rgba(77, 255, 160, 0.4)", borderRadius: "6px", padding: "8px 10px", color: "#4dffa0", fontSize: "11px", fontWeight: 600 }}>
                              ✓ Notification sent to SuperAdmin! They will review your deliverable and reactivate your account.
                            </div>
                          ) : (
                            <>
                              <textarea
                                value={notifyMessage}
                                onChange={(e) => setNotifyMessage(e.target.value)}
                                rows={2}
                                placeholder="Message to SuperAdmin..."
                                style={{
                                  width: "100%",
                                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                                  border: "1px solid rgba(255, 255, 255, 0.15)",
                                  borderRadius: "6px",
                                  padding: "7px 10px",
                                  color: "#ffffff",
                                  fontSize: "12px",
                                  resize: "none",
                                  outline: "none",
                                  marginBottom: "8px",
                                  boxSizing: "border-box",
                                }}
                              />
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  disabled={isNotifying || !notifyMessage.trim()}
                                  onClick={handleSendNotification}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "#4dffa0",
                                    color: "#001a0e",
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    border: "none",
                                    cursor: (isNotifying || !notifyMessage.trim()) ? "not-allowed" : "pointer",
                                    opacity: isNotifying ? 0.7 : 1,
                                  }}
                                >
                                  <Send size={12} />
                                  <span>{isNotifying ? "Sending..." : "Send Request"}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={isLoading}
              >
                <span>{isLoading ? "Signing in..." : "Get Started"}</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowRight size={14} strokeWidth={2.5} />
                </span>
              </button>

              <div className="login-terms-note">
                By signing in you agree to our Terms &amp; Privacy Policy
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
