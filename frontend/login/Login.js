"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginConsultant } from "../src/lib/authApi";
import { showError, showSuccess } from "../src/lib/toast";
import GoogleSignInButton from "../components/auth/GoogleSignInButton";

export default function Login() {
  const router = useRouter();
  const [stage, setStage] = useState("splash");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "login") {
        setStage("login");
      }
    }

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
      showError(message);
    } finally {
      setIsLoading(false);
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
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
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
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Right Column (Form) */}
            <form className="login-pill-form" onSubmit={handleSubmit}>
              {/* Input 1: Email */}
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
                  required
                  autoComplete="username"
                />
              </div>

              {/* Input 2: Password */}
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
                  required
                  autoComplete="current-password"
                />
              </div>

              {errorMessage && <p className="login-error-msg">{errorMessage}</p>}

              {/* Submit Button */}
              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={isLoading}
              >
                <span>{isLoading ? "Signing in..." : "Get Started"}</span>
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

              {/* Google / Social Authentication */}
              <GoogleSignInButton label="Continue with Google" />

              <div className="login-auth-switch">
                <span>Don&apos;t have an account?</span>
                <Link href="/register" className="signup-link">
                  Sign up
                </Link>
              </div>

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
