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
        
        {/* Splash Center View */}
        <div className={`client-welcome-copy ${isLogin ? "client-fade-out" : "client-fade-in"}`}>
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

        {/* Login 2-Column View */}
        <div className={`client-access-stage-wrap ${isLogin ? "client-fade-in" : "client-fade-out"}`}>
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

            {/* OR Divider */}
            <div className="client-social-divider">
              <span className="client-divider-line" />
              <span className="client-divider-text">OR</span>
              <span className="client-divider-line" />
            </div>

            {/* Social Buttons */}
            <div className="client-social-row" aria-label="Alternative sign in options">
              {/* Google */}
              <button
                type="button"
                className="client-social-btn"
                aria-label="Continue with Google"
                onClick={() => {
                  if (!requiresPassword) onNext(resumeScreen || "profile");
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
              </button>

              {/* Apple */}
              <button
                type="button"
                className="client-social-btn"
                aria-label="Continue with Apple"
                onClick={() => {
                  if (!requiresPassword) onNext(resumeScreen || "profile");
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.08.64-2.73 1.4-.55.63-1.04 1.66-.99 2.7 1.07.08 2.12-.53 2.71-1.23" />
                </svg>
              </button>

              {/* Twitter / X */}
              <button
                type="button"
                className="client-social-btn"
                aria-label="Continue with Twitter / X"
                onClick={() => {
                  if (!requiresPassword) onNext(resumeScreen || "profile");
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#000000">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>

              {/* Facebook */}
              <button
                type="button"
                className="client-social-btn"
                aria-label="Continue with Facebook"
                onClick={() => {
                  if (!requiresPassword) onNext(resumeScreen || "profile");
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </button>
            </div>
          </form>
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
