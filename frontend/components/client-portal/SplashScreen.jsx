"use client";

import { useEffect, useState } from "react";

export function WelcomeStage({
  project,
  branding,
  resumeScreen,
  requiresPassword = false,
  onNext,
  onVerifyPassword,
  initialMode = "splash",
}) {
  const [mode, setMode] = useState(initialMode);
  const [emailOrName, setEmailOrName] = useState(project?.clientEmail || project?.name || "");
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (project?.clientEmail || project?.name) {
      setEmailOrName((prev) => prev || project?.clientEmail || project?.name || "");
    }
  }, [project]);

  const handleBeginClick = () => {
    setMode("login");
    if (onNext) {
      onNext("login");
    }
  };

  const handleBackClick = () => {
    setMode("splash");
    setAccessError("");
    if (onNext) {
      onNext("splash");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAccessError("");

    if (!requiresPassword) {
      onNext(resumeScreen || "profile");
      return;
    }

    const nextPassword = password.trim();
    if (!nextPassword) {
      setAccessError("Enter your portal password.");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await onVerifyPassword(nextPassword);
      if (!response?.success) {
        setAccessError(response?.error || "Incorrect portal password.");
      }
    } catch {
      setAccessError("Unable to verify portal password.");
    } finally {
      setIsVerifying(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <section className="client-welcome-stage">
      <div className={`client-welcome-glass ${isLogin ? "is-login-mode" : ""}`}>
        <div className="client-stage-track">
          {/* 1st Section: Splash Center View */}
          <div
            className={`client-stage-view client-welcome-copy ${
              isLogin ? "slide-out-left" : "slide-in-center"
            }`}
          >
            <div className="client-wordmark">
              <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-wordmark-img" />
            </div>
            <p className="client-welcome-subtitle">
              {branding?.heading || "Discover Your Brand Clarity."}
            </p>

            <button
              type="button"
              className="client-gradient-button"
              onClick={handleBeginClick}
            >
              <span>Let&apos;s Begin</span>
              <span className="client-button-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          </div>

          {/* 2nd Section: Login 2-Column View */}
          <div
            className={`client-stage-view client-access-stage-wrap ${
              isLogin ? "slide-in-view" : "slide-out-right"
            }`}
          >
            {/* Left Column */}
            <div className="client-access-intro">
              <div className="client-wordmark client-wordmark-left">
                <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-wordmark-img" />
              </div>
              <p className="client-welcome-subtitle">
                {branding?.heading || "Discover Your Brand Clarity."}
              </p>

              <button
                type="button"
                className="client-gradient-button client-back-pill-button"
                onClick={handleBackClick}
              >
                <span>Go Back</span>
                <span className="client-button-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="client-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Email or Project Identifier */}
              <div className="client-pill-input-wrap">
                <span className="client-pill-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  type="text"
                  className="client-pill-input"
                  placeholder="Workspace / Email"
                  value={emailOrName}
                  onChange={(e) => setEmailOrName(e.target.value)}
                  autoComplete="username"
                />
              </div>

              {/* Input 2: Password */}
              <div className="client-pill-input-wrap">
                <span className="client-pill-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type="password"
                  className="client-pill-input"
                  placeholder={requiresPassword ? "Portal Password" : "Password (optional)"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAccessError("");
                  }}
                  autoComplete="current-password"
                />
              </div>

              {accessError ? (
                <div className="client-access-error-msg">{accessError}</div>
              ) : null}

              {/* Submit Button */}
              <button
                type="submit"
                className="client-pill-submit-button"
                disabled={isVerifying}
              >
                <span>{isVerifying ? "Verifying..." : "Get Started"}</span>
                <span className="client-button-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SplashScreen(props) {
  return <WelcomeStage {...props} initialMode="splash" />;
}

export function LoginScreen(props) {
  return <WelcomeStage {...props} initialMode="login" />;
}
