"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginConsultant } from "../src/lib/authApi";
import { showError, showSuccess } from "../src/lib/toast";

import GoogleSignInButton from "../components/auth/GoogleSignInButton";

export default function Login() {

  const router = useRouter();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

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

        if (isMounted) {
          setIsCheckingSession(false);
        }
      } catch {
        if (isMounted) {
          setIsCheckingSession(false);
        }
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

  if (isCheckingSession) {
    return (
      <div id="login-screen">
        <div className="login-card">
          <div className="login-logo">FLOXA</div>
          <div className="login-tagline">Checking session...</div>
        </div>
      </div>
    );
  }

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo">FLOXA</div>
        <div className="login-tagline">Clarity Before Creation</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-3">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              name="email"
              placeholder="you@studio.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group mb-3">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          {errorMessage && <p className="error-message">{errorMessage}</p>}

          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="login-divider">or</div>

        <GoogleSignInButton label="Continue with Google" />


        <div className="auth-switch">
          <span>Don&apos;t have an account?</span>
          <Link href="/register" className="signup-link">
            Sign up
          </Link>
        </div>

        <div className="login-footer">By signing in you agree to our Terms &amp; Privacy Policy</div>
      </div>
    </div>
  );
}
