"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FolderKanban,
  Building,
  UserCheck,
  UserX,
  Sparkles,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Bot,
  Zap,
  Cpu,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  X,
} from "lucide-react";
import { adminApi } from "../services/api";

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI Quota Modal State
  const [selectedConsumer, setSelectedConsumer] = useState<any>(null);
  const [quotaAction, setQuotaAction] = useState<"reset" | "set-credits">("reset");
  const [bonusCredits, setBonusCredits] = useState<number>(25);
  const [updatingQuota, setUpdatingQuota] = useState(false);
  const [quotaSuccess, setQuotaSuccess] = useState("");

  const fetchMetrics = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getMetrics();
      if (res?.success && res.metrics) {
        setMetrics(res.metrics);
      } else {
        setError("Failed to load metrics from server.");
      }
    } catch (err: any) {
      setError(err?.message || "Error connecting to SuperAdmin API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const handleUpdateQuota = async () => {
    if (!selectedConsumer) return;
    setUpdatingQuota(true);
    setQuotaSuccess("");
    try {
      await adminApi.updateConsultantAiQuota(
        selectedConsumer.id,
        quotaAction,
        quotaAction === "set-credits" ? bonusCredits : undefined
      );
      setQuotaSuccess(
        quotaAction === "reset"
          ? `Reset AI usage counter for ${selectedConsumer.name}`
          : `Granted ${bonusCredits} bonus AI credits to ${selectedConsumer.name}`
      );
      await fetchMetrics();
      setTimeout(() => {
        setSelectedConsumer(null);
        setQuotaSuccess("");
      }, 1500);
    } catch (err: any) {
      alert(err?.message || "Failed to update AI quota.");
    } finally {
      setUpdatingQuota(false);
    }
  };

  const revenue = metrics?.revenue || {};
  const aiUsage = metrics?.aiUsage || {};

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
              Platform Executive Overview
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
              Phase 1 Active • Market Launch Ready
            </span>
          </div>
          <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.6)", fontSize: "14px" }}>
            Commercial Revenue Intelligence • AI Token & Infrastructure Margins • Cross-Agency Operations
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#34d399",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {error ? (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#fca5a5",
          padding: "14px 18px",
          borderRadius: "10px",
          marginBottom: "24px",
          fontSize: "14px",
        }}>
          {error}
        </div>
      ) : null}

      {/* PILLAR 1: FINANCIAL & REVENUE INTELLIGENCE HERO SECTION */}
      <div style={{
        background: "linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, rgba(13, 27, 20, 0.8) 100%)",
        border: "1px solid rgba(16, 185, 129, 0.35)",
        borderRadius: "16px",
        padding: "24px 28px",
        marginBottom: "32px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              backgroundColor: "rgba(16, 185, 129, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#34d399"
            }}>
              <DollarSign size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                Commercial Revenue & Subscription Intelligence
              </h2>
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                Live MRR calculation from active B2B Agency subscriptions
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#34d399" }}>
            <TrendingUp size={15} />
            <span style={{ fontWeight: 600 }}>Active Monetization Engine</span>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "18px",
        }}>
          {/* MRR */}
          <div style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            borderRadius: "12px",
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#34d399", textTransform: "uppercase", marginBottom: "6px" }}>
              Monthly Recurring (MRR)
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              ${loading ? "..." : (revenue.mrr ?? 0)}
              <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255, 255, 255, 0.5)", marginLeft: "4px" }}>/mo</span>
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
              From {revenue.paidConsultants ?? 0} active paid subscriptions
            </div>
          </div>

          {/* ARR */}
          <div style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#60a5fa", textTransform: "uppercase", marginBottom: "6px" }}>
              Annual Run-Rate (ARR)
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              ${loading ? "..." : (revenue.arr?.toLocaleString() ?? 0)}
              <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255, 255, 255, 0.5)", marginLeft: "4px" }}>/yr</span>
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
              Projected 12-month recurring gross
            </div>
          </div>

          {/* Conversion Rate */}
          <div style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#fbbf24", textTransform: "uppercase", marginBottom: "6px" }}>
              Paid Conversion Rate
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              {loading ? "..." : `${revenue.conversionRate ?? 0}%`}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
              {revenue.paidConsultants ?? 0} Paid • {revenue.freeConsultants ?? 0} Free Trial
            </div>
          </div>

          {/* ARPU */}
          <div style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#c084fc", textTransform: "uppercase", marginBottom: "6px" }}>
              Average Revenue / User (ARPU)
            </div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              ${loading ? "..." : (revenue.arpu ?? 0)}
              <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255, 255, 255, 0.5)", marginLeft: "4px" }}>/mo</span>
            </div>
            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
              Blended average across all customer accounts
            </div>
          </div>
        </div>
      </div>

      {/* CORE PLATFORM OPERATIONS COUNTERS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "20px",
        marginBottom: "36px",
      }}>
        {/* Total Consultants */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "14px",
          padding: "22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase" }}>
              Agencies & Consultants
            </span>
            <div style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#34d399",
            }}>
              <Users size={17} />
            </div>
          </div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
            {loading ? "..." : (metrics?.totalConsultants ?? 0)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
            <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <UserCheck size={13} /> {metrics?.activeConsultants ?? 0} Active
            </span>
            <span style={{ color: "#f87171", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <UserX size={13} /> {metrics?.suspendedConsultants ?? 0} Suspended
            </span>
          </div>
        </div>

        {/* Platform Projects */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "14px",
          padding: "22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase" }}>
              Platform Projects
            </span>
            <div style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#60a5fa",
            }}>
              <FolderKanban size={17} />
            </div>
          </div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
            {loading ? "..." : (metrics?.totalProjects ?? 0)}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
            Active branding deliverables across all consultants
          </div>
        </div>

        {/* End Clients */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          borderRadius: "14px",
          padding: "22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase" }}>
              End-Clients Connected
            </span>
            <div style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fbbf24",
            }}>
              <Building size={17} />
            </div>
          </div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
            {loading ? "..." : (metrics?.totalClients ?? 0)}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
            Unique client businesses using portals
          </div>
        </div>

        {/* Paid Tiers */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(168, 85, 247, 0.2)",
          borderRadius: "14px",
          padding: "22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", textTransform: "uppercase" }}>
              Paid Licenses
            </span>
            <div style={{
              width: "34px",
              height: "34px",
              borderRadius: "8px",
              backgroundColor: "rgba(168, 85, 247, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c084fc",
            }}>
              <Sparkles size={17} />
            </div>
          </div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
            {loading ? "..." : (revenue.paidConsultants ?? 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#34d399" }}>
            {metrics?.planDistribution?.enterprise || 0} Enterprise • {metrics?.planDistribution?.pro || 0} Pro • {metrics?.planDistribution?.starter || 0} Starter
          </div>
        </div>
      </div>

      {/* PILLAR 2: AI INFRASTRUCTURE, COST DEFENSE & REVENUE BREAKDOWN */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "24px", marginBottom: "36px" }}>
        {/* Module B: AI Infrastructure & Token Burn Defense */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(14, 165, 233, 0.3)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(14, 165, 233, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
              }}>
                <Cpu size={19} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                  AI Cost & Token Consumption Hub
                </h2>
                <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                  Monitor platform-wide LLM requests and safeguard API margins
                </span>
              </div>
            </div>
            <span style={{
              backgroundColor: "rgba(14, 165, 233, 0.15)",
              color: "#38bdf8",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
            }}>
              Est. Spend: ${aiUsage.estimatedApiCost ?? 0}
            </span>
          </div>

          {/* AI Quick Counters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <div style={{
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px",
            }}>
              <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                Total AI Tool Runs Executed
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#38bdf8" }}>
                {loading ? "..." : (aiUsage.totalRuns ?? 0)}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", marginTop: "2px" }}>
                Across proposals, moodboards & brand DNA
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px",
            }}>
              <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "4px" }}>
                Proposal Generator Runs
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#34d399" }}>
                {loading ? "..." : (aiUsage.toolBreakdown?.["proposal-generator"] ?? 0)}
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", marginTop: "2px" }}>
                Most consumed AI agency workflow
              </div>
            </div>
          </div>

          {/* Top Consumers Table */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc", marginBottom: "10px" }}>
              Top AI Power Consumers (Agencies)
            </div>
            {aiUsage.topConsumers && aiUsage.topConsumers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {aiUsage.topConsumers.map((consumer: any) => (
                  <div
                    key={consumer.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                        {consumer.name}
                        <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginLeft: "8px" }}>
                          ({consumer.company})
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", marginTop: "2px" }}>
                        Plan: <span style={{ color: "#34d399", textTransform: "uppercase" }}>{consumer.plan}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8" }}>
                        {consumer.totalRuns} runs
                      </span>
                      <button
                        onClick={() => {
                          setSelectedConsumer(consumer);
                          setQuotaAction("reset");
                        }}
                        style={{
                          backgroundColor: "rgba(14, 165, 233, 0.15)",
                          border: "1px solid rgba(14, 165, 233, 0.3)",
                          color: "#38bdf8",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Adjust Quota
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px", color: "rgba(255, 255, 255, 0.4)", fontSize: "12px" }}>
                No agency has triggered AI requests yet.
              </div>
            )}
          </div>
        </div>

        {/* Module A: Revenue Distribution by Tier */}
        <div style={{
          backgroundColor: "rgba(13, 27, 20, 0.7)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                Revenue By Subscription Plan
              </h2>
              <span style={{ fontSize: "12px", color: "#34d399", fontWeight: 600 }}>
                MRR: ${revenue.mrr ?? 0}/mo
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Enterprise */}
              <div style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: "10px",
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#fbbf24" }}>
                    Enterprise Agency ($199/mo)
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#fff" }}>
                    ${revenue.revenueByPlan?.enterprise ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                  {metrics?.planDistribution?.enterprise ?? 0} Accounts • Unlimited Projects & AI Access
                </div>
              </div>

              {/* Pro */}
              <div style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "10px",
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#34d399" }}>
                    Professional Tier ($79/mo)
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#fff" }}>
                    ${revenue.revenueByPlan?.pro ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                  {metrics?.planDistribution?.pro ?? 0} Accounts • Up to 30 Active Projects
                </div>
              </div>

              {/* Starter */}
              <div style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "10px",
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#60a5fa" }}>
                    Starter Tier ($29/mo)
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#fff" }}>
                    ${revenue.revenueByPlan?.starter ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                  {metrics?.planDistribution?.starter ?? 0} Accounts • 10 Active Projects
                </div>
              </div>

              {/* Free Trial */}
              <div style={{
                backgroundColor: "rgba(0, 0, 0, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>
                    Free Trial ($0)
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "rgba(255, 255, 255, 0.6)" }}>
                    $0/mo
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>
                  {metrics?.planDistribution?.free ?? 0} Trialing Accounts • Conversion Target
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
            <Link
              href="/consultants"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                padding: "11px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <span>Manage Agency Plans</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* RECENT AGENCIES & QUICK SHORTCUTS */}
      <div style={{
        backgroundColor: "rgba(13, 27, 20, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        padding: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
              Recently Onboarded Agencies
            </h2>
            <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
              Latest brand consultants registered across the FLOXA ecosystem
            </span>
          </div>
          <Link
            href="/consultants"
            style={{ fontSize: "13px", color: "#34d399", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span>View All Consultants</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {metrics?.recentConsultants && metrics.recentConsultants.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.5)", textAlign: "left" }}>
                  <th style={{ padding: "12px 14px" }}>Consultant</th>
                  <th style={{ padding: "12px 14px" }}>Agency / Company</th>
                  <th style={{ padding: "12px 14px" }}>Plan</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 14px" }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentConsultants.map((c: any) => (
                  <tr key={c._id || c.email} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "14px", fontWeight: 600, color: "#fff" }}>
                      {c.name}
                      <span style={{ display: "block", fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", fontWeight: 400 }}>
                        {c.email}
                      </span>
                    </td>
                    <td style={{ padding: "14px", color: "rgba(255, 255, 255, 0.8)" }}>
                      {c.company || "Independent"}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: c.subscription?.plan === "enterprise" ? "rgba(245, 158, 11, 0.15)" : c.subscription?.plan === "pro" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.1)",
                        color: c.subscription?.plan === "enterprise" ? "#fbbf24" : c.subscription?.plan === "pro" ? "#34d399" : "#cbd5e1",
                      }}>
                        {c.subscription?.plan || "free"}
                      </span>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span style={{ color: c.isActive ? "#34d399" : "#f87171", fontWeight: 600, fontSize: "12px" }}>
                        {c.isActive ? "● Active" : "○ Suspended"}
                      </span>
                    </td>
                    <td style={{ padding: "14px", color: "rgba(255, 255, 255, 0.5)" }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Recent"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "32px", color: "rgba(255, 255, 255, 0.4)" }}>
            {loading ? "Loading..." : "No consultants registered yet."}
          </div>
        )}
      </div>

      {/* AI QUOTA ADJUSTMENT MODAL */}
      {selectedConsumer ? (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px",
        }}>
          <div style={{
            backgroundColor: "#0d1b14",
            border: "1px solid rgba(14, 165, 233, 0.4)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "480px",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(14, 165, 233, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#38bdf8",
                }}>
                  <Cpu size={16} />
                </div>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#fff", fontWeight: 700 }}>
                  Adjust AI Quota
                </h3>
              </div>
              <button
                onClick={() => setSelectedConsumer(null)}
                style={{ background: "transparent", border: "none", color: "rgba(255, 255, 255, 0.5)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: "0 0 18px 0", fontSize: "13px", color: "rgba(255, 255, 255, 0.7)" }}>
              Manage AI credits and tool limits for <strong>{selectedConsumer.name}</strong> ({selectedConsumer.company}).
            </p>

            {quotaSuccess ? (
              <div style={{
                backgroundColor: "rgba(16, 185, 129, 0.2)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#34d399",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <CheckCircle2 size={16} />
                <span>{quotaSuccess}</span>
              </div>
            ) : null}

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "8px", fontWeight: 600 }}>
                Select Action
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setQuotaAction("reset")}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "13px",
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
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "13px",
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
            </div>

            {quotaAction === "set-credits" ? (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "rgba(255, 255, 255, 0.6)", marginBottom: "6px", fontWeight: 600 }}>
                  Bonus Runs Allowance
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={bonusCredits}
                  onChange={(e) => setBonusCredits(Math.max(1, parseInt(e.target.value) || 0))}
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
                <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", display: "block", marginTop: "4px" }}>
                  Adds extra generation runs beyond their plan limits.
                </span>
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "20px" }}>
                This will clear their counted tool runs for proposal generator, moodboards, and brand DNA, immediately restoring their allowance.
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setSelectedConsumer(null)}
                style={{
                  padding: "9px 16px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  borderRadius: "8px",
                  color: "rgba(255, 255, 255, 0.7)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateQuota}
                disabled={updatingQuota}
                style={{
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
                {updatingQuota ? "Saving..." : "Apply AI Quota"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
