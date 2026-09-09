"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerConsultant } from "@/lib/authApi";
import { showError, showSuccess } from "@/lib/toast";
import GoogleSignInButton from "../../components/auth/GoogleSignInButton";
import { ArrowRight, ArrowLeft, User, Mail, Lock } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [stage, setStage] = useState("register");
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
        router.push("/login?mode=login");
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
                <ArrowRight size={14} strokeWidth={2.5} />
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
                onClick={() => router.push("/login?mode=login")}
              >
                <span>Go Back</span>
                <span className="login-btn-arrow" aria-hidden="true">
                  <ArrowLeft size={14} strokeWidth={2.5} />
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="login-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Name */}
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <User size={18} strokeWidth={2} stroke="#6b7280" />
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
                  <Mail size={18} strokeWidth={2} stroke="#6b7280" />
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
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
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
                  <ArrowRight size={14} strokeWidth={2.5} />
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
                <Link href="/login?mode=login" className="signup-link">
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







