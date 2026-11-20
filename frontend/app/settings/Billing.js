"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Zap,
  FolderKanban,
  Users,
  Clock,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FileText,
} from "lucide-react";
import {
  getSubscriptionUsage,
  getSubscriptionPlans,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionInvoices,
} from "@/lib/subscriptionApi";
import { showError, showSuccess } from "@/lib/toast";

export default function Billing() {
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" | "semi_annual" | "yearly"
  const [processingPlan, setProcessingPlan] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usageData, plansData, invoicesData] = await Promise.all([
        getSubscriptionUsage().catch(() => null),
        getSubscriptionPlans().catch(() => []),
        getSubscriptionInvoices().catch(() => []),
      ]);
      if (usageData) setUsage(usageData);
      if (Array.isArray(plansData)) setPlans(plansData);
      if (Array.isArray(invoicesData)) setInvoices(invoicesData);
    } catch (err) {
      console.error("Failed to load subscription data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper to dynamically load Razorpay script
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSelectPlan = async (plan) => {
    try {
      setProcessingPlan(plan.slug);

      const orderData = await createSubscriptionOrder(plan.slug, billingCycle);

      if (orderData.freeSwitched) {
        showSuccess(orderData.message || `Switched to ${plan.name}`);
        await loadData();
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        showError("Failed to load payment gateway. Please check your internet connection.");
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency || "INR",
        name: "Floxa Design Platform",
        description: `${plan.name} Subscription (${billingCycle.replace("_", "-")})`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            const verifyRes = await verifySubscriptionPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planSlug: plan.slug,
              billingCycle: billingCycle,
            });

            showSuccess(verifyRes.message || "Subscription activated successfully!");
            await loadData();
          } catch (verifyErr) {
            showError(verifyErr?.detail || "Payment verification failed. Please contact support.");
          }
        },
        theme: {
          color: "#4dffa0",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (failResponse) {
        showError(failResponse?.error?.description || "Payment failed or cancelled.");
      });
      rzp.open();
    } catch (err) {
      showError(err?.detail || err?.message || "Failed to initiate subscription.");
    } finally {
      setProcessingPlan(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted, #89aca0)" }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <div>Loading subscription & quota details...</div>
      </div>
    );
  }

  const currentPlan = usage?.plan;
  const currentStatus = usage?.status || "active";
  const isGracePeriod = usage?.isGracePeriod;
  const isExpired = usage?.isExpired;
  const projects = usage?.projects || { current: 0, max: 5, percentage: 0 };
  const clients = usage?.clients || { current: 0, max: 10, percentage: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* 1. Status Alert Banners */}
      {isExpired && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "10px",
            backgroundColor: "rgba(255, 107, 107, 0.15)",
            border: "1px solid rgba(255, 107, 107, 0.35)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#ff6b6b",
          }}
        >
          <AlertTriangle size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>Subscription Expired</div>
            <div style={{ fontSize: "12px", marginTop: "2px", opacity: 0.9 }}>
              Your plan period has expired. Please renew your subscription below to continue launching projects and onboarding clients.
            </div>
          </div>
        </div>
      )}

      {isGracePeriod && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "10px",
            backgroundColor: "rgba(240, 180, 41, 0.15)",
            border: "1px solid rgba(240, 180, 41, 0.35)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#f0b429",
          }}
        >
          <Clock size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>Grace Period Active</div>
            <div style={{ fontSize: "12px", marginTop: "2px", opacity: 0.9 }}>
              Your subscription is in a 5-day grace period ending on {new Date(usage?.gracePeriodEnd).toLocaleDateString()}. Renew now to avoid service interruption.
            </div>
          </div>
        </div>
      )}

      {/* 2. Current Plan Overview & Usage Quotas Card */}
      <div
        className="card settings-card"
        style={{
          padding: "24px",
          borderRadius: "12px",
          backgroundColor: "rgba(6, 22, 15, 0.6)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted, #607f72)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Current Plan
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <span>{currentPlan?.name || "Free Starter"}</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "12px",
                  fontWeight: 600,
                  backgroundColor: currentStatus === "active" ? "rgba(77, 255, 160, 0.15)" : "rgba(255, 107, 107, 0.15)",
                  color: currentStatus === "active" ? "#4dffa0" : "#ff6b6b",
                  border: `1px solid ${currentStatus === "active" ? "rgba(77, 255, 160, 0.3)" : "rgba(255, 107, 107, 0.3)"}`,
                  textTransform: "capitalize",
                }}
              >
                {currentStatus}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#89aca0", marginTop: "4px" }}>
              {usage?.daysRemaining > 0 ? (
                <span>Renews / Expires in <strong>{usage.daysRemaining} days</strong> ({new Date(usage.currentPeriodEnd).toLocaleDateString()})</span>
              ) : (
                <span>Subscription period concluded</span>
              )}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted, #607f72)" }}>Billing Cycle</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e8f5ef", textTransform: "capitalize", marginTop: "2px" }}>
              {usage?.billingCycle || "Monthly"}
            </div>
          </div>
        </div>

        {/* Quota Progress Meters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
          {/* Projects Meter */}
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: `1px solid ${projects.isLimitReached ? "rgba(255, 107, 107, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                <FolderKanban size={15} color="#4dffa0" />
                <span>Active Projects</span>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: projects.isLimitReached ? "#ff6b6b" : "#4dffa0" }}>
                {projects.current} / {projects.max === -1 ? "∞" : projects.max}
              </span>
            </div>

            <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  width: projects.max === -1 ? "15%" : `${Math.min(100, projects.percentage)}%`,
                  height: "100%",
                  backgroundColor: projects.isLimitReached ? "#ff6b6b" : "#4dffa0",
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "6px" }}>
              {projects.isLimitReached ? "Limit reached — upgrade to launch more" : `${projects.percentage}% capacity used`}
            </div>
          </div>

          {/* Clients Meter */}
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: `1px solid ${clients.isLimitReached ? "rgba(255, 107, 107, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                <Users size={15} color="#60a5fa" />
                <span>Onboarded Clients</span>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 700, color: clients.isLimitReached ? "#ff6b6b" : "#60a5fa" }}>
                {clients.current} / {clients.max === -1 ? "∞" : clients.max}
              </span>
            </div>

            <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  width: clients.max === -1 ? "15%" : `${Math.min(100, clients.percentage)}%`,
                  height: "100%",
                  backgroundColor: clients.isLimitReached ? "#ff6b6b" : "#60a5fa",
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "6px" }}>
              {clients.isLimitReached ? "Limit reached — upgrade to onboard more" : `${clients.percentage}% capacity used`}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Cycle Switcher & Plan Matrix */}
      <div>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0 }}>
            Choose or Renew Your Subscription Tier
          </h2>
          <p style={{ fontSize: "13px", color: "#89aca0", margin: "6px 0 16px" }}>
            Expand your project capacity, client onboarding limits, and unlock SLA escalation monitoring.
          </p>

          {/* Interval Toggle Switcher */}
          <div
            style={{
              display: "inline-flex",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "30px",
              padding: "4px",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              style={{
                padding: "8px 18px",
                borderRadius: "24px",
                border: "none",
                backgroundColor: billingCycle === "monthly" ? "#4dffa0" : "transparent",
                color: billingCycle === "monthly" ? "#020806" : "#89aca0",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Monthly
            </button>

            <button
              type="button"
              onClick={() => setBillingCycle("semi_annual")}
              style={{
                padding: "8px 18px",
                borderRadius: "24px",
                border: "none",
                backgroundColor: billingCycle === "semi_annual" ? "#4dffa0" : "transparent",
                color: billingCycle === "semi_annual" ? "#020806" : "#89aca0",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>6 Months</span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: billingCycle === "semi_annual" ? "rgba(0,0,0,0.2)" : "rgba(77, 255, 160, 0.15)",
                  color: billingCycle === "semi_annual" ? "#000" : "#4dffa0",
                }}
              >
                Save 15%
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              style={{
                padding: "8px 18px",
                borderRadius: "24px",
                border: "none",
                backgroundColor: billingCycle === "yearly" ? "#4dffa0" : "transparent",
                color: billingCycle === "yearly" ? "#020806" : "#89aca0",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>Yearly</span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: billingCycle === "yearly" ? "rgba(0,0,0,0.2)" : "rgba(77, 255, 160, 0.15)",
                  color: billingCycle === "yearly" ? "#000" : "#4dffa0",
                }}
              >
                Save 30%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "20px",
          }}
        >
          {plans.map((p) => {
            const isCurrent = currentPlan?.slug === p.slug;
            let displayPrice = p.pricing?.monthly?.price || 0;
            let cycleDetail = "billed monthly";

            if (billingCycle === "semi_annual") {
              const fullSemi = p.pricing?.semiAnnual?.price || Math.round(displayPrice * 6 * 0.85);
              displayPrice = Math.round(fullSemi / 6);
              cycleDetail = `₹${fullSemi.toLocaleString()} billed every 6 months`;
            } else if (billingCycle === "yearly") {
              const fullYear = p.pricing?.yearly?.price || Math.round(displayPrice * 12 * 0.7);
              displayPrice = Math.round(fullYear / 12);
              cycleDetail = `₹${fullYear.toLocaleString()} billed annually`;
            }

            const bullets = p.features?.featureBulletPoints?.length > 0
              ? p.features.featureBulletPoints
              : [
                  `${p.limits?.maxProjects === -1 ? "Unlimited" : `Up to ${p.limits?.maxProjects}`} active projects`,
                  `${p.limits?.maxClients === -1 ? "Unlimited" : `Up to ${p.limits?.maxClients}`} onboarded clients`,
                  `${p.limits?.maxAiRunsPerMonth === -1 ? "Unlimited" : `${p.limits?.maxAiRunsPerMonth}`} AI runs/month`,
                ];

            return (
              <div
                key={p.slug}
                style={{
                  borderRadius: "12px",
                  backgroundColor: isCurrent ? "rgba(77, 255, 160, 0.04)" : "rgba(6, 22, 15, 0.6)",
                  border: isCurrent
                    ? "2px solid #4dffa0"
                    : p.badge
                    ? "1px solid rgba(77, 255, 160, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isCurrent ? "0 0 20px rgba(77, 255, 160, 0.15)" : "none",
                }}
              >
                {p.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-10px",
                      right: "20px",
                      backgroundColor: "#4dffa0",
                      color: "#020806",
                      fontSize: "10px",
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {p.badge}
                  </div>
                )}

                <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{p.name}</div>
                <div style={{ fontSize: "12px", color: "#89aca0", minHeight: "36px", marginBottom: "16px" }}>
                  {p.description}
                </div>

                {/* Price Display */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 800, color: "#e8f5ef" }}>
                      {displayPrice === 0 ? "Free" : `₹${displayPrice.toLocaleString()}`}
                    </span>
                    {displayPrice > 0 && <span style={{ fontSize: "12px", color: "#607f72" }}>/mo</span>}
                  </div>
                  {displayPrice > 0 && (
                    <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "2px" }}>{cycleDetail}</div>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  type="button"
                  onClick={() => handleSelectPlan(p)}
                  disabled={processingPlan === p.slug}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    border: isCurrent ? "1px solid rgba(77, 255, 160, 0.4)" : "none",
                    backgroundColor: isCurrent ? "rgba(77, 255, 160, 0.1)" : "#4dffa0",
                    color: isCurrent ? "#4dffa0" : "#020806",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    marginBottom: "20px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {processingPlan === p.slug ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : isCurrent ? (
                    <span>Current Plan (Renew)</span>
                  ) : (
                    <span>Upgrade to {p.name}</span>
                  )}
                </button>

                {/* Features Checklist */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "auto", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "16px" }}>
                  {bullets.map((feature, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#e8f5ef" }}>
                      <Check size={14} color="#4dffa0" style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Invoice History Table */}
      {invoices.length > 0 && (
        <div
          className="card settings-card"
          style={{
            padding: "24px",
            borderRadius: "12px",
            backgroundColor: "rgba(6, 22, 15, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={16} color="#4dffa0" />
            <span>Subscription Invoices & Receipts</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "left", color: "#607f72" }}>
                  <th style={{ padding: "8px 12px" }}>Invoice #</th>
                  <th style={{ padding: "8px 12px" }}>Plan Tier</th>
                  <th style={{ padding: "8px 12px" }}>Cycle</th>
                  <th style={{ padding: "8px 12px" }}>Amount</th>
                  <th style={{ padding: "8px 12px" }}>Date</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "10px 12px", color: "#e8f5ef", fontWeight: 600 }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: "10px 12px", color: "#4dffa0", textTransform: "capitalize" }}>{inv.planSlug}</td>
                    <td style={{ padding: "10px 12px", color: "#89aca0", textTransform: "capitalize" }}>{inv.billingCycle}</td>
                    <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 600 }}>₹{inv.amount.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "#607f72" }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(77, 255, 160, 0.1)", color: "#4dffa0", fontSize: "10px", fontWeight: 700 }}>
                        Paid
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
