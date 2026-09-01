"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";
import GoogleSignInButton from "../../components/auth/GoogleSignInButton";

export default function RegisterPage() {
  const router = useRouter();
  const [stage, setStage] = useState("splash");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const getRegisterError = (data) => {
    if (data?.detail) {
      return data.detail;
    }

    if (data?.message) {
      return data.message;
    }

    const firstFieldError = Object.values(data || {}).flat()[0];
    if (firstFieldError) {
      return firstFieldError;
    }

    return "Registration failed. Please check your details and try again.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      await registerConsultant(formData);

      setSuccessMessage("Registration successful. Redirecting to login...");
      showSuccess("Registration successful. Redirecting to login.");
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (error) {
      console.error(error);
      const message = getRegisterError(error);
      setErrorMessage(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const isRegister = stage === "register";

  return (
    <div id="login-screen">
      <div className={`login-card ${isRegister ? "is-login-mode" : ""}`}>
        <div className="login-stage-track">
          {/* 1st Section: Splash Center View */}
          <div
            className={`login-stage-view login-splash-view ${
              isRegister ? "slide-out-left" : "slide-in-center"
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
              onClick={() => setStage("register")}
            >
              <span>Let&apos;s Begin</span>
              <span className="login-btn-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          </div>

          {/* 2nd Section: Register 2-Column View */}
          <div
            className={`login-stage-view login-access-wrap ${
              isRegister ? "slide-in-view" : "slide-out-right"
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
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="login-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Name */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="name"
                  className="login-pill-input"
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              {/* Input 2: Email */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  type="email"
                  name="email"
                  className="login-pill-input"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              {/* Input 3: Password */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type="password"
                  name="password"
                  className="login-pill-input"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              {errorMessage ? <p className="login-error-msg">{errorMessage}</p> : null}
              {successMessage ? (
                <p className="login-error-msg" style={{ color: "var(--neon)" }}>
                  {successMessage}
                </p>
              ) : null}

              {/* Submit Button */}
              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={isLoading}
              >
                <span>{isLoading ? "Creating account..." : "Get Started"}</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </button>

              {/* OR Divider */}
              <div className="login-or-divider">
                <span>OR</span>
              </div>

              {/* Google Sign In Button */}
              <GoogleSignInButton label="Continue with Google" />

              <div className="login-auth-switch">
                <span>Already have an account?</span>
                <Link href="/login" className="signup-link">
                  Sign in
                </Link>
              </div>

              <div className="login-terms-note">
                By signing up you agree to our Terms &amp; Privacy Policy
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}







