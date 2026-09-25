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
        text: quotaAction === "reset" ? "Tool runs reset to zero." : `Granted ${bonusCredits} bonus runs.`,
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
          <div style={{ padding: "22px", flex: 1, display: "flex", flexDirection: "column" }}>
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
                  fontWeight: 700,
                  textTransform: "uppercase",
                  backgroundColor: consultant.subscription?.plan === "enterprise" ? "rgba(240, 180, 41, 0.12)" : consultant.subscription?.plan === "pro" ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 255, 255, 0.08)",
                  color: consultant.subscription?.plan === "enterprise" ? "#f0b429" : consultant.subscription?.plan === "pro" ? "#4dffa0" : "#89aca0",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}>
                  Tier: {consultant.subscription?.plan || "free"}
                </span>
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
            </div>

            {/* Quick Stats Ribbon */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              marginBottom: "18px",
            }}>
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
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#4dffa0" }}>${stats.mrrContribution ?? 0}</div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid rgba(77, 255, 160, 0.15)",
              marginBottom: "18px",
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

            {/* TAB 3: AI USAGE */}
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
                      onClick={() => setQuotaAction("set-credits")}
                      style={{
                        flex: 1,
                        padding: "7px",
                        borderRadius: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        backgroundColor: quotaAction === "set-credits" ? "rgba(74, 158, 255, 0.15)" : "rgba(255, 255, 255, 0.04)",
                        border: quotaAction === "set-credits" ? "1px solid #4a9eff" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: quotaAction === "set-credits" ? "#4a9eff" : "#607f72",
                      }}
                    >
                      Grant Bonus Credits
                    </button>
                  </div>

                  {quotaAction === "set-credits" ? (
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

            {/* TAB 4: PLAN & LICENSING CONTROLS */}
            {activeTab === "settings" && (
              <form onSubmit={handleSavePlan}>
                <div style={{
                  backgroundColor: "rgba(6, 22, 15, 0.7)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  borderRadius: "8px",
                  padding: "16px",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#f3f8f4", marginBottom: "14px", textTransform: "uppercase" }}>
                    Subscription Plan & Project Limits
                  </div>

                  {/* Plan Selector */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "6px", fontWeight: 600 }}>
                      Subscription Plan
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
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
                            padding: "8px 10px",
                            borderRadius: "5px",
                            backgroundColor: plan === item.id ? "rgba(77, 255, 160, 0.12)" : "rgba(255, 255, 255, 0.03)",
                            border: plan === item.id ? "1px solid #4dffa0" : "1px solid rgba(255, 255, 255, 0.08)",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 600, color: plan === item.id ? "#4dffa0" : "#f3f8f4" }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: "10px", color: "#607f72", marginTop: "1px" }}>
                            Max {item.max} projects
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Max Projects input */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
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
                        padding: "8px 10px",
                        backgroundColor: "rgba(2, 14, 9, 0.7)",
                        border: "1px solid rgba(77, 255, 160, 0.18)",
                        borderRadius: "5px",
                        color: "#e8f5ef",
                        fontSize: "12px",
                        outline: "none",
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPlan}
                    style={{
                      width: "100%",
                      padding: "9px",
                      backgroundColor: "#4dffa0",
                      border: "none",
                      borderRadius: "5px",
                      color: "#001a0e",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {savingPlan ? "Saving..." : "Save Subscription Changes"}
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
