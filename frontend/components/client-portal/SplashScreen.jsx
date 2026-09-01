"use client";

import { useState } from "react";

export function SplashScreen({ project, branding, onNext }) {
  return (
    <section className="client-welcome-stage">
      <div className="client-welcome-glass client-design-enter">
        <div className="client-welcome-copy">
          <div className="client-wordmark">
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-wordmark-img" />
          </div>
          <p className="client-welcome-subtitle">{branding.heading}</p>
          <div className="client-project-label">{project?.name || "Private Project"}</div>

          {project?.meetingSummary ? (
            <p className="client-meeting-summary">{project.meetingSummary}</p>
          ) : null}

          <button
            type="button"
            className="client-gradient-button"
            onClick={() => onNext("login")}
          >
            <span>Let&apos;s Begin</span>
            <span className="client-button-arrow" aria-hidden="true">
              -&gt;
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function LoginScreen({
  project,
  branding,
  resumeScreen,
  requiresPassword = false,
  onNext,
  onVerifyPassword,
}) {
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

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

  return (
    <section className="client-welcome-stage">
      <div className="client-welcome-glass client-access-glass client-design-enter">
        <div className="client-access-intro">
          <div className="client-wordmark client-wordmark-left">
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-wordmark-img" />
          </div>
          <p className="client-welcome-subtitle">{branding.heading}</p>
          <p className="client-access-description">
            Your private project space is ready. Continue to complete your
            profile and brand discovery.
          </p>

          <button
            type="button"
            className="client-back-button"
            onClick={() => onNext("splash")}
          >
            <span aria-hidden="true">&lt;-</span> Go Back
          </button>
        </div>

        <form className="client-access-form" onSubmit={handleSubmit}>
          <div className="client-access-card-head">
            <span className="client-access-label">Project Workspace</span>
            <h1>{project?.name || "Private Project"}</h1>
            <p>{project?.clientEmail || "Private portal link"}</p>
          </div>

          <div className="client-access-stage">
            <div>
              <span className="client-access-label">Current Stage</span>
              <strong>Profile Setup</strong>
            </div>
            <span className="client-stage-dot" aria-hidden="true" />
          </div>

          <div className="client-access-badges" aria-label="Workspace security">
            <span>Secure Workspace</span>
            <span>Private Project Link</span>
          </div>

          {requiresPassword ? (
            <label className="client-access-password">
              <span className="client-access-label">Portal Password</span>
              <input
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setAccessError("");
                }}
                type="password"
                value={password}
              />
            </label>
          ) : null}

          {accessError ? <div className="client-access-error">{accessError}</div> : null}

          <button
            type="submit"
            className="client-access-submit"
            disabled={isVerifying}
          >
            {isVerifying ? "Verifying..." : "Start Project"} <span aria-hidden="true">-&gt;</span>
          </button>
        </form>
      </div>
    </section>
  );
}
