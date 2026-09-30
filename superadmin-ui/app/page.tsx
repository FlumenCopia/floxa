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
  Cpu,
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
  const [quotaAction, setQuotaAction] = useState<"reset" | "add-credits">("reset");
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
        quotaAction === "add-credits" ? bonusCredits : undefined
      );
      setQuotaSuccess(
        quotaAction === "reset"
          ? `Reset AI tool counter for ${selectedConsumer.name}`
          : `Added ${bonusCredits} bonus runs to ${selectedConsumer.name}`
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
      <div className="admin-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#f3f8f4", letterSpacing: "-0.01em" }}>
              Platform Overview
            </h1>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(77, 255, 160, 0.1)",
              color: "#4dffa0",
              border: "1px solid rgba(77, 255, 160, 0.25)",
              padding: "2px 8px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#4dffa0", display: "inline-block", boxShadow: "0 0 6px #4dffa0" }} />
              Live System
            </span>
          </div>
          <p style={{ margin: 0, color: "#89aca0", fontSize: "13px" }}>
            Real-time platform revenue metrics, subscription counts, project volume, and system usage.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            onClick={fetchMetrics}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(6, 22, 15, 0.72)",
              border: "1px solid rgba(77, 255, 160, 0.25)",
              color: "#e8f5ef",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              transition: "all 0.15s ease",
            }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} style={{ color: "#4dffa0" }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error ? (
        <div style={{
          backgroundColor: "rgba(255, 107, 107, 0.12)",
          border: "1px solid rgba(255, 107, 107, 0.25)",
          color: "#ff6b6b",
          padding: "14px 18px",
          borderRadius: "8px",
          marginBottom: "24px",
          fontSize: "13px",
        }}>
          {error}
        </div>
      ) : null}

      {/* SECTION 1: REVENUE & SUBSCRIPTIONS */}
      <div className="admin-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h2 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "#f3f8f4", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Revenue & Subscriptions
            </h2>
            <span style={{ fontSize: "12px", color: "#607f72" }}>
              Live MRR calculation from active agency accounts
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#4dffa0", fontWeight: 600 }}>
            <TrendingUp size={14} />
            <span>Active Billing Cycle</span>
          </div>
        </div>

        <div className="admin-stats-grid">
          {/* MRR */}
          <div style={{
            backgroundColor: "rgba(2, 14, 9, 0.55)",
            border: "1px solid rgba(77, 255, 160, 0.15)",
            borderRadius: "8px",
            padding: "16px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#4dffa0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Monthly Recurring (MRR)
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#e8f5ef", letterSpacing: "-0.02em" }}>
              ₹{loading ? "..." : (revenue.mrr?.toLocaleString("en-IN") ?? 0)}
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#749b88", marginLeft: "4px" }}>/mo</span>
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "4px" }}>
              From {revenue.paidConsultants ?? 0} active paid subscriptions
            </div>
          </div>

          {/* ARR */}
          <div style={{
            backgroundColor: "rgba(2, 14, 9, 0.55)",
            border: "1px solid rgba(74, 158, 255, 0.15)",
            borderRadius: "8px",
            padding: "16px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#4a9eff", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Annual Run-Rate (ARR)
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#e8f5ef", letterSpacing: "-0.02em" }}>
              ₹{loading ? "..." : (revenue.arr?.toLocaleString("en-IN") ?? 0)}
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#749b88", marginLeft: "4px" }}>/yr</span>
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "4px" }}>
              Projected 12-month recurring gross
            </div>
          </div>

          {/* Conversion Rate */}
          <div style={{
            backgroundColor: "rgba(2, 14, 9, 0.55)",
            border: "1px solid rgba(240, 180, 41, 0.15)",
            borderRadius: "8px",
            padding: "16px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#f0b429", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Paid Conversion Rate
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#e8f5ef", letterSpacing: "-0.02em" }}>
              {loading ? "..." : `${revenue.conversionRate ?? 0}%`}
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "4px" }}>
              {revenue.paidConsultants ?? 0} Paid • {revenue.freeConsultants ?? 0} Free Trial
            </div>
          </div>

          {/* ARPU */}
          <div style={{
            backgroundColor: "rgba(2, 14, 9, 0.55)",
            border: "1px solid rgba(192, 132, 252, 0.15)",
            borderRadius: "8px",
            padding: "16px",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Average Revenue / User
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#e8f5ef", letterSpacing: "-0.02em" }}>
              ₹{loading ? "..." : (revenue.arpu?.toLocaleString("en-IN") ?? 0)}
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#749b88", marginLeft: "4px" }}>/mo</span>
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "4px" }}>
              Blended across all registered accounts
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: PLATFORM OPERATIONS */}
      <div className="admin-stats-grid" style={{ marginBottom: "24px" }}>
        {/* Total Consultants */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.18)",
          borderRadius: "10px",
          padding: "18px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#89aca0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Agencies & Consultants
            </span>
            <div style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: "rgba(77, 255, 160, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4dffa0",
            }}>
              <Users size={15} />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#e8f5ef", marginBottom: "6px" }}>
            {loading ? "..." : (metrics?.totalConsultants ?? 0)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
            <span style={{ color: "#4dffa0", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <UserCheck size={12} /> {metrics?.activeConsultants ?? 0} Active
            </span>
            <span style={{ color: "#ff6b6b", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <UserX size={12} /> {metrics?.suspendedConsultants ?? 0} Suspended
            </span>
          </div>
        </div>

        {/* Platform Projects */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(74, 158, 255, 0.18)",
          borderRadius: "10px",
          padding: "18px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#89aca0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Platform Projects
            </span>
            <div style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: "rgba(74, 158, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4a9eff",
            }}>
              <FolderKanban size={15} />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#e8f5ef", marginBottom: "6px" }}>
            {loading ? "..." : (metrics?.totalProjects ?? 0)}
          </div>
          <div style={{ fontSize: "11px", color: "#607f72" }}>
            Active branding projects across all consultants
          </div>
        </div>

        {/* End Clients */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(240, 180, 41, 0.18)",
          borderRadius: "10px",
          padding: "18px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#89aca0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Client Accounts
            </span>
            <div style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: "rgba(240, 180, 41, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f0b429",
            }}>
              <Building size={15} />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#e8f5ef", marginBottom: "6px" }}>
            {loading ? "..." : (metrics?.totalClients ?? 0)}
          </div>
          <div style={{ fontSize: "11px", color: "#607f72" }}>
            Client businesses accessing active portals
          </div>
        </div>

        {/* Paid Tiers */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(192, 132, 252, 0.18)",
          borderRadius: "10px",
          padding: "18px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#89aca0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Paid Licenses
            </span>
            <div style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: "rgba(192, 132, 252, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c084fc",
            }}>
              <Sparkles size={15} />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#e8f5ef", marginBottom: "6px" }}>
            {loading ? "..." : (revenue.paidConsultants ?? 0)}
          </div>
          <div style={{ fontSize: "11px", color: "#4dffa0" }}>
            {metrics?.planDistribution?.enterprise || 0} Enterprise • {metrics?.planDistribution?.pro || 0} Pro • {metrics?.planDistribution?.starter || 0} Starter
          </div>
        </div>
      </div>

      {/* SECTION 3: SYSTEM USAGE & SUBSCRIPTION BREAKDOWN */}
      <div className="admin-two-col-grid">
        {/* Module: AI Tool Usage & Quotas */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.18)",
          borderRadius: "10px",
          padding: "20px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                <Cpu size={16} />
              </div>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  AI Resource Usage & Quotas
                </h2>
                <span style={{ fontSize: "11px", color: "#607f72" }}>
                  Tool executions and estimated API expenses
                </span>
              </div>
            </div>
            <span style={{
              backgroundColor: "rgba(74, 158, 255, 0.1)",
              color: "#4a9eff",
              border: "1px solid rgba(74, 158, 255, 0.25)",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
            }}>
              Est. Spend: ₹{aiUsage.estimatedApiCost?.toLocaleString("en-IN") ?? 0}
            </span>
          </div>

          {/* Quick Counters */}
          <div className="admin-form-grid-2">
            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.55)",
              border: "1px solid rgba(77, 255, 160, 0.12)",
              borderRadius: "6px",
              padding: "12px",
            }}>
              <div style={{ fontSize: "11px", color: "#89aca0", marginBottom: "2px" }}>
                Total AI Requests
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#4a9eff" }}>
                {loading ? "..." : (aiUsage.totalRuns ?? 0)}
              </div>
              <div style={{ fontSize: "10px", color: "#607f72", marginTop: "2px" }}>
                Proposals, moodboards & brand DNA
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(2, 14, 9, 0.55)",
              border: "1px solid rgba(77, 255, 160, 0.12)",
              borderRadius: "6px",
              padding: "12px",
            }}>
              <div style={{ fontSize: "11px", color: "#89aca0", marginBottom: "2px" }}>
                Proposal Generator Runs
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#4dffa0" }}>
                {loading ? "..." : (aiUsage.toolBreakdown?.["proposal-generator"] ?? 0)}
              </div>
              <div style={{ fontSize: "10px", color: "#607f72", marginTop: "2px" }}>
                Primary generation workflow
              </div>
            </div>
          </div>

          {/* Top Consumers Table */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Top Consumer Accounts
            </div>
            {aiUsage.topConsumers && aiUsage.topConsumers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {aiUsage.topConsumers.map((consumer: any) => (
                  <div
                    key={consumer.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "rgba(2, 14, 9, 0.55)",
                      border: "1px solid rgba(77, 255, 160, 0.1)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#f3f8f4" }}>
                        {consumer.name}
                        <span style={{ fontSize: "11px", color: "#607f72", marginLeft: "6px" }}>
                          ({consumer.company})
                        </span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#89aca0", marginTop: "2px" }}>
                        Plan: <span style={{ color: "#4dffa0", fontWeight: 600, textTransform: "uppercase" }}>{consumer.plan}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#4a9eff" }}>
                        {consumer.totalRuns} runs
                      </span>
                      <button
                        onClick={() => {
                          setSelectedConsumer(consumer);
                          setQuotaAction("reset");
                        }}
                        style={{
                          backgroundColor: "rgba(74, 158, 255, 0.1)",
                          border: "1px solid rgba(74, 158, 255, 0.25)",
                          color: "#4a9eff",
                          padding: "4px 8px",
                          borderRadius: "4px",
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
              <div style={{ textAlign: "center", padding: "16px", color: "#607f72", fontSize: "12px" }}>
                No agency has triggered AI requests yet.
              </div>
            )}
          </div>
        </div>

        {/* Module: Subscription Tiers Breakdown */}
        <div style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.18)",
          borderRadius: "10px",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  Subscription Tiers
                </h2>
                <span style={{ fontSize: "11px", color: "#607f72" }}>
                  Active accounts and revenue breakdown
                </span>
              </div>
              <span style={{ fontSize: "12px", color: "#4dffa0", fontWeight: 700 }}>
                MRR: ₹{revenue.mrr?.toLocaleString("en-IN") ?? 0}/mo
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Enterprise */}
              <div style={{
                backgroundColor: "rgba(2, 14, 9, 0.55)",
                border: "1px solid rgba(240, 180, 41, 0.2)",
                borderRadius: "6px",
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#f0b429" }}>
                    Enterprise Agency (₹{revenue.planPricing?.enterprise?.toLocaleString("en-IN") ?? "16,999"}/mo)
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#e8f5ef" }}>
                    ₹{revenue.revenueByPlan?.enterprise?.toLocaleString("en-IN") ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "#89aca0" }}>
                  {metrics?.planDistribution?.enterprise ?? 0} Accounts • Unlimited projects and generation
                </div>
              </div>

              {/* Pro */}
              <div style={{
                backgroundColor: "rgba(2, 14, 9, 0.55)",
                border: "1px solid rgba(77, 255, 160, 0.2)",
                borderRadius: "6px",
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#4dffa0" }}>
                    Professional Tier (₹{revenue.planPricing?.pro?.toLocaleString("en-IN") ?? "6,999"}/mo)
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#e8f5ef" }}>
                    ₹{revenue.revenueByPlan?.pro?.toLocaleString("en-IN") ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "#89aca0" }}>
                  {metrics?.planDistribution?.pro ?? 0} Accounts • Up to 30 Active Projects
                </div>
              </div>

              {/* Starter */}
              <div style={{
                backgroundColor: "rgba(2, 14, 9, 0.55)",
                border: "1px solid rgba(74, 158, 255, 0.2)",
                borderRadius: "6px",
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#4a9eff" }}>
                    Starter Tier (₹{revenue.planPricing?.starter?.toLocaleString("en-IN") ?? "2,499"}/mo)
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#e8f5ef" }}>
                    ₹{revenue.revenueByPlan?.starter ?? 0}/mo
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "#89aca0" }}>
                  {metrics?.planDistribution?.starter ?? 0} Accounts • 10 Active Projects
                </div>
              </div>

              {/* Free Trial */}
              <div style={{
                backgroundColor: "rgba(2, 14, 9, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "6px",
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#89aca0" }}>
                    Free Trial (₹0)
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#607f72" }}>
                    ₹0/mo
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "#607f72" }}>
                  {metrics?.planDistribution?.free ?? 0} Trialing Accounts • Standard allowance
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <Link
              href="/consultants"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backgroundColor: "rgba(77, 255, 160, 0.1)",
                border: "1px solid rgba(77, 255, 160, 0.25)",
                color: "#4dffa0",
                padding: "9px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                transition: "all 0.15s ease",
              }}
            >
              <span>Manage Agency Accounts</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* SECTION 4: RECENT AGENCIES */}
      <div className="admin-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
              Recently Onboarded Agencies
            </h2>
            <span style={{ fontSize: "11px", color: "#607f72" }}>
              Latest brand consultants registered across the platform
            </span>
          </div>
          <Link
            href="/consultants"
            style={{ fontSize: "12px", color: "#4dffa0", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <span>View All Consultants</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        {metrics?.recentConsultants && metrics.recentConsultants.length > 0 ? (
          <div className="admin-table-wrapper">
            <table className="admin-table" style={{ fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(77, 255, 160, 0.12)", color: "#607f72", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Consultant</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Agency / Company</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Plan</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600 }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentConsultants.map((c: any) => (
                  <tr key={c._id || c.email} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "#e8f5ef" }}>
                      {c.name}
                      <span style={{ display: "block", fontSize: "11px", color: "#607f72", fontWeight: 400 }}>
                        {c.email}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#89aca0" }}>
                      {c.company || "Independent"}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor:
                          c.subscription?.plan === "enterprise"
                            ? "rgba(240, 180, 41, 0.12)"
                            : c.subscription?.plan === "pro"
                              ? "rgba(77, 255, 160, 0.12)"
                              : c.subscription?.plan === "starter"
                                ? "rgba(74, 158, 255, 0.12)"
                                : "rgba(255, 255, 255, 0.08)",
                        color:
                          c.subscription?.plan === "enterprise"
                            ? "#f0b429"
                            : c.subscription?.plan === "pro"
                              ? "#4dffa0"
                              : c.subscription?.plan === "starter"
                                ? "#4a9eff"
                                : "#89aca0",
                      }}>
                        {c.subscription?.plan || "free"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ color: c.isActive ? "#4dffa0" : "#ff6b6b", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: c.isActive ? "#4dffa0" : "#ff6b6b", display: "inline-block" }} />
                        {c.isActive ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#607f72" }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Recent"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "28px", color: "#607f72" }}>
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
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px",
        }}>
          <div className="admin-modal-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(77, 255, 160, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#4dffa0",
                }}>
                  <Cpu size={15} />
                </div>
                <h3 style={{ margin: 0, fontSize: "15px", color: "#e8f5ef", fontWeight: 700 }}>
                  Adjust AI Quota
                </h3>
              </div>
              <button
                onClick={() => setSelectedConsumer(null)}
                style={{ background: "transparent", border: "none", color: "#607f72", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "#89aca0" }}>
              Manage generation allowances for <strong>{selectedConsumer.name}</strong> ({selectedConsumer.company}).
            </p>

            {quotaSuccess ? (
              <div style={{
                backgroundColor: "rgba(77, 255, 160, 0.12)",
                border: "1px solid rgba(77, 255, 160, 0.3)",
                color: "#4dffa0",
                padding: "8px 12px",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
                <CheckCircle2 size={14} />
                <span>{quotaSuccess}</span>
              </div>
            ) : null}

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "6px", fontWeight: 600 }}>
                Select Action
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
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
                    backgroundColor: quotaAction === "reset" ? "rgba(77, 255, 160, 0.15)" : "rgba(255, 255, 255, 0.04)",
                    border: quotaAction === "reset" ? "1px solid #4dffa0" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: quotaAction === "reset" ? "#4dffa0" : "#89aca0",
                  }}
                >
                  Reset Tool Runs
                </button>
                <button
                  type="button"
                  onClick={() => setQuotaAction("add-credits")}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: quotaAction === "add-credits" ? "rgba(74, 158, 255, 0.15)" : "rgba(255, 255, 255, 0.04)",
                    border: quotaAction === "add-credits" ? "1px solid #4a9eff" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: quotaAction === "add-credits" ? "#4a9eff" : "#89aca0",
                  }}
                >
                  Grant Bonus Credits
                </button>
              </div>
            </div>

            {quotaAction === "add-credits" ? (
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
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
                    padding: "8px 12px",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.2)",
                    borderRadius: "6px",
                    color: "#e8f5ef",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#607f72", display: "block", marginTop: "4px" }}>
                  Adds extra generation runs beyond standard plan limits.
                </span>
              </div>
            ) : (
              <p style={{ fontSize: "11px", color: "#607f72", marginBottom: "18px" }}>
                This will reset the agency tool execution counter for the current period.
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setSelectedConsumer(null)}
                style={{
                  padding: "7px 14px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#89aca0",
                  fontSize: "12px",
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
                  padding: "7px 16px",
                  backgroundColor: "#4dffa0",
                  border: "none",
                  borderRadius: "6px",
                  color: "#001a0e",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {updatingQuota ? "Saving..." : "Apply Quota"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
