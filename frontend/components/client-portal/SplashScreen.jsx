"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowLeft, Mail, Lock, Eye, EyeOff, Check } from "lucide-react";
import { clientPortalService } from "../../services/clientPortalService";

export function WelcomeStage({
  token,
  portalToken,
  project,
  branding,
  resumeScreen,
  requiresPassword = false,
  prefilledEmail = "",
  setupToken = "",
  resetToken = "",
  onNext,
  onVerifyPassword,
  onPasswordSetComplete,
  initialMode = "splash",
}) {
  const effectivePortalToken = portalToken || token || project?.portal_token || "";

  const [mode, setMode] = useState(() => {
    if (initialMode) return initialMode;
    return "splash";
  });
  const [prevInitialMode, setPrevInitialMode] = useState(initialMode);
  const [emailOrName, setEmailOrName] = useState(
    project?.clientEmail || project?.client_email || prefilledEmail || project?.name || ""
  );
  const [prevProject, setPrevProject] = useState(project);
  const [prevPrefilledEmail, setPrevPrefilledEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordCompletedLocally, setPasswordCompletedLocally] = useState(false);

  // Token pre-validation state for setup_token / reset_token
  const [validatedTokenResult, setValidatedTokenResult] = useState({
    tokenKey: "",
    valid: true,
    reason: "",
    detail: "",
  });

  // Forgot Password state
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState(
    project?.clientEmail || project?.client_email || prefilledEmail || ""
  );
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");

  if (initialMode && initialMode !== prevInitialMode && !isSettingPassword) {
    setPrevInitialMode(initialMode);
    setMode(initialMode);
    setAccessError("");
  }

  if (project !== prevProject) {
    setPrevProject(project);
    const candidate = project?.clientEmail || project?.client_email || prefilledEmail || project?.name || "";
    if (candidate && !emailOrName) {
      setEmailOrName(candidate);
      setForgotEmail(candidate);
    }
  }

  if (prefilledEmail && prefilledEmail !== prevPrefilledEmail) {
    setPrevPrefilledEmail(prefilledEmail);
    if (!emailOrName) {
      setEmailOrName(prefilledEmail);
    }
    if (!forgotEmail) {
      setForgotEmail(prefilledEmail);
    }
  }

  const isTokenActionMode = mode === "reset-password" || mode === "set-password";
  const activeActionToken = mode === "reset-password" ? resetToken : mode === "set-password" ? setupToken : "";
  const activeTokenKey = isTokenActionMode && activeActionToken ? `${mode}:${effectivePortalToken}:${activeActionToken}` : "";

  // Validate setup_token or reset_token asynchronously when entering those modes
  useEffect(() => {
    if (!activeTokenKey) {
      return undefined;
    }

    let cancelled = false;
    clientPortalService
      .validatePortalToken({
        portalToken: effectivePortalToken,
        ...(mode === "reset-password" ? { resetToken } : { setupToken }),
      })
      .then((res) => {
        if (cancelled) return;
        if (res?.valid) {
          setValidatedTokenResult({ tokenKey: activeTokenKey, valid: true, reason: "", detail: "" });
        } else {
          setValidatedTokenResult({
            tokenKey: activeTokenKey,
            valid: false,
            reason: res?.reason || "invalid",
            detail:
              res?.detail ||
              (mode === "reset-password"
                ? "This password reset link is invalid or has expired."
                : "This password setup link is invalid or has expired."),
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValidatedTokenResult({
            tokenKey: activeTokenKey,
            valid: false,
            reason: "invalid",
            detail: "Unable to validate this link. Please try again or request a new link.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTokenKey, mode, effectivePortalToken, resetToken, setupToken]);

  const tokenStatus = !isTokenActionMode
    ? { checking: false, valid: true, reason: "", detail: "" }
    : !activeActionToken
    ? {
        checking: false,
        valid: false,
        reason: "missing",
        detail:
          mode === "reset-password"
            ? "This password reset link is missing its security token. Please request a new reset link."
            : "This invitation link is missing its setup authorization token. Please open the full link from your invitation email or ask your consultant to resend the invite.",
      }
    : validatedTokenResult.tokenKey !== activeTokenKey
    ? { checking: true, valid: true, reason: "", detail: "" }
    : {
        checking: false,
        valid: validatedTokenResult.valid,
        reason: validatedTokenResult.reason,
        detail: validatedTokenResult.detail,
      };

  // Password criteria check (evaluated on trimmed password to match backend validation)
  const trimmedPassword = password.trim();
  const hasMinLength = trimmedPassword.length >= 8;
  const hasLetters = /[A-Za-z]/.test(trimmedPassword);
  const hasNumbers = /[0-9]/.test(trimmedPassword);
  const isPasswordValid = hasMinLength && hasLetters && hasNumbers;

  const hasPasswordOnProject = Boolean(project?.has_password || project?.hasPassword || passwordCompletedLocally);

  const handleBeginClick = () => {
    // If project has no password set, smoothly slide into Set Password & Get Started
    if (project && !hasPasswordOnProject) {
      setMode("set-password");
    } else {
      setMode("login");
      onNext?.("login");
    }
  };

  const handleBackClick = () => {
    if (mode === "forgot-password" || mode === "reset-password") {
      setMode("login");
      setForgotError("");
      setForgotSuccess("");
      setAccessError("");
    } else {
      setMode("splash");
      setAccessError("");
      setSuccessMessage("");
      onNext?.("splash");
    }
  };

  // 1. Authorized First-Time Setup OR Token-Verified Password Reset Submit
  const handleSetPasswordSubmit = async (event) => {
    event.preventDefault();
    setAccessError("");
    setSuccessMessage("");

    if (!tokenStatus.valid) {
      setAccessError(tokenStatus.detail || "This link is invalid or has expired.");
      return;
    }

    if (!hasMinLength) {
      setAccessError("Password must be at least 8 characters long.");
      return;
    }
    if (!hasLetters) {
      setAccessError("Password must contain at least one letter.");
      return;
    }
    if (!hasNumbers) {
      setAccessError("Password must contain at least one number.");
      return;
    }

    setIsSettingPassword(true);
    try {
      const isResetMode = mode === "reset-password";
      const res = isResetMode
        ? await clientPortalService.resetPortalPassword({
            portalToken: effectivePortalToken,
            password: trimmedPassword,
            resetToken,
          })
        : await clientPortalService.setPortalPassword({
            portalToken: effectivePortalToken,
            password: trimmedPassword,
            setupToken,
          });

      if (!res?.success) {
        setAccessError(
          res?.error ||
            (isResetMode
              ? "Failed to reset password. The link may be invalid or expired."
              : "Failed to set password. Please use the full link from your invitation email.")
        );
        return;
      }

      setPasswordCompletedLocally(true);

      // Single-click onboarding/reset: backend already issued the portal session cookie, so enter FLOXA immediately
      if (onPasswordSetComplete) {
        await onPasswordSetComplete();
      } else {
        setSuccessMessage("Password saved successfully! Click 'Get Started' to log in to FLOXA.");
        setMode("login");
      }
    } catch {
      setAccessError("An unexpected error occurred while saving your password.");
    } finally {
      setIsSettingPassword(false);
    }
  };

  // 2. Login Form Submit
  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setAccessError("");

    if (!requiresPassword) {
      onNext(resumeScreen || "profile");
      return;
    }

    const nextEmail = emailOrName.trim();
    const nextPassword = password.trim();

    if (!nextEmail) {
      setAccessError("Please enter your client email address.");
      return;
    }

    if (!nextPassword) {
      setAccessError("Please enter your portal password.");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await onVerifyPassword(nextPassword, nextEmail);
      if (!response?.success) {
        setAccessError(response?.error || "Invalid email address or portal password.");
      }
    } catch {
      setAccessError("Unable to verify portal access. Please check your credentials.");
    } finally {
      setIsVerifying(false);
    }
  };

  // 3. Forgot Password Submit
  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault();
    setForgotError("");
    setForgotSuccess("");

    const targetEmail = (forgotEmail || emailOrName).trim();
    if (!targetEmail) {
      setForgotError("Please enter your registered client email address.");
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await clientPortalService.forgotPortalPassword({
        portalToken: effectivePortalToken,
        email: targetEmail,
      });

      if (res?.success) {
        setForgotSuccess(res?.message || "Password reset instructions sent to your email.");
      } else {
        setForgotError(res?.error || "Unable to send password reset email.");
      }
    } catch {
      setForgotError("An unexpected error occurred. Please try again later.");
    } finally {
      setIsForgotLoading(false);
    }
  };

  const isFormMode = mode !== "splash";

  return (
    <section className="client-welcome-stage">
      <div className={`client-welcome-glass ${isFormMode ? "is-login-mode" : ""}`}>
        <div className="client-stage-track">
          {/* 1st Section: Splash Center View */}
          <div
            className={`client-stage-view client-welcome-copy ${
              isFormMode ? "slide-out-left" : "slide-in-center"
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

          {/* 2nd Section: Interactive Multi-Mode View (Set Password, Login, Forgot Password) */}
          <div
            className={`client-stage-view client-access-stage-wrap ${
              isFormMode ? "slide-in-view" : "slide-out-right"
            }`}
          >
            {/* Left Column */}
            <div className="client-access-intro">
              <div className="client-wordmark client-wordmark-left">
                <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-wordmark-img" />
              </div>
              <p className="client-welcome-subtitle">
                {mode === "set-password"
                  ? "Set your secure password to continue to FLOXA."
                  : mode === "reset-password"
                  ? "Create a new password for your FLOXA workspace."
                  : mode === "forgot-password"
                  ? "Reset your password to regain access to your workspace."
                  : branding?.heading || "Discover Your Brand Clarity."}
              </p>

              <button
                type="button"
                className="client-gradient-button client-back-pill-button"
                onClick={handleBackClick}
              >
                <span>
                  {mode === "forgot-password" || mode === "reset-password" ? "Back to Login" : "Go Back"}
                </span>
                <span className="client-button-arrow" aria-hidden="true">
                  <ArrowLeft size={14} strokeWidth={2.5} />
                </span>
              </button>
            </div>

            {/* Right Column: Forms */}
            {mode === "set-password" || mode === "reset-password" ? (
              !tokenStatus.valid && !tokenStatus.checking ? (
                /* Invalid / Expired / Missing Token State */
                <div className="client-pill-form">
                  <div className="client-access-error-msg" style={{ marginTop: 0, textAlign: "center", paddingLeft: 0 }}>
                    {tokenStatus.detail ||
                      (mode === "reset-password"
                        ? "This password reset link is invalid or has expired."
                        : "This password setup link is invalid or has expired.")}
                  </div>

                  {mode === "reset-password" ? (
                    <button
                      type="button"
                      className="client-pill-submit-button"
                      onClick={() => {
                        setMode("forgot-password");
                        setForgotEmail(emailOrName);
                        setForgotError("");
                        setForgotSuccess("");
                      }}
                    >
                      <span>Request New Reset Link</span>
                      <span className="client-button-arrow" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={2.5} />
                      </span>
                    </button>
                  ) : tokenStatus.reason === "already_set" ? (
                    <button
                      type="button"
                      className="client-pill-submit-button"
                      onClick={() => {
                        setMode("login");
                        setAccessError("");
                      }}
                    >
                      <span>Go to Login</span>
                      <span className="client-button-arrow" aria-hidden="true">
                        <ArrowRight size={14} strokeWidth={2.5} />
                      </span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="client-forgot-password-link"
                    onClick={() => {
                      setMode("login");
                      setAccessError("");
                    }}
                    style={{ textAlign: "center", marginTop: 4 }}
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                /* Authorized Set Password OR Token-Verified Reset Password Form */
                <form className="client-pill-form" onSubmit={handleSetPasswordSubmit}>
                  {/* Email (Read-Only) */}
                  <div className="client-pill-input-wrap">
                    <span className="client-pill-icon" aria-hidden="true">
                      <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                    </span>
                    <input
                      type="email"
                      className="client-pill-input"
                      placeholder="Client Email Address"
                      value={emailOrName}
                      readOnly
                      style={{ opacity: 0.85 }}
                    />
                  </div>

                  {/* Password Input with Eye Icon */}
                  <div className="client-pill-input-wrap">
                    <span className="client-pill-icon" aria-hidden="true">
                      <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      className="client-pill-input"
                      placeholder={mode === "reset-password" ? "Enter your new password" : "Set your password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAccessError("");
                      }}
                      autoComplete="new-password"
                      disabled={tokenStatus.checking}
                      required
                    />
                    <button
                      type="button"
                      className="client-pill-eye-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff size={18} strokeWidth={2} />
                      ) : (
                        <Eye size={18} strokeWidth={2} />
                      )}
                    </button>
                  </div>

                  {/* Real-time Password Criteria Badges */}
                  <div className="client-password-criteria">
                    <span className={`client-criteria-badge ${hasMinLength ? "valid" : ""}`}>
                      {hasMinLength ? <Check size={12} strokeWidth={3} /> : null} 8+ characters
                    </span>
                    <span className={`client-criteria-badge ${hasLetters ? "valid" : ""}`}>
                      {hasLetters ? <Check size={12} strokeWidth={3} /> : null} Letters (A-Z)
                    </span>
                    <span className={`client-criteria-badge ${hasNumbers ? "valid" : ""}`}>
                      {hasNumbers ? <Check size={12} strokeWidth={3} /> : null} Numbers (0-9)
                    </span>
                  </div>

                  {accessError ? (
                    <div className="client-access-error-msg">{accessError}</div>
                  ) : null}

                  {/* Submit: Set Password / Reset Password */}
                  <button
                    type="submit"
                    className="client-pill-submit-button"
                    disabled={tokenStatus.checking || isSettingPassword || !isPasswordValid}
                  >
                    <span>
                      {tokenStatus.checking
                        ? "Verifying Link..."
                        : mode === "reset-password"
                        ? isSettingPassword
                          ? "Resetting Password..."
                          : "Reset Password & Get Started"
                        : isSettingPassword
                        ? "Setting Password..."
                        : "Set Password & Get Started"}
                    </span>
                    <span className="client-button-arrow" aria-hidden="true">
                      <ArrowRight size={14} strokeWidth={2.5} />
                    </span>
                  </button>
                </form>
              )
            ) : mode === "forgot-password" ? (
              /* Forgot Password Form */
              <form className="client-pill-form" onSubmit={handleForgotPasswordSubmit}>
                <div className="client-pill-input-wrap">
                  <span className="client-pill-icon" aria-hidden="true">
                    <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    type="email"
                    className="client-pill-input"
                    placeholder="Enter your registered email"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotError("");
                      setForgotSuccess("");
                    }}
                    required
                  />
                </div>

                {forgotSuccess ? (
                  <div className="client-access-success-msg">{forgotSuccess}</div>
                ) : null}

                {forgotError ? (
                  <div className="client-access-error-msg">{forgotError}</div>
                ) : null}

                <button
                  type="submit"
                  className="client-pill-submit-button"
                  disabled={isForgotLoading}
                >
                  <span>{isForgotLoading ? "Sending Link..." : "Send Reset Link"}</span>
                  <span className="client-button-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                </button>

                <button
                  type="button"
                  className="client-forgot-password-link"
                  onClick={() => {
                    setMode("login");
                    setForgotError("");
                    setForgotSuccess("");
                  }}
                  style={{ textAlign: "center", marginTop: 4 }}
                >
                  Remembered your password? Back to Login
                </button>
              </form>
            ) : (
              /* Login Form */
              <form className="client-pill-form" onSubmit={handleLoginSubmit}>
                {successMessage ? (
                  <div className="client-access-success-msg">{successMessage}</div>
                ) : null}

                {/* Input 1: Email */}
                <div className="client-pill-input-wrap">
                  <span className="client-pill-icon" aria-hidden="true">
                    <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    type="email"
                    className="client-pill-input"
                    placeholder="Client Email Address"
                    value={emailOrName}
                    onChange={(e) => {
                      setEmailOrName(e.target.value);
                      setAccessError("");
                    }}
                    autoComplete="username"
                    required
                  />
                </div>

                {/* Input 2: Password with Eye Icon */}
                <div className="client-pill-input-wrap">
                  <span className="client-pill-icon" aria-hidden="true">
                    <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="client-pill-input"
                    placeholder={requiresPassword ? "Portal Password" : "Password (optional)"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setAccessError("");
                    }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="client-pill-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={18} strokeWidth={2} />
                    ) : (
                      <Eye size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>

                {/* Forgot Password Link */}
                <button
                  type="button"
                  className="client-forgot-password-link"
                  onClick={() => {
                    setMode("forgot-password");
                    setForgotEmail(emailOrName);
                    setForgotError("");
                    setForgotSuccess("");
                  }}
                >
                  Forgot Password?
                </button>

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
            )}
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
