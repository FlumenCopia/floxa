"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  KeyRound,
  User,
  Mail,
  CheckCircle2,
  AlertCircle,
  Save,
  Lock,
  Activity,
  Server,
  Database,
  RefreshCw,
  Cpu,
  Clock,
} from "lucide-react";
import { adminApi } from "../../services/api";

export default function AdminSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Profile Edit State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // System Diagnostics State
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loadingSystemStatus, setLoadingSystemStatus] = useState(false);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);

  const fetchSystemStatus = async () => {
    setLoadingSystemStatus(true);
    setSystemStatusError(null);
    try {
      const res = await adminApi.getSystemStatus();
      if (res?.success) {
        setSystemStatus(res);
      } else {
        setSystemStatusError(res?.detail || "Could not fetch cluster status.");
      }
    } catch (err: any) {
      setSystemStatusError(err?.message || "Failed to connect to cluster diagnostics.");
    } finally {
      setLoadingSystemStatus(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (typeof seconds !== "number" || seconds < 0) return "N/A";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  useEffect(() => {
    // 1. Fetch Profile
    adminApi
      .getProfile()
      .then((res) => {
        if (res?.success && res.admin) {
          setProfile(res.admin);
          setName(res.admin.name || "");
          setEmail(res.admin.email || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    // 2. Fetch Cluster & System Diagnostics
    fetchSystemStatus();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await adminApi.updateProfile(name, email);
      if (res?.success) {
        setProfileMsg({ type: "success", text: "SuperAdmin profile updated successfully." });
        setProfile(res.admin);
      }
    } catch (err: any) {
      setProfileMsg({ type: "error", text: err?.message || "Failed to update profile." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await adminApi.changePassword(currentPassword, newPassword);
      if (res?.success) {
        setPasswordMsg({ type: "success", text: "SuperAdmin password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setPasswordMsg({ type: "error", text: err?.message || "Failed to update password." });
    } finally {
      setSavingPassword(false);
    }
  };



  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#f3f8f4", letterSpacing: "-0.01em" }}>
            Platform Settings & Governance
          </h1>
          <span style={{
            backgroundColor: "rgba(77, 255, 160, 0.1)",
            color: "#4dffa0",
            border: "1px solid rgba(77, 255, 160, 0.25)",
            padding: "2px 8px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Governance
          </span>
        </div>
        <p style={{ margin: 0, color: "#89aca0", fontSize: "13px" }}>
          Manage administrator profile, master credentials, and real-time cluster health diagnostics.
        </p>
      </div>

      {/* SECTION 2: SUPERADMIN PROFILE & PASSWORD */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        {/* Profile */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
          borderRadius: "10px",
          padding: "20px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              backgroundColor: "rgba(77, 255, 160, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4dffa0",
            }}>
              <Shield size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                SuperAdmin Profile
              </h2>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                Platform administrator account details
              </span>
            </div>
          </div>

          {profileMsg ? (
            <div style={{
              backgroundColor: profileMsg.type === "success" ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 107, 107, 0.12)",
              border: `1px solid ${profileMsg.type === "success" ? "rgba(77, 255, 160, 0.25)" : "rgba(255, 107, 107, 0.25)"}`,
              color: profileMsg.type === "success" ? "#4dffa0" : "#ff6b6b",
              padding: "10px 14px",
              borderRadius: "6px",
              marginBottom: "14px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              {profileMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{profileMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleUpdateProfile}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                Display Name
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 36px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.18)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
                <User size={14} style={{ position: "absolute", left: "12px", top: "11px", color: "#607f72" }} />
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 36px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.18)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
                <Mail size={14} style={{ position: "absolute", left: "12px", top: "11px", color: "#607f72" }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile || loadingProfile}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                backgroundColor: "#4dffa0",
                border: "none",
                borderRadius: "6px",
                color: "#001a0e",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Save size={13} />
              <span>{savingProfile ? "Saving..." : "Update Profile"}</span>
            </button>
          </form>
        </div>

        {/* Password */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
          borderRadius: "10px",
          padding: "20px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              backgroundColor: "rgba(192, 132, 252, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c084fc",
            }}>
              <KeyRound size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                Security & Password
              </h2>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                Update password for superadmin access
              </span>
            </div>
          </div>

          {passwordMsg ? (
            <div style={{
              backgroundColor: passwordMsg.type === "success" ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 107, 107, 0.12)",
              border: `1px solid ${passwordMsg.type === "success" ? "rgba(77, 255, 160, 0.25)" : "rgba(255, 107, 107, 0.25)"}`,
              color: passwordMsg.type === "success" ? "#4dffa0" : "#ff6b6b",
              padding: "10px 14px",
              borderRadius: "6px",
              marginBottom: "14px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              {passwordMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{passwordMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: "rgba(2, 14, 9, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.18)",
                  borderRadius: "6px",
                  color: "#e8f5ef",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>

            <div className="admin-form-grid-2">
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.18)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.18)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                backgroundColor: "rgba(192, 132, 252, 0.15)",
                border: "1px solid rgba(192, 132, 252, 0.3)",
                borderRadius: "6px",
                color: "#c084fc",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Lock size={13} />
              <span>{savingPassword ? "Updating..." : "Change Password"}</span>
            </button>
          </form>
        </div>
      </div>

      {/* SECTION 3: SYSTEM & CLUSTER DIAGNOSTICS */}
      <div>
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
          borderRadius: "10px",
          padding: "20px 22px",
        }}>
          {/* Card Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: "rgba(77, 255, 160, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4dffa0",
              }}>
                <Activity size={16} />
              </div>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  System & Cluster Diagnostics
                </h2>
                <span style={{ fontSize: "11px", color: "#607f72" }}>
                  Live cluster metrics, database connection status, and Node.js process telemetry
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchSystemStatus}
              disabled={loadingSystemStatus}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                backgroundColor: "rgba(77, 255, 160, 0.1)",
                border: "1px solid rgba(77, 255, 160, 0.25)",
                color: "#4dffa0",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} style={{ animation: loadingSystemStatus ? "spin 1s linear infinite" : "none" }} />
              <span>{loadingSystemStatus ? "Checking..." : "Refresh Status"}</span>
            </button>
          </div>

          {systemStatusError ? (
            <div style={{
              backgroundColor: "rgba(255, 107, 107, 0.12)",
              border: "1px solid rgba(255, 107, 107, 0.25)",
              color: "#ff6b6b",
              padding: "10px 14px",
              borderRadius: "6px",
              marginBottom: "16px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              <AlertCircle size={14} />
              <span>{systemStatusError}</span>
            </div>
          ) : null}

          {/* 4-Stat Metric Grid */}
          <div className="admin-stats-grid">
            {/* Database Health */}
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              borderRadius: "8px",
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#89aca0" }}>MongoDB Database</span>
                <Database size={14} color="#4dffa0" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: systemStatus?.database?.status === "connected" ? "#4dffa0" : "#ff6b6b",
                  boxShadow: systemStatus?.database?.status === "connected" ? "0 0 8px #4dffa0" : "none",
                }} />
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#f3f8f4", textTransform: "capitalize" }}>
                  {systemStatus?.database?.status || "Connecting..."}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                {systemStatus?.database?.pingMs !== undefined && systemStatus.database.pingMs >= 0
                  ? `Ping latency: ${systemStatus.database.pingMs}ms`
                  : "Checking database latency..."}
              </span>
            </div>

            {/* Service & Runtime */}
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              borderRadius: "8px",
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#89aca0" }}>API Service</span>
                <Server size={14} color="#4a9eff" />
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#f3f8f4", marginBottom: "4px" }}>
                {systemStatus?.service || "superadmin-api"}
              </div>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                {systemStatus?.server?.nodeVersion ? `${systemStatus.server.nodeVersion} (${systemStatus.server.environment})` : "Port 5001"}
              </span>
            </div>

            {/* Process Uptime */}
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              borderRadius: "8px",
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#89aca0" }}>API Process Uptime</span>
                <Clock size={14} color="#f0b429" />
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#f3f8f4", marginBottom: "4px" }}>
                {formatUptime(systemStatus?.server?.uptimeSeconds)}
              </div>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                Continuous cluster runtime
              </span>
            </div>

            {/* Memory Usage */}
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              borderRadius: "8px",
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#89aca0" }}>Memory Footprint</span>
                <Cpu size={14} color="#a78bfa" />
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#f3f8f4", marginBottom: "4px" }}>
                {systemStatus?.server?.memoryHeapUsedMb !== undefined ? `${systemStatus.server.memoryHeapUsedMb} MB Heap` : "Analyzing..."}
              </div>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                {systemStatus?.server?.memoryRssMb !== undefined ? `RSS: ${systemStatus.server.memoryRssMb} MB` : "Node cluster resident"}
              </span>
            </div>
          </div>

          {/* Diagnostic Footer */}
          {systemStatus?.timestamp ? (
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "10px", color: "#607f72" }}>
                Last verified: {new Date(systemStatus.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
