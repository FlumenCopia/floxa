"use client";

import { useState } from "react";
import { ArrowRight, ArrowLeft, Mail, Lock } from "lucide-react";

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
  const [prevInitialMode, setPrevInitialMode] = useState(initialMode);
  if (initialMode && initialMode !== prevInitialMode) {
    setPrevInitialMode(initialMode);
    setMode(initialMode);
  }

  const [emailOrName, setEmailOrName] = useState(project?.clientEmail || project?.name || "");
  const [prevProject, setPrevProject] = useState(project);
  if (project !== prevProject) {
    setPrevProject(project);
    const candidate = project?.clientEmail || project?.name || "";
    if (candidate && !emailOrName) {
      setEmailOrName(candidate);
    }
  }

  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

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
                <ArrowRight size={14} strokeWidth={2.5} />
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
                  <ArrowLeft size={14} strokeWidth={2.5} />
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="client-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Email or Project Identifier */}
              <div className="client-pill-input-wrap">
                <span className="client-pill-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} stroke="#6b7280" />
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
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
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
                  <ArrowRight size={14} strokeWidth={2.5} />
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
