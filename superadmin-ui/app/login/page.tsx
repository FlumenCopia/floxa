"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { adminApi } from "../../services/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@floxa.com");
  const [password, setPassword] = useState("Password@123");
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
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#060d09",
      padding: "16px 12px",
      backgroundImage: "radial-gradient(ellipse at 50% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 70%)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        backgroundColor: "rgba(13, 27, 20, 0.85)",
        border: "1px solid rgba(16, 185, 129, 0.25)",
        borderRadius: "18px",
        padding: "30px 22px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fbbf24",
            marginBottom: "16px",
          }}>
            <Shield size={24} />
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "0 0 6px 0", letterSpacing: "0.5px" }}>
            FLOXA SuperAdmin
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)", margin: 0 }}>
            Dedicated B2B Platform Management Panel
          </p>
        </div>

        {error ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            padding: "10px 14px",
            borderRadius: "10px",
            fontSize: "13px",
            marginBottom: "20px",
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.8)", marginBottom: "6px", textTransform: "uppercase" }}>
              SuperAdmin Email
            </label>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "10px 14px",
            }}>
              <Mail size={16} color="rgba(255, 255, 255, 0.4)" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@floxa.com"
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  outline: "none",
                  width: "100%",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.8)", marginBottom: "6px", textTransform: "uppercase" }}>
              Password
            </label>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              padding: "10px 14px",
            }}>
              <Lock size={16} color="rgba(255, 255, 255, 0.4)" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  outline: "none",
                  width: "100%",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              backgroundColor: "#10b981",
              border: "none",
              color: "#000",
              fontWeight: 700,
              fontSize: "14px",
              padding: "12px",
              borderRadius: "10px",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "opacity 0.2s",
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span>{loading ? "Authenticating..." : "Sign In to SuperAdmin"}</span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{
          marginTop: "24px",
          paddingTop: "18px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "center",
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.4)",
        }}>
          Default Credentials: <code style={{ color: "#34d399" }}>admin@floxa.com</code> / <code style={{ color: "#34d399" }}>Password@123</code>
        </div>
      </div>
    </div>
  );
}
