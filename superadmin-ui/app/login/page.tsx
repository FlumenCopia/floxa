"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";
import { adminApi } from "../../services/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await adminApi.login(email, password);
      router.push("/");
    } catch (err: any) {
      setError(err?.message || "Invalid SuperAdmin email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-screen">
      <div className="login-card is-login-mode">
        <div className="login-stage-track">
          <div className="login-stage-view login-access-wrap slide-in-view">
            {/* Left Column: FLOXA Brand Identity */}
            <div className="login-access-intro">
              <div className="login-brand-logo">
                <img
                  src="/image/FLOXA_log.png"
                  alt="FLOXA"
                  className="login-brand-logo-img"
                />
              </div>
              <p className="login-brand-subtitle">
                SuperAdmin Control Panel.
              </p>

              <div className="login-admin-badge">
                <span className="login-admin-badge-icon" aria-hidden="true">
                  <Shield size={14} strokeWidth={2.2} />
                </span>
                <span>Platform Governance Console</span>
              </div>
            </div>

            {/* Right Column: Pill Form */}
            <form className="login-pill-form" onSubmit={handleSubmit}>
              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type="email"
                  name="email"
                  className="login-pill-input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="login-pill-input-wrap">
                <span className="login-pill-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} stroke="#6b7280" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  className="login-pill-input"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-pill-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              {error ? (
                <div className="login-error-banner" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                type="submit"
                className="login-pill-submit-btn"
                disabled={loading}
              >
                <span>{loading ? "Authenticating..." : "Sign In"}</span>
                {!loading && (
                  <span className="login-btn-arrow" aria-hidden="true">
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </span>
                )}
              </button>

              <p className="login-terms-note">
                Authorized platform administrators only.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
