"use client";

import { useEffect, useState } from "react";
import {
  X,
  Building,
  Mail,
  Phone,
  Calendar,
  FolderKanban,
  Users,
  Cpu,
  ShieldCheck,
  UserCheck,
  UserX,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Sliders,
  DollarSign,
  AlertCircle,
  CheckCircle2,
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
  const [activeTab, setActiveTab] = useState<"projects" | "clients" | "ai" | "settings">("projects");

  // Plan Controls State
  const [plan, setPlan] = useState("starter");
  const [maxProjects, setMaxProjects] = useState(10);
  const [savingPlan, setSavingPlan] = useState(false);

  // Status Toggle State
  const [togglingStatus, setTogglingStatus] = useState(false);

  // AI Quota State
  const [quotaAction, setQuotaAction] = useState<"reset" | "set-credits">("reset");
  const [bonusCredits, setBonusCredits] = useState<number>(25);
  const [updatingQuota, setUpdatingQuota] = useState(false);

  // UI Feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDetails = async () => {
    if (!consultantId) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getConsultantDetails(consultantId);
      if (res?.success && res.data) {
        setData(res.data);
        const sub = res.data.consultant?.subscription;
        if (sub?.plan) setPlan(sub.plan);
        if (sub?.maxProjects !== undefined) setMaxProjects(sub.maxProjects);
      } else {
        setError("Failed to load consultant details.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load consultant 360 profile.");
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

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultant) return;
    setSavingPlan(true);
    setFeedback(null);
    try {
      await adminApi.updateConsultantPlan(consultant.id, plan, maxProjects);
      setFeedback({ type: "success", text: "Subscription tier updated successfully." });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to update plan." });
    } finally {
      setSavingPlan(false);
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
        quotaAction === "set-credits" ? bonusCredits : undefined
      );
      setFeedback({
        type: "success",
        text: quotaAction === "reset" ? "Tool runs reset to zero." : `Granted ${bonusCredits} bonus AI credits.`,
      });
      await fetchDetails();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Failed to update AI quota." });
    } finally {
      setUpdatingQuota(false);
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
        backgroundColor: "#08130e",
        borderLeft: "1px solid rgba(16, 185, 129, 0.3)",
        boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.8)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Top Bar */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "rgba(13, 27, 20, 0.8)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              Consultant 360° Operations Hub
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.6)",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#34d399" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px auto" }} />
            <div>Loading 360° Agency Intelligence...</div>
          </div>
        ) : error ? (
          <div style={{ padding: "24px" }}>
            <div style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              padding: "16px",
              borderRadius: "10px",
              fontSize: "13px",
            }}>
              {error}
            </div>
          </div>
        ) : consultant ? (
          <div style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Feedback alert */}
            {feedback ? (
              <div style={{
                backgroundColor: feedback.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${feedback.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                color: feedback.type === "success" ? "#34d399" : "#fca5a5",
                padding: "12px 16px",
                borderRadius: "10px",
                marginBottom: "20px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
                {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{feedback.text}</span>
              </div>
            ) : null}

            {/* Profile Hero Header */}
            <div style={{
              backgroundColor: "rgba(13, 27, 20, 0.6)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "14px",
              padding: "20px",
              marginBottom: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{
                    width: "50px",
                    height: "50px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#34d399",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    fontWeight: 800,
                  }}>
                    {consultant.name?.charAt(0) || "C"}
                  </div>
                  <div>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 4px 0", color: "#fff" }}>
                      {consultant.name}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Building size={12} /> {consultant.company || "Independent"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Mail size={12} /> {consultant.email}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Toggle Button */}
                <button
                  onClick={handleToggleStatus}
                  disabled={togglingStatus}
                  style={{
                    backgroundColor: consultant.isActive ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                    border: `1px solid ${consultant.isActive ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                    color: consultant.isActive ? "#f87171" : "#34d399",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {consultant.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                  <span>{consultant.isActive ? "Suspend Account" : "Activate Account"}</span>
                </button>
              </div>

              {/* Badges Ribbon */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "11px" }}>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  backgroundColor: consultant.subscription?.plan === "enterprise" ? "rgba(245, 158, 11, 0.15)" : consultant.subscription?.plan === "pro" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.1)",
                  color: consultant.subscription?.plan === "enterprise" ? "#fbbf24" : consultant.subscription?.plan === "pro" ? "#34d399" : "#cbd5e1",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}>
                  Tier: {consultant.subscription?.plan || "free"}
                </span>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  backgroundColor: consultant.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: consultant.isActive ? "#34d399" : "#fca5a5",
                }}>
                  ● {consultant.isActive ? "Active License" : "Suspended"}
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.4)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={12} /> Joined: {consultant.createdAt ? new Date(consultant.createdAt).toLocaleDateString() : "Recent"}
                </span>
              </div>
            </div>

            {/* Quick Stats Ribbon */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "10px",
              marginBottom: "20px",
            }}>
              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>Projects</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#60a5fa" }}>{stats.totalProjects ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>Clients</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#fbbf24" }}>{stats.totalClients ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>AI Runs</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#38bdf8" }}>{stats.aiTotalRuns ?? 0}</div>
              </div>
              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>MRR Value</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>${stats.mrrContribution ?? 0}/mo</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              marginBottom: "20px",
              gap: "4px",
            }}>
              {[
                { id: "projects", label: `Projects (${projects.length})`, icon: FolderKanban },
                { id: "clients", label: `Clients (${clients.length})`, icon: Users },
                { id: "ai", label: "AI Usage", icon: Cpu },
                { id: "settings", label: "Plan & Quota", icon: Sliders },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: active ? "2px solid #10b981" : "2px solid transparent",
                      color: active ? "#34d399" : "rgba(255, 255, 255, 0.6)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: PROJECTS LIST */}
            {activeTab === "projects" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {projects.length > 0 ? (
                  projects.map((proj: any) => (
                    <div
                      key={proj.id}
                      style={{
                        backgroundColor: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "14px 16px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                            {proj.title}
                          </div>
                          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                            Client: {proj.companyName || "Unnamed"} {proj.sector ? `• ${proj.sector}` : ""}
                          </div>
                        </div>

                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          backgroundColor: proj.status === "delivered" ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.15)",
                          color: proj.status === "delivered" ? "#34d399" : "#60a5fa",
                        }}>
                          {proj.status}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ marginBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>
                          <span>Deliverable Progress</span>
                          <span>{proj.progress}%</span>
                        </div>
                        <div style={{ height: "4px", backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${proj.progress}%`, height: "100%", backgroundColor: "#10b981", borderRadius: "2px" }} />
                        </div>
                      </div>

                      {/* Client Portal Token */}
                      {proj.portalToken ? (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "rgba(0, 0, 0, 0.4)",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          color: "rgba(255, 255, 255, 0.6)",
                        }}>
                          <span>Portal Token: <code>{proj.portalToken}</code></span>
                          <button
                            onClick={() => handleCopy(proj.portalToken)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: copiedToken === proj.portalToken ? "#34d399" : "rgba(255, 255, 255, 0.5)",
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
                  <div style={{ textAlign: "center", padding: "32px", color: "rgba(255, 255, 255, 0.4)", fontSize: "13px" }}>
                    No projects created by this agency yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CLIENTS LIST */}
            {activeTab === "clients" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {clients.length > 0 ? (
                  clients.map((client: any) => (
                    <div
                      key={client.id}
                      style={{
                        backgroundColor: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                          {client.companyName || client.name || "Client Business"}
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)", marginTop: "2px" }}>
                          Contact: {client.name} • {client.email}
                        </div>
                        {client.sector ? (
                          <div style={{ fontSize: "11px", color: "#fbbf24", marginTop: "2px" }}>
                            Industry Sector: {client.sector}
                          </div>
                        ) : null}
                      </div>

                      <span style={{
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        color: "#fbbf24",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}>
                        {client.projectsCount} {client.projectsCount === 1 ? "Project" : "Projects"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "32px", color: "rgba(255, 255, 255, 0.4)", fontSize: "13px" }}>
                    No end-clients assigned yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AI & TOKEN CONSUMPTION */}
            {activeTab === "ai" && (
              <div>
                <div style={{
                  backgroundColor: "rgba(14, 165, 233, 0.1)",
                  border: "1px solid rgba(14, 165, 233, 0.25)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                }}>
                  <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                    Total AI Suite Generations Run
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#38bdf8" }}>
                    {stats.aiTotalRuns ?? 0} runs
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
                    Bonus Credits Allowance: {stats.aiBonusCredits ?? 0} extra runs
                  </div>
                </div>

                <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>
                  Tool-by-Tool Consumption
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
                  {[
                    { key: "proposal-generator", name: "AI Proposal Generator" },
                    { key: "enhance-brand-dna", name: "AI Brand DNA Enhancer" },
                    { key: "moodboard-directions", name: "AI Moodboard Directions" },
                  ].map((tool) => {
                    const count = consultant.aiUsage?.toolRuns?.[tool.key] || 0;
                    return (
                      <div
                        key={tool.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: "rgba(0, 0, 0, 0.3)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: "8px",
                          padding: "12px 14px",
                        }}
                      >
                        <span style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.8)" }}>{tool.name}</span>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8" }}>{count} runs</span>
                      </div>
                    );
                  })}
                </div>

                {/* Quota Management Actions */}
                <div style={{
                  backgroundColor: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "18px",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>
                    Quick AI Quota Actions
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                    <button
                      type="button"
                      onClick={() => setQuotaAction("reset")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: quotaAction === "reset" ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.05)",
                        border: quotaAction === "reset" ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.1)",
                        color: quotaAction === "reset" ? "#34d399" : "rgba(255, 255, 255, 0.6)",
                      }}
                    >
                      Reset Tool Runs
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuotaAction("set-credits")}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: quotaAction === "set-credits" ? "rgba(14, 165, 233, 0.25)" : "rgba(255, 255, 255, 0.05)",
                        border: quotaAction === "set-credits" ? "1px solid #0ea5e9" : "1px solid rgba(255, 255, 255, 0.1)",
                        color: quotaAction === "set-credits" ? "#38bdf8" : "rgba(255, 255, 255, 0.6)",
                      }}
                    >
                      Grant Bonus Credits
                    </button>
                  </div>

                  {quotaAction === "set-credits" ? (
                    <div style={{ marginBottom: "14px" }}>
                      <label style={{ display: "block", fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "4px" }}>
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
                          padding: "8px 12px",
                          backgroundColor: "rgba(0, 0, 0, 0.5)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          borderRadius: "6px",
                          color: "#fff",
                          fontSize: "13px",
                        }}
                      />
                    </div>
                  ) : null}

                  <button
                    onClick={handleUpdateQuota}
                    disabled={updatingQuota}
                    style={{
                      width: "100%",
                      padding: "9px",
                      backgroundColor: "#10b981",
                      border: "none",
                      borderRadius: "6px",
                      color: "#032014",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {updatingQuota ? "Applying..." : "Apply AI Quota Update"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: PLAN & LICENSING CONTROLS */}
            {activeTab === "settings" && (
              <form onSubmit={handleSavePlan}>
                <div style={{
                  backgroundColor: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "20px",
                }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "16px" }}>
                    Subscription Plan & Project Limits
                  </div>

                  {/* Plan Selector */}
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "rgba(255, 255, 255, 0.7)", marginBottom: "8px", fontWeight: 600 }}>
                      Subscription Plan
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      {[
                        { id: "free", label: "Free Trial ($0)", max: 5 },
                        { id: "starter", label: "Starter ($29/mo)", max: 10 },
                        { id: "pro", label: "Pro ($79/mo)", max: 30 },
                        { id: "enterprise", label: "Enterprise ($199/mo)", max: 999 },
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setPlan(item.id);
                            setMaxProjects(item.max);
                          }}
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            backgroundColor: plan === item.id ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.04)",
                            border: plan === item.id ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "13px", fontWeight: 600, color: plan === item.id ? "#34d399" : "#fff" }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", marginTop: "2px" }}>
                            Max {item.max} projects
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Max Projects input */}
                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "rgba(255, 255, 255, 0.7)", marginBottom: "6px", fontWeight: 600 }}>
                      Max Projects Allowance
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={maxProjects}
                      onChange={(e) => setMaxProjects(Math.max(1, parseInt(e.target.value) || 0))}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPlan}
                    style={{
                      width: "100%",
                      padding: "12px",
                      backgroundColor: "#10b981",
                      border: "none",
                      borderRadius: "8px",
                      color: "#032014",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {savingPlan ? "Saving Plan Changes..." : "Save Subscription Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
