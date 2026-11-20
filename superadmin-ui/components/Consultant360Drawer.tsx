"use client";

import { useEffect, useState } from "react";
import {
  X,
  Building,
  Mail,
  Calendar,
  FolderKanban,
  Users,
  Cpu,
  UserCheck,
  UserX,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  AlertCircle,
  Bell,
  CheckCircle2,
  Key,
  CreditCard,
  Clock,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { adminApi } from "../services/api";

interface Consultant360DrawerProps {
  consultantId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export default function Consultant360Drawer({
  consultantId,
  isOpen,
  onClose,
  onUpdated,
}: Consultant360DrawerProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"projects" | "clients" | "subscription" | "ai" | "settings">("projects");

  // Subscription & Timeline State
  const [plansList, setPlansList] = useState<any[]>([]);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("monthly");
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [daysToAdd, setDaysToAdd] = useState(30);
  const [timelineReason, setTimelineReason] = useState("");
  const [customExpiryDate, setCustomExpiryDate] = useState("");
  const [adjustingTimeline, setAdjustingTimeline] = useState(false);
  const [overrideProjects, setOverrideProjects] = useState<string>("");
  const [overrideClients, setOverrideClients] = useState<string>("");
  const [updatingOverrides, setUpdatingOverrides] = useState(false);


  // Status Toggle State
  const [togglingStatus, setTogglingStatus] = useState(false);

  // AI Quota State
  const [quotaAction, setQuotaAction] = useState<"reset" | "add-credits">("reset");
  const [bonusCredits, setBonusCredits] = useState<number>(25);
  const [updatingQuota, setUpdatingQuota] = useState(false);

  // UI Feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Reset State
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccessData, setResetSuccessData] = useState<{ email: string; pass: string; emailDispatched?: boolean } | null>(null);
  const [copiedResetPass, setCopiedResetPass] = useState(false);

  const fetchDetails = async () => {
    if (!consultantId) return;
    setLoading(true);
    setError("");
    try {
      const [res, plansRes] = await Promise.all([
        adminApi.getConsultantDetails(consultantId),
        adminApi.getPlans().catch(() => ({ plans: [] })),
      ]);

      if (res?.success && res.data) {
        setData(res.data);
        const sub = res.data.consultant?.subscription;
        setSelectedPlanSlug(sub?.plan || "free");
        setSelectedCycle(sub?.billingCycle || "monthly");
        const overrides = sub?.customLimitOverrides || {};
        setOverrideProjects(overrides.maxProjects !== undefined && overrides.maxProjects !== null ? String(overrides.maxProjects) : "");
        setOverrideClients(overrides.maxClients !== undefined && overrides.maxClients !== null ? String(overrides.maxClients) : "");
      } else {
        setError("Failed to load consultant details.");
      }

      if (plansRes?.plans) {
        setPlansList(plansRes.plans);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load consultant profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && consultantId) {
      fetchDetails();
      setFeedback(null);
    } else {
      setData(null);
    }
  }, [isOpen, consultantId]);

  if (!isOpen) return null;

  const consultant = data?.consultant;
  const projects = data?.projects || [];
  const clients = data?.clients || [];
  const stats = data?.stats || {};

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleToggleStatus = async () => {
    if (!consultant) return;
    setTogglingStatus(true);
    setFeedback(null);
    try {
      const newStatus = !consultant.isActive;
      await adminApi.updateConsultantStatus(consultant.id, newStatus);
      setFeedback({
        type: "success",
        text: `Consultant account ${newStatus ? "Activated" : "Suspended"} successfully.`,
      });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to toggle status." });
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleUpdateQuota = async () => {
    if (!consultant) return;
    setUpdatingQuota(true);
    setFeedback(null);
    try {
      await adminApi.updateConsultantAiQuota(
        consultant.id,
        quotaAction,
        quotaAction === "add-credits" ? bonusCredits : undefined
      );
      setFeedback({
        type: "success",
        text: quotaAction === "reset" ? "Tool runs reset to zero." : `Added ${bonusCredits} bonus runs to balance.`,
      });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to update AI quota." });
    } finally {
      setUpdatingQuota(false);
    }
  };

  const generateResetPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPasswordInput(pwd);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultantId || !consultant) return;
    if (!resetPasswordInput.trim() || resetPasswordInput.trim().length < 8) {
      setFeedback({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }

    setResettingPassword(true);
    setFeedback(null);
    try {
      const res = await adminApi.resetConsultantPassword(consultantId, resetPasswordInput.trim());
      if (res?.success) {
        setResetSuccessData({
          email: consultant.email,
          pass: resetPasswordInput.trim(),
          emailDispatched: Boolean(res?.emailDispatched),
        });
        setFeedback({
          type: "success",
          text: res?.emailDispatched
            ? `Password reset & email notification sent to ${consultant.email}.`
            : `Password successfully reset for ${consultant.name}.`,
        });
        setResetPasswordInput("");
      } else {
        setFeedback({ type: "error", text: res?.detail || "Failed to reset password." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to reset password." });
    } finally {
      setResettingPassword(false);
    }
  };

  const copyResetCredentials = () => {
    if (!resetSuccessData) return;
    const text = `FLOXA Customer Account Credentials:\nEmail: ${resetSuccessData.email}\nNew Password: ${resetSuccessData.pass}\nLogin URL: http://localhost:3000/login`;
    navigator.clipboard.writeText(text);
    setCopiedResetPass(true);
    setTimeout(() => setCopiedResetPass(false), 3000);
  };

  const handleSavePlan = async () => {
    if (!consultant) return;
    setUpdatingPlan(true);
    setFeedback(null);
    try {
      await adminApi.updateConsultantPlan(consultant.id, selectedPlanSlug, undefined, undefined, selectedCycle);
      setFeedback({ type: "success", text: `Subscription plan updated to ${selectedPlanSlug} (${selectedCycle}).` });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to update subscription plan." });
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleAdjustTimeline = async () => {
    if (!consultant) return;
    setAdjustingTimeline(true);
    setFeedback(null);
    try {
      await adminApi.adjustConsultantTimeline(consultant.id, {
        daysToAdd: Number(daysToAdd),
        reason: timelineReason.trim() || undefined,
        explicitExpiryDate: customExpiryDate || undefined,
      });
      setFeedback({ type: "success", text: "Subscription timeline adjusted successfully." });
      setTimelineReason("");
      setCustomExpiryDate("");
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to adjust timeline." });
    } finally {
      setAdjustingTimeline(false);
    }
  };

  const handleSaveOverrides = async () => {
    if (!consultant) return;
    setUpdatingOverrides(true);
    setFeedback(null);
    try {
      await adminApi.overrideConsultantQuota(consultant.id, {
        maxProjects: overrideProjects !== "" ? Number(overrideProjects) : null,
        maxClients: overrideClients !== "" ? Number(overrideClients) : null,
      });
      setFeedback({ type: "success", text: "Custom quota overrides saved successfully." });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to save quota overrides." });
    } finally {
      setUpdatingOverrides(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(6px)",
      display: "flex",
      justifyContent: "flex-end",
      zIndex: 1000,
    }}>
      <div style={{
        width: "100%",
        maxWidth: "680px",
        height: "100%",
        backgroundColor: "rgba(2, 14, 9, 0.95)",
        backdropFilter: "blur(28px)",
        borderLeft: "1px solid rgba(77, 255, 160, 0.3)",
        boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.8)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Top Bar */}
        <div style={{
          padding: "16px 22px",
          borderBottom: "1px solid rgba(77, 255, 160, 0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "rgba(6, 22, 15, 0.9)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              backgroundColor: "rgba(77, 255, 160, 0.12)",
              color: "#4dffa0",
              border: "1px solid rgba(77, 255, 160, 0.25)",
              padding: "3px 9px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Agency Account Details
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#89aca0",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#4dffa0" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px auto" }} />
            <div style={{ fontSize: "12px", color: "#89aca0" }}>Loading agency details...</div>
          </div>
        ) : error ? (
          <div style={{ padding: "22px" }}>
            <div style={{
              backgroundColor: "rgba(255, 107, 107, 0.12)",
              border: "1px solid rgba(255, 107, 107, 0.25)",
              color: "#ff6b6b",
              padding: "14px",
              borderRadius: "8px",
              fontSize: "12px",
            }}>
              {error}
            </div>
          </div>
        ) : consultant ? (
          <div style={{ padding: "18px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Feedback alert */}
            {feedback ? (
              <div style={{
                backgroundColor: feedback.type === "success" ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 107, 107, 0.12)",
                border: `1px solid ${feedback.type === "success" ? "rgba(77, 255, 160, 0.25)" : "rgba(255, 107, 107, 0.25)"}`,
                color: feedback.type === "success" ? "#4dffa0" : "#ff6b6b",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "18px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
                {feedback.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{feedback.text}</span>
              </div>
            ) : null}

            {/* Profile Hero Header */}
            <div style={{
              backgroundColor: "rgba(6, 22, 15, 0.72)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(77, 255, 160, 0.2)",
              borderRadius: "10px",
              padding: "18px",
              marginBottom: "18px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(77, 255, 160, 0.12)",
                    border: "1px solid rgba(77, 255, 160, 0.35)",
                    color: "#4dffa0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 700,
                  }}>
                    {consultant.name?.charAt(0) || "C"}
                  </div>
                  <div>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 2px 0", color: "#f3f8f4" }}>
                      {consultant.name}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#89aca0" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Building size={11} /> {consultant.company || "Independent"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Mail size={11} /> {consultant.email}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Toggle Button */}
                <button
                  onClick={handleToggleStatus}
                  disabled={togglingStatus}
                  style={{
                    backgroundColor: consultant.isActive ? "rgba(255, 107, 107, 0.1)" : "rgba(77, 255, 160, 0.1)",
                    border: `1px solid ${consultant.isActive ? "rgba(255, 107, 107, 0.25)" : "rgba(77, 255, 160, 0.25)"}`,
                    color: consultant.isActive ? "#ff6b6b" : "#4dffa0",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  {consultant.isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                  <span>{consultant.isActive ? "Suspend Account" : "Activate Account"}</span>
                </button>
              </div>

              {/* Badges Ribbon */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "11px" }}>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                  backgroundColor: consultant.isActive ? "rgba(77, 255, 160, 0.1)" : "rgba(255, 107, 107, 0.1)",
                  color: consultant.isActive ? "#4dffa0" : "#ff6b6b",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: consultant.isActive ? "#4dffa0" : "#ff6b6b", display: "inline-block" }} />
                  {consultant.isActive ? "Active Account" : "Suspended"}
                </span>
                <span style={{ color: "#607f72", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={11} /> Joined: {consultant.createdAt ? new Date(consultant.createdAt).toLocaleDateString() : "Recent"}
                </span>
              </div>

              {!consultant.isActive ? (
                <div style={{
                  marginTop: "12px",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(255, 107, 107, 0.08)",
                  border: "1px solid rgba(255, 107, 107, 0.25)",
                  fontSize: "11px",
                  lineHeight: "1.6",
                }}>
                  <div style={{ fontWeight: 700, color: "#ff8e8e", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <AlertCircle size={13} />
                    <span>Suspension Information</span>
                  </div>
                  <div style={{ color: "#d1a5a5" }}>
                    <strong style={{ color: "#e8f5ef" }}>Reason:</strong>{" "}
                    {consultant.suspensionReason === "deadline_breach"
                      ? "Milestone Deadline Breach (Automatic suspension at 96h overdue, following 3 warnings)"
                      : consultant.suspensionReason || "Administrative suspension"}
                  </div>
                  {consultant.suspendedAt ? (
                    <div style={{ color: "#d1a5a5" }}>
                      <strong style={{ color: "#e8f5ef" }}>Suspended At:</strong>{" "}
                      {new Date(consultant.suspendedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  ) : null}
                  {consultant.suspendedDueToProjectId ? (
                    <div style={{ color: "#d1a5a5" }}>
                      <strong style={{ color: "#e8f5ef" }}>Associated Project:</strong>{" "}
                      <span style={{ color: "#4dffa0" }}>
                        {projects.find((p: any) => p.id === consultant.suspendedDueToProjectId)?.title ||
                          projects.find((p: any) => p.id === consultant.suspendedDueToProjectId)?.companyName ||
                          consultant.suspendedDueToProjectId}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
                          {consultant.reactivationRequest && consultant.reactivationRequest.status === "pending" ? (
                <div style={{
                  marginTop: "12px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(240, 180, 41, 0.12)",
                  border: "1px solid rgba(240, 180, 41, 0.45)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  boxShadow: "0 0 16px rgba(240, 180, 41, 0.15)",
                }}>
                  <div style={{ fontWeight: 700, color: "#f0b429", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                    <Bell size={14} />
                    <span>Urgent Reactivation Request Dispatched by Consultant</span>
                  </div>
                  <div style={{
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(240, 180, 41, 0.2)",
                    color: "#fef08a",
                    fontSize: "12px",
                    marginBottom: "8px",
                    fontStyle: "italic",
                  }}>
                    &quot;{consultant.reactivationRequest.message || "Consultant requested account review and reactivation."}&quot;
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                      Requested: {consultant.reactivationRequest.requestedAt ? new Date(consultant.reactivationRequest.requestedAt).toLocaleString() : "Just now"}
                    </span>
                    <button
                      onClick={handleToggleStatus}
                      disabled={togglingStatus}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        backgroundColor: "#4dffa0",
                        color: "#001a0e",
                        border: "none",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: togglingStatus ? "not-allowed" : "pointer",
                      }}
                    >
                      <UserCheck size={13} />
                      <span>Approve &amp; Activate Now</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Quick Stats Ribbon */}
            <div className="admin-stat-ribbon">
              <div style={{ backgroundColor: "rgba(6, 22, 15, 0.6)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(77, 255, 160, 0.12)" }}>
                <div style={{ fontSize: "10px", color: "#607f72", marginBottom: "2px" }}>Projects</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#4a9eff" }}>{stats.totalProjects ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(6, 22, 15, 0.6)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(77, 255, 160, 0.12)" }}>
                <div style={{ fontSize: "10px", color: "#607f72", marginBottom: "2px" }}>Clients</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#f0b429" }}>{stats.totalClients ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(6, 22, 15, 0.6)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(77, 255, 160, 0.12)" }}>
                <div style={{ fontSize: "10px", color: "#607f72", marginBottom: "2px" }}>AI Requests</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#c084fc" }}>{stats.aiTotalRuns ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(6, 22, 15, 0.6)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(77, 255, 160, 0.12)" }}>
                <div style={{ fontSize: "10px", color: "#607f72", marginBottom: "2px" }}>Monthly Rev</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#4dffa0" }}>₹{stats.mrrContribution?.toLocaleString("en-IN") ?? 0}</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="admin-tabs-scroll">
              {[
                { id: "projects", label: `Projects (${projects.length})`, icon: FolderKanban },
                { id: "clients", label: `Clients (${clients.length})`, icon: Users },
                { id: "subscription", label: "Subscription & Quotas", icon: CreditCard },
                { id: "ai", label: "AI Usage", icon: Cpu },
                { id: "settings", label: "Security & Credentials", icon: Key },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: active ? "2px solid #4dffa0" : "2px solid transparent",
                      color: active ? "#4dffa0" : "#89aca0",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon size={13} style={{ color: active ? "#4dffa0" : "#607f72" }} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: PROJECTS LIST */}
            {activeTab === "projects" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {projects.length > 0 ? (
                  projects.map((proj: any) => (
                    <div
                      key={proj.id}
                      style={{
                        backgroundColor: "rgba(6, 22, 15, 0.7)",
                        border: "1px solid rgba(77, 255, 160, 0.12)",
                        borderRadius: "8px",
                        padding: "12px 14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#f3f8f4" }}>
                            {proj.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#607f72" }}>
                            Client: {proj.companyName || "Direct"} {proj.sector ? `• ${proj.sector}` : ""}
                          </div>
                        </div>

                        <span style={{
                          padding: "2px 7px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          backgroundColor: proj.status === "delivered" ? "rgba(77, 255, 160, 0.12)" : "rgba(74, 158, 255, 0.12)",
                          color: proj.status === "delivered" ? "#4dffa0" : "#4a9eff",
                        }}>
                          {proj.status}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#607f72", marginBottom: "3px" }}>
                          <span>Deliverable Progress</span>
                          <span style={{ color: "#4dffa0", fontWeight: 700 }}>{proj.progress}%</span>
                        </div>
                        <div style={{ height: "4px", backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${proj.progress}%`, height: "100%", backgroundColor: "#4dffa0", borderRadius: "2px" }} />
                        </div>
                      </div>

                      {/* Client Portal Token */}
                      {proj.portalToken ? (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "rgba(2, 14, 9, 0.6)",
                          padding: "5px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          color: "#89aca0",
                        }}>
                          <span>Portal Token: <code>{proj.portalToken}</code></span>
                          <button
                            onClick={() => handleCopy(proj.portalToken)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: copiedToken === proj.portalToken ? "#4dffa0" : "#607f72",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {copiedToken === proj.portalToken ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedToken === proj.portalToken ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "28px", color: "#607f72", fontSize: "12px" }}>
                    No projects created by this agency yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CLIENTS LIST */}
            {activeTab === "clients" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {clients.length > 0 ? (
                  clients.map((client: any) => (
                    <div
                      key={client.id}
                      style={{
                        backgroundColor: "rgba(6, 22, 15, 0.7)",
                        border: "1px solid rgba(77, 255, 160, 0.12)",
                        borderRadius: "8px",
                        padding: "12px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#f3f8f4" }}>
                          {client.companyName || client.name || "Client Business"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#607f72", marginTop: "2px" }}>
                          Contact: {client.name} • {client.email}
                        </div>
                        {client.sector ? (
                          <div style={{ fontSize: "10px", color: "#f0b429", marginTop: "2px" }}>
                            Industry: {client.sector}
                          </div>
                        ) : null}
                      </div>

                      <span style={{
                        backgroundColor: "rgba(240, 180, 41, 0.12)",
                        color: "#f0b429",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}>
                        {client.projectsCount} {client.projectsCount === 1 ? "Project" : "Projects"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "28px", color: "#607f72", fontSize: "12px" }}>
                    No end-clients assigned yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB: SUBSCRIPTION & QUOTAS */}
            {activeTab === "subscription" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* 1. Status & Quota Gauges */}
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "16px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#607f72", textTransform: "uppercase", letterSpacing: "0.06em" }}>Active Subscription</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", textTransform: "capitalize", marginTop: "2px" }}>
                        {consultant.subscription?.plan || "Free"} Plan • {consultant.subscription?.billingCycle || "Monthly"}
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: consultant.subscription?.status === "active" ? "rgba(77, 255, 160, 0.15)" : "rgba(255, 107, 107, 0.15)",
                      color: consultant.subscription?.status === "active" ? "#4dffa0" : "#ff6b6b",
                      border: `1px solid ${consultant.subscription?.status === "active" ? "rgba(77, 255, 160, 0.3)" : "rgba(255, 107, 107, 0.3)"}`,
                      textTransform: "capitalize",
                    }}>
                      {consultant.subscription?.status || "Active"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px", fontSize: "12px" }}>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <div style={{ color: "#607f72", fontSize: "10px", marginBottom: "2px" }}>Period End / Renewal Date</div>
                      <div style={{ color: "#e8f5ef", fontWeight: 600 }}>
                        {consultant.subscription?.currentPeriodEnd ? new Date(consultant.subscription.currentPeriodEnd).toLocaleDateString() : "Rolling Monthly"}
                      </div>
                    </div>
                    <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <div style={{ color: "#607f72", fontSize: "10px", marginBottom: "2px" }}>Grace Period Buffer</div>
                      <div style={{ color: "#f0b429", fontWeight: 600 }}>
                        {consultant.subscription?.gracePeriodEnd ? new Date(consultant.subscription.gracePeriodEnd).toLocaleDateString() : "+5 days after expiry"}
                      </div>
                    </div>
                  </div>

                  {/* Quota Progress Bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                        <span style={{ color: "#89aca0" }}>Project Capacity</span>
                        <span style={{ color: "#e8f5ef", fontWeight: 600 }}>
                          {projects.length} / {consultant.subscription?.maxProjects === -1 ? "Unlimited" : (consultant.subscription?.maxProjects ?? 5)} used
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255, 255, 255, 0.06)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          width: consultant.subscription?.maxProjects === -1 ? "10%" : `${Math.min(100, (projects.length / (consultant.subscription?.maxProjects || 5)) * 100)}%`,
                          height: "100%",
                          backgroundColor: "#4dffa0",
                          borderRadius: "3px",
                        }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                        <span style={{ color: "#89aca0" }}>Client Onboarding Capacity</span>
                        <span style={{ color: "#e8f5ef", fontWeight: 600 }}>
                          {clients.length} / {consultant.subscription?.maxClients === -1 ? "Unlimited" : (consultant.subscription?.maxClients ?? 10)} used
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255, 255, 255, 0.06)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          width: consultant.subscription?.maxClients === -1 ? "10%" : `${Math.min(100, (clients.length / (consultant.subscription?.maxClients || 10)) * 100)}%`,
                          height: "100%",
                          backgroundColor: "#60a5fa",
                          borderRadius: "3px",
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Change Plan Tier */}
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "16px",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <CreditCard size={14} color="#4dffa0" />
                    <span>Change Subscription Plan</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>Select Tier</label>
                      <select
                        value={selectedPlanSlug}
                        onChange={(e) => setSelectedPlanSlug(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      >
                        {plansList.length > 0 ? (
                          plansList.map((p) => (
                            <option key={p.slug} value={p.slug} style={{ backgroundColor: "#08130e" }}>
                              {p.name} ({p.slug})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="free" style={{ backgroundColor: "#08130e" }}>Free Starter</option>
                            <option value="starter" style={{ backgroundColor: "#08130e" }}>Studio Starter</option>
                            <option value="pro" style={{ backgroundColor: "#08130e" }}>Agency Pro</option>
                            <option value="enterprise" style={{ backgroundColor: "#08130e" }}>Enterprise Scale</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>Billing Cycle</label>
                      <select
                        value={selectedCycle}
                        onChange={(e) => setSelectedCycle(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      >
                        <option value="monthly" style={{ backgroundColor: "#08130e" }}>Monthly</option>
                        <option value="semi_annual" style={{ backgroundColor: "#08130e" }}>6 Months (Semi-Annual)</option>
                        <option value="yearly" style={{ backgroundColor: "#08130e" }}>Yearly (Annual)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleSavePlan}
                      disabled={updatingPlan}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "6px",
                        backgroundColor: "#4dffa0",
                        border: "none",
                        color: "#020806",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {updatingPlan ? "Saving..." : "Apply Plan"}
                    </button>
                  </div>
                </div>

                {/* 3. Timeline Adjustment & Expiry Controls */}
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "16px",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Clock size={14} color="#f0b429" />
                    <span>Timeline Adjustment & Expiry Extension</span>
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    {[7, 15, 30, 90, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDaysToAdd(d);
                          setCustomExpiryDate("");
                        }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "4px",
                          border: daysToAdd === d && !customExpiryDate ? "1px solid #4dffa0" : "1px solid rgba(255, 255, 255, 0.1)",
                          backgroundColor: daysToAdd === d && !customExpiryDate ? "rgba(77, 255, 160, 0.15)" : "transparent",
                          color: daysToAdd === d && !customExpiryDate ? "#4dffa0" : "#89aca0",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        +{d} Days
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                        Or Set Explicit Expiry Date
                      </label>
                      <input
                        type="date"
                        value={customExpiryDate}
                        onChange={(e) => setCustomExpiryDate(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                        Reason for Extension
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. VIP client promo, offline check"
                        value={timelineReason}
                        onChange={(e) => setTimelineReason(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAdjustTimeline}
                    disabled={adjustingTimeline}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      backgroundColor: "#f0b429",
                      border: "none",
                      color: "#001a0e",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {adjustingTimeline ? "Adjusting..." : "Apply Timeline Adjustment"}
                  </button>
                </div>

                {/* 4. Custom Quota Overrides */}
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "16px",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldCheck size={14} color="#60a5fa" />
                    <span>Custom Quota Overrides (One-Off Boost)</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "flex-end" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                        Override Max Projects (Empty = Plan Default)
                      </label>
                      <input
                        type="number"
                        placeholder="Default"
                        value={overrideProjects}
                        onChange={(e) => setOverrideProjects(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                        Override Max Clients (Empty = Plan Default)
                      </label>
                      <input
                        type="number"
                        placeholder="Default"
                        value={overrideClients}
                        onChange={(e) => setOverrideClients(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      />
                    </div>

                    <button
                      onClick={handleSaveOverrides}
                      disabled={updatingOverrides}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "6px",
                        backgroundColor: "#60a5fa",
                        border: "none",
                        color: "#001a0e",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {updatingOverrides ? "Saving..." : "Save Overrides"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div>
                <div style={{
                  backgroundColor: "rgba(74, 158, 255, 0.08)",
                  border: "1px solid rgba(74, 158, 255, 0.2)",
                  borderRadius: "8px",
                  padding: "14px",
                  marginBottom: "16px",
                }}>
                  <div style={{ fontSize: "11px", color: "#89aca0", marginBottom: "2px" }}>
                    Total AI Tool Runs
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#4a9eff" }}>
                    {stats.aiTotalRuns ?? 0} runs
                  </div>
                  <div style={{ fontSize: "10px", color: "#607f72", marginTop: "2px" }}>
                    Bonus Credits Allowance: {stats.aiBonusCredits ?? 0} extra runs
                  </div>
                </div>

                <div style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px", textTransform: "uppercase" }}>
                  Tool Breakdown
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px" }}>
                  {[
                    { key: "proposal-generator", name: "AI Proposal Generator" },
                    { key: "enhance-brand-dna", name: "Brand DNA Engine" },
                    { key: "moodboard-directions", name: "Moodboard Directions" },
                  ].map((tool) => {
                    const count = consultant.aiUsage?.toolRuns?.[tool.key] || 0;
                    return (
                      <div
                        key={tool.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "rgba(6, 22, 15, 0.6)",
                          border: "1px solid rgba(77, 255, 160, 0.1)",
                          borderRadius: "6px",
                          padding: "9px 12px",
                        }}
                      >
                        <span style={{ fontSize: "12px", color: "#89aca0" }}>{tool.name}</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#4dffa0" }}>{count} runs</span>
                      </div>
                    );
                  })}
                </div>

                {/* Quota Management Actions */}
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "14px",
                }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#f3f8f4", marginBottom: "10px", textTransform: "uppercase" }}>
                    Quota Actions
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setQuotaAction("reset")}
                      style={{
                        flex: 1,
                        padding: "7px",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: quotaAction === "reset" ? "rgba(77, 255, 160, 0.15)" : "rgba(255, 255, 255, 0.04)",
                        border: quotaAction === "reset" ? "1px solid #4dffa0" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: quotaAction === "reset" ? "#4dffa0" : "#607f72",
                      }}
                    >
                      Reset Tool Runs
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotaAction("add-credits")}
                      style={{
                        flex: 1,
                        padding: "7px",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: quotaAction === "add-credits" ? "rgba(74, 158, 255, 0.15)" : "rgba(255, 255, 255, 0.04)",
                        border: quotaAction === "add-credits" ? "1px solid #4a9eff" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: quotaAction === "add-credits" ? "#4a9eff" : "#607f72",
                      }}
                    >
                      Grant Bonus Credits
                    </button>
                  </div>

                  {quotaAction === "add-credits" ? (
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "10px", color: "#607f72", marginBottom: "3px" }}>
                        Bonus Runs Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={bonusCredits}
                        onChange={(e) => setBonusCredits(Math.max(1, parseInt(e.target.value) || 0))}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          backgroundColor: "rgba(2, 14, 9, 0.7)",
                          border: "1px solid rgba(77, 255, 160, 0.2)",
                          borderRadius: "5px",
                          color: "#e8f5ef",
                          fontSize: "12px",
                          outline: "none",
                        }}
                      />
                    </div>
                  ) : null}

                  <button
                    onClick={handleUpdateQuota}
                    disabled={updatingQuota}
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "#4dffa0",
                      border: "none",
                      borderRadius: "5px",
                      color: "#001a0e",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {updatingQuota ? "Saving..." : "Apply Quota Update"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: SECURITY & CREDENTIALS CONTROLS */}
            {activeTab === "settings" && (
              <div style={{
                backgroundColor: "rgba(6, 22, 15, 0.7)",
                border: "1px solid rgba(77, 255, 160, 0.15)",
                borderRadius: "8px",
                padding: "16px",
                marginTop: "16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Key size={15} color="#4dffa0" />
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#f3f8f4", textTransform: "uppercase" }}>
                    Credential Reset & Recovery
                  </div>
                </div>
                <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "#89aca0" }}>
                  Assign a new password for <strong>{consultant?.name}</strong>. They will be able to log in immediately with the new credentials.
                </p>

                {resetSuccessData ? (
                  <div style={{
                    backgroundColor: "rgba(77, 255, 160, 0.08)",
                    border: "1px solid rgba(77, 255, 160, 0.35)",
                    borderRadius: "6px",
                    padding: "12px 14px",
                    marginBottom: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}>
                    <div style={{ fontSize: "12px", color: "#e8f5ef" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span><strong>Account:</strong> {resetSuccessData.email}</span>
                        {resetSuccessData.emailDispatched ? (
                          <span style={{
                            fontSize: "10px",
                            backgroundColor: "rgba(77, 255, 160, 0.15)",
                            border: "1px solid rgba(77, 255, 160, 0.3)",
                            color: "#4dffa0",
                            padding: "1px 6px",
                            borderRadius: "10px",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}>
                            <Mail size={10} />
                            <span>Notification Emailed</span>
                          </span>
                        ) : null}
                      </div>
                      <div><strong>New Password:</strong> <code style={{ backgroundColor: "rgba(0,0,0,0.4)", padding: "1px 5px", borderRadius: "3px", color: "#4dffa0" }}>{resetSuccessData.pass}</code></div>
                    </div>
                    <button
                      type="button"
                      onClick={copyResetCredentials}
                      style={{
                        backgroundColor: copiedResetPass ? "#4dffa0" : "rgba(77, 255, 160, 0.15)",
                        border: "1px solid rgba(77, 255, 160, 0.3)",
                        color: copiedResetPass ? "#001a0e" : "#4dffa0",
                        padding: "6px 12px",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexShrink: 0,
                      }}
                    >
                      <Copy size={12} />
                      <span>{copiedResetPass ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                ) : null}

                <form onSubmit={handleResetPassword}>
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ fontSize: "11px", color: "#89aca0", fontWeight: 600 }}>
                        New Password (min 8 chars)
                      </label>
                      <button
                        type="button"
                        onClick={generateResetPassword}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4dffa0",
                          fontSize: "11px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: 0,
                        }}
                      >
                        <Key size={11} />
                        <span>Auto Generate</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Enter or generate new password"
                      value={resetPasswordInput}
                      onChange={(e) => setResetPasswordInput(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        backgroundColor: "rgba(2, 14, 9, 0.7)",
                        border: "1px solid rgba(77, 255, 160, 0.18)",
                        borderRadius: "5px",
                        color: "#e8f5ef",
                        fontSize: "12px",
                        fontFamily: "monospace",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resettingPassword}
                    style={{
                      width: "100%",
                      padding: "9px",
                      backgroundColor: "rgba(77, 255, 160, 0.15)",
                      border: "1px solid rgba(77, 255, 160, 0.3)",
                      borderRadius: "5px",
                      color: "#4dffa0",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: resettingPassword ? "not-allowed" : "pointer",
                      opacity: resettingPassword ? 0.7 : 1,
                    }}
                  >
                    {resettingPassword ? "Updating Password..." : "Set New Password"}
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
