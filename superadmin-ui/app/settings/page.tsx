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
  Save,
  Lock,
  Trash2,
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

  const handlePurgeDemoData = async () => {
    if (!confirm("Are you sure you want to remove sample demo agencies? Real accounts (like nidhinkg100@gmail.com) will be preserved.")) {
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
          Manage administrator profile, master credentials, broadcast announcements, and data exports.
        </p>
      </div>

      {/* SECTION 2: SUPERADMIN PROFILE & PASSWORD */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px", marginBottom: "24px" }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
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

      {/* SECTION 3: GLOBAL ANNOUNCEMENT & DATA EXPORTS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" }}>
        {/* Announcement */}
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
              backgroundColor: "rgba(240, 180, 41, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f0b429",
            }}>
              <Megaphone size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                Global Broadcast Announcement
              </h2>
              <span style={{ fontSize: "11px", color: "#607f72" }}>
                Publish a banner visible across all workspace sessions
              </span>
            </div>
          </div>

          {annMsg ? (
            <div style={{
              backgroundColor: annMsg.type === "success" ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 107, 107, 0.12)",
              border: `1px solid ${annMsg.type === "success" ? "rgba(77, 255, 160, 0.25)" : "rgba(255, 107, 107, 0.25)"}`,
              color: annMsg.type === "success" ? "#4dffa0" : "#ff6b6b",
              padding: "10px 14px",
              borderRadius: "6px",
              marginBottom: "14px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              {annMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{annMsg.text}</span>
            </div>
          ) : null}

          <form onSubmit={handleSaveAnnouncement}>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                Broadcast Message
              </label>
              <textarea
                rows={3}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="e.g. Scheduled platform maintenance this Sunday at 02:00 UTC."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  backgroundColor: "rgba(2, 14, 9, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.18)",
                  borderRadius: "6px",
                  color: "#e8f5ef",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                  Banner Severity
                </label>
                <select
                  value={annType}
                  onChange={(e) => setAnnType(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.18)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "12px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="info">Information (Blue)</option>
                  <option value="warning">Warning / Notice (Amber)</option>
                  <option value="success">Feature Release / Success (Green)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#89aca0", marginBottom: "6px" }}>
                  Status
                </label>
                <button
                  type="button"
                  onClick={() => setAnnActive(!annActive)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: annActive ? "rgba(77, 255, 160, 0.15)" : "rgba(255, 255, 255, 0.05)",
                    border: annActive ? "1px solid rgba(77, 255, 160, 0.35)" : "1px solid rgba(255, 255, 255, 0.1)",
                    color: annActive ? "#4dffa0" : "#607f72",
                  }}
                >
                  {annActive ? "● Active" : "○ Disabled"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingAnn}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                backgroundColor: "rgba(240, 180, 41, 0.15)",
                border: "1px solid rgba(240, 180, 41, 0.3)",
                borderRadius: "6px",
                color: "#f0b429",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Save size={13} />
              <span>{savingAnn ? "Saving..." : "Save Announcement"}</span>
            </button>
          </form>
        </div>

        {/* Data Exports & Maintenance */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
          borderRadius: "10px",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: "rgba(74, 158, 255, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4a9eff",
              }}>
                <Download size={16} />
              </div>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  Data Exports & Governance
                </h2>
                <span style={{ fontSize: "11px", color: "#607f72" }}>
                  Download CSV spreadsheets & manage database records
                </span>
              </div>
            </div>

            {/* CSV Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={handleExportConsultants}
                disabled={exportingConsultants}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(2, 14, 9, 0.6)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  color: "#e8f5ef",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FileSpreadsheet size={14} color="#4dffa0" />
                  <span>Consultant Directory (.CSV)</span>
                </div>
                <span style={{ fontSize: "11px", color: "#4dffa0" }}>
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
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(2, 14, 9, 0.6)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  color: "#e8f5ef",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FileSpreadsheet size={14} color="#4a9eff" />
                  <span>Platform Projects (.CSV)</span>
                </div>
                <span style={{ fontSize: "11px", color: "#4a9eff" }}>
                  {exportingProjects ? "Downloading..." : "Download"}
                </span>
              </button>
            </div>

            {/* Database Purge / Clean Demo Status */}
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.5)",
              border: "1px solid rgba(255, 107, 107, 0.2)",
              borderRadius: "6px",
              padding: "12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#f3f8f4" }}>
                  Demo Accounts Purge
                </span>
                <span style={{ fontSize: "10px", color: "#4dffa0", fontWeight: 600 }}>
                  ● Clean Database
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "#89aca0", margin: "0 0 8px 0", lineHeight: "1.4" }}>
                Remove sample agencies and retain only production consultants (like <code>nidhinkg100@gmail.com</code>).
              </p>

              {purgeMsg ? (
                <div style={{ fontSize: "11px", color: "#4dffa0", marginBottom: "8px", fontWeight: 600 }}>
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
                  gap: "5px",
                  backgroundColor: "rgba(255, 107, 107, 0.12)",
                  border: "1px solid rgba(255, 107, 107, 0.25)",
                  color: "#ff6b6b",
                  padding: "5px 10px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Trash2 size={11} />
                <span>{purgingDemo ? "Purging..." : "Purge Demo Agencies"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
