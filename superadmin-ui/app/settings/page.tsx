"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  KeyRound,
  User,
  Mail,
  Megaphone,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Lock,
  Cpu,
  CreditCard,
  Send,
  Zap,
  Trash2,
  Server,
  Activity,
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

  // Integrations & API Keys State
  const [integrations, setIntegrations] = useState<any>(null);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [razorpayKeyIdInput, setRazorpayKeyIdInput] = useState("");
  const [razorpayKeySecretInput, setRazorpayKeySecretInput] = useState("");
  const [smtpUserInput, setSmtpUserInput] = useState("");
  const [smtpHostInput, setSmtpHostInput] = useState("");
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [integrationsMsg, setIntegrationsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Gemini Live Test State
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<any>(null);

  // Announcement State
  const [annMessage, setAnnMessage] = useState("");
  const [annType, setAnnType] = useState<"info" | "warning" | "success">("info");
  const [annActive, setAnnActive] = useState(false);
  const [savingAnn, setSavingAnn] = useState(false);
  const [annMsg, setAnnMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Export & Purge State
  const [exportingConsultants, setExportingConsultants] = useState(false);
  const [exportingProjects, setExportingProjects] = useState(false);
  const [purgingDemo, setPurgingDemo] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchIntegrations = () => {
    setLoadingIntegrations(true);
    adminApi
      .getIntegrations()
      .then((res) => {
        if (res?.success && res.integrations) {
          setIntegrations(res.integrations);
          setRazorpayKeyIdInput(res.integrations.razorpayKeyId || "");
          setSmtpUserInput(res.integrations.smtpUser || "");
          setSmtpHostInput(res.integrations.smtpHost || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingIntegrations(false));
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

    // 2. Fetch Announcement
    adminApi
      .getAnnouncement()
      .then((res) => {
        if (res?.success && res.announcement) {
          setAnnMessage(res.announcement.message || "");
          setAnnType(res.announcement.type || "info");
          setAnnActive(Boolean(res.announcement.isActive));
        }
      })
      .catch(() => {});

    // 3. Fetch Integrations
    fetchIntegrations();
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

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIntegrations(true);
    setIntegrationsMsg(null);
    try {
      const payload: any = {};
      if (geminiKeyInput.trim()) payload.geminiApiKey = geminiKeyInput.trim();
      if (razorpayKeyIdInput.trim()) payload.razorpayKeyId = razorpayKeyIdInput.trim();
      if (razorpayKeySecretInput.trim()) payload.razorpayKeySecret = razorpayKeySecretInput.trim();
      if (smtpUserInput.trim()) payload.smtpUser = smtpUserInput.trim();
      if (smtpHostInput.trim()) payload.smtpHost = smtpHostInput.trim();

      const res = await adminApi.updateIntegrations(payload);
      if (res?.success) {
        setIntegrationsMsg({ type: "success", text: "Platform API Keys & Integrations updated successfully." });
        setGeminiKeyInput("");
        setRazorpayKeySecretInput("");
        fetchIntegrations();
      }
    } catch (err: any) {
      setIntegrationsMsg({ type: "error", text: err?.message || "Failed to update integrations." });
    } finally {
      setSavingIntegrations(false);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await adminApi.testGemini(geminiKeyInput.trim() || undefined);
      setGeminiTestResult({
        success: true,
        message: res.message,
        latencyMs: res.latencyMs,
        modelsCount: res.modelsCount,
      });
    } catch (err: any) {
      setGeminiTestResult({
        success: false,
        message: err?.message || "Failed to connect to Google Gemini API.",
      });
    } finally {
      setTestingGemini(false);
    }
  };

  const handlePurgeDemoData = async () => {
    if (!confirm("Are you sure you want to remove all sample demo agencies? Real accounts (like nidhinkg100@gmail.com) will be preserved.")) {
      return;
    }
    setPurgingDemo(true);
    setPurgeMsg(null);
    try {
      const res = await adminApi.purgeDemoData();
      setPurgeMsg({
        type: "success",
        text: `Demo agencies purged. Removed ${res.deletedConsultantsCount} demo consultants and ${res.deletedProjectsCount} demo projects.`,
      });
    } catch (err: any) {
      setPurgeMsg({ type: "error", text: err?.message || "Failed to purge demo data." });
    } finally {
      setPurgingDemo(false);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAnn(true);
    setAnnMsg(null);
    try {
      const res = await adminApi.updateAnnouncement(annMessage, annType, annActive);
      if (res?.success) {
        setAnnMsg({ type: "success", text: "Global announcement broadcast updated." });
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: any) {
      setAnnMsg({ type: "error", text: err?.message || "Failed to update announcement." });
    } finally {
      setSavingAnn(false);
    }
  };

  const handleExportConsultants = async () => {
    setExportingConsultants(true);
    try {
      await adminApi.downloadConsultantsCsv();
    } catch (err: any) {
      alert(err?.message || "Failed to download consultants CSV.");
    } finally {
      setExportingConsultants(false);
    }
  };

  const handleExportProjects = async () => {
    setExportingProjects(true);
    try {
      await adminApi.downloadProjectsCsv();
    } catch (err: any) {
      alert(err?.message || "Failed to download projects CSV.");
    } finally {
      setExportingProjects(false);
    }
  };

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
            Platform Settings & Governance
          </h1>
          <span style={{
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            color: "#34d399",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            padding: "3px 10px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px"
          }}>
            Real Data Mode • Live Production Integrations
          </span>
        </div>
        <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.6)", fontSize: "14px" }}>
          Manage real production API keys (Gemini, Razorpay, SMTP), credentials security, and data governance
        </p>
      </div>

      {/* PLATFORM INTEGRATIONS & REAL API KEYS MANAGER */}
      <div style={{
        backgroundColor: "rgba(13, 27, 20, 0.8)",
        border: "1px solid rgba(14, 165, 233, 0.35)",
        borderRadius: "16px",
        padding: "26px",
        marginBottom: "32px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "rgba(14, 165, 233, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#38bdf8",
            }}>
              <Cpu size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#fff" }}>
                Production Integrations & Real API Keys
              </h2>
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                Live credentials for Google Gemini AI, Razorpay Subscriptions, and Transactional Email
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              padding: "5px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
            }}>
              <Activity size={13} />
              <span>All 3 Services Connected</span>
            </span>
          </div>
        </div>

        {integrationsMsg ? (
          <div style={{
            backgroundColor: integrationsMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${integrationsMsg.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: integrationsMsg.type === "success" ? "#34d399" : "#fca5a5",
            padding: "12px 16px",
            borderRadius: "10px",
            marginBottom: "20px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            {integrationsMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{integrationsMsg.text}</span>
          </div>
        ) : null}

        <form onSubmit={handleSaveIntegrations}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "22px" }}>
            {/* 1. Google Gemini AI */}
            <div style={{
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Zap size={16} color="#38bdf8" />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                    Google Gemini AI Key
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: integrations?.geminiConfigured ? "#34d399" : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                  {integrations?.geminiConfigured ? "● Active in Backend" : "○ Not Configured"}
                </span>
              </div>

              <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "10px" }}>
                Current Active Key: <code style={{ color: "#38bdf8" }}>{integrations?.geminiApiKeyMasked || "Not configured"}</code>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                  Update Production Key (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Paste new Gemini API Key to override..."
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={testingGemini}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(14, 165, 233, 0.15)",
                    border: "1px solid rgba(14, 165, 233, 0.35)",
                    color: "#38bdf8",
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={12} className={testingGemini ? "spin" : ""} />
                  <span>{testingGemini ? "Testing..." : "Test AI Connection"}</span>
                </button>

                {geminiTestResult ? (
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: geminiTestResult.success ? "#34d399" : "#f87171",
                  }}>
                    {geminiTestResult.success
                      ? `✓ Verified (${geminiTestResult.latencyMs}ms, ${geminiTestResult.modelsCount} models)`
                      : `✗ ${geminiTestResult.message}`}
                  </span>
                ) : null}
              </div>
            </div>

            {/* 2. Payment Gateway (Razorpay) */}
            <div style={{
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CreditCard size={16} color="#fbbf24" />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                    Razorpay Payment Gateway
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: integrations?.razorpayConfigured ? "#fbbf24" : "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                  {integrations?.razorpayConfigured ? "● Active Mode" : "○ Not Configured"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                    Key ID
                  </label>
                  <input
                    type="text"
                    placeholder="rzp_live_..."
                    value={razorpayKeyIdInput}
                    onChange={(e) => setRazorpayKeyIdInput(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                    Key Secret
                  </label>
                  <input
                    type="password"
                    placeholder="Enter Secret to update"
                    value={razorpayKeySecretInput}
                    onChange={(e) => setRazorpayKeySecretInput(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                Secret currently saved: <code style={{ color: "#fbbf24" }}>{integrations?.razorpayKeySecretMasked || "Not configured"}</code>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={savingIntegrations}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 20px",
                backgroundColor: "#10b981",
                border: "none",
                borderRadius: "8px",
                color: "#032014",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Save size={14} />
              <span>{savingIntegrations ? "Saving Keys..." : "Save Production API Keys"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: SUPERADMIN PROFILE & PASSWORD */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px", marginBottom: "36px" }}>
        {/* Profile */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#34d399",
            }}>
              <Shield size={19} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#fff" }}>
                SuperAdmin Account Profile
              </h2>
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                Update master platform administrator identity
              </span>
            </div>
          </div>

          {profileMsg ? (
            <div style={{
              backgroundColor: profileMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${profileMsg.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              color: profileMsg.type === "success" ? "#34d399" : "#fca5a5",
              padding: "10px 14px",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              {profileMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{profileMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleUpdateProfile}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                SuperAdmin Display Name
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 38px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
                <User size={15} style={{ position: "absolute", left: "14px", top: "13px", color: "rgba(255, 255, 255, 0.4)" }} />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                SuperAdmin Email Address
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 38px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
                <Mail size={15} style={{ position: "absolute", left: "14px", top: "13px", color: "rgba(255, 255, 255, 0.4)" }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile || loadingProfile}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                backgroundColor: "#10b981",
                border: "none",
                borderRadius: "8px",
                color: "#032014",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Save size={14} />
              <span>{savingProfile ? "Saving Profile..." : "Update Profile"}</span>
            </button>
          </form>
        </div>

        {/* Password */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(168, 85, 247, 0.2)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "rgba(168, 85, 247, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c084fc",
            }}>
              <KeyRound size={19} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#fff" }}>
                Security & Master Password
              </h2>
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                Rotate password with secure bcrypt salt hashing
              </span>
            </div>
          </div>

          {passwordMsg ? (
            <div style={{
              backgroundColor: passwordMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${passwordMsg.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              color: passwordMsg.type === "success" ? "#34d399" : "#fca5a5",
              padding: "10px 14px",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              {passwordMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{passwordMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
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
                  padding: "10px 14px",
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
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
                    padding: "10px 14px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "14px",
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
                gap: "8px",
                padding: "9px 18px",
                backgroundColor: "#a855f7",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Lock size={14} />
              <span>{savingPassword ? "Updating Password..." : "Change Password"}</span>
            </button>
          </form>
        </div>
      </div>

      {/* SECTION 3: GLOBAL ANNOUNCEMENT & DATA EXPORTS / DATA CLEANING */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "28px" }}>
        {/* Announcement */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fbbf24",
            }}>
              <Megaphone size={19} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#fff" }}>
                Global Broadcast Announcement
              </h2>
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                Publish a banner visible across the entire platform ecosystem
              </span>
            </div>
          </div>

          {annMsg ? (
            <div style={{
              backgroundColor: annMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${annMsg.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              color: annMsg.type === "success" ? "#34d399" : "#fca5a5",
              padding: "10px 14px",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              {annMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{annMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleSaveAnnouncement}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                Broadcast Message
              </label>
              <textarea
                rows={3}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="e.g. Scheduled maintenance this Sunday at 02:00 UTC. All services will remain operational."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "20px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                  Banner Severity
                </label>
                <select
                  value={annType}
                  onChange={(e) => setAnnType(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <option value="info">Information (Blue)</option>
                  <option value="warning">Warning / Notice (Amber)</option>
                  <option value="success">Feature Release / Success (Green)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px" }}>
                  Status
                </label>
                <button
                  type="button"
                  onClick={() => setAnnActive(!annActive)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    backgroundColor: annActive ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    border: annActive ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.15)",
                    color: annActive ? "#34d399" : "rgba(255, 255, 255, 0.5)",
                  }}
                >
                  {annActive ? "● Banner Active" : "○ Disabled"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingAnn}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                backgroundColor: "#f59e0b",
                border: "none",
                borderRadius: "8px",
                color: "#1c1917",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Save size={14} />
              <span>{savingAnn ? "Saving Broadcast..." : "Save Announcement"}</span>
            </button>
          </form>
        </div>

        {/* Data Exports & Demo Data Governance */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "16px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#60a5fa",
              }}>
                <Download size={19} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#fff" }}>
                  Data Exports & Governance
                </h2>
                <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                  Download CSV spreadsheets & govern database integrity
                </span>
              </div>
            </div>

            {/* CSV Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              <button
                type="button"
                onClick={handleExportConsultants}
                disabled={exportingConsultants}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <FileSpreadsheet size={16} color="#34d399" />
                  <span>Consultant Directory (.CSV)</span>
                </div>
                <span style={{ fontSize: "12px", color: "#34d399" }}>
                  {exportingConsultants ? "Downloading..." : "Download"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportProjects}
                disabled={exportingProjects}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <FileSpreadsheet size={16} color="#60a5fa" />
                  <span>Platform Projects (.CSV)</span>
                </div>
                <span style={{ fontSize: "12px", color: "#60a5fa" }}>
                  {exportingProjects ? "Downloading..." : "Download"}
                </span>
              </button>
            </div>

            {/* Database Purge / Clean Demo Status */}
            <div style={{
              backgroundColor: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "10px",
              padding: "14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                  Demo Data Purge
                </span>
                <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>
                  ● 100% Real Data Active
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                Remove sample agencies and retain only real consultants (like <code>nidhinkg100@gmail.com</code>).
              </p>

              {purgeMsg ? (
                <div style={{ fontSize: "11px", color: "#34d399", marginBottom: "8px", fontWeight: 600 }}>
                  {purgeMsg.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handlePurgeDemoData}
                disabled={purgingDemo}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#f87171",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Trash2 size={12} />
                <span>{purgingDemo ? "Purging..." : "Purge Demo Agencies"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
