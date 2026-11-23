"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Plus,
  Check,
  X,
  Edit2,
  Users,
  FolderKanban,
  Zap,
  HardDrive,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { adminApi } from "../../services/api";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
}

function PlanModal({ isOpen, onClose, onSave, initialData }: PlanModalProps) {
  const isEditing = Boolean(initialData);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    badge: "",
    monthlyPrice: 0,
    semiAnnualPrice: 0,
    yearlyPrice: 0,
    maxProjects: 5,
    maxClients: 10,
    maxAiRunsPerMonth: 50,
    maxStorageMb: 1024,
    slaMonitoring: false,
    customBranding: false,
    customDomain: false,
    liveSpecimenPreview: false,
    aiProposalGenerator: true,
    brandDnaMoodboards: false,
    prioritySupport: false,
    analyticsExport: false,
    bulletPointsStr: "",
    isActive: true,
    isPublic: true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        slug: initialData.slug || "",
        description: initialData.description || "",
        badge: initialData.badge || "",
        monthlyPrice: initialData.pricing?.monthly?.price ?? 0,
        semiAnnualPrice: initialData.pricing?.semiAnnual?.price ?? 0,
        yearlyPrice: initialData.pricing?.yearly?.price ?? 0,
        maxProjects: initialData.limits?.maxProjects ?? 5,
        maxClients: initialData.limits?.maxClients ?? 10,
        maxAiRunsPerMonth: initialData.limits?.maxAiRunsPerMonth ?? 50,
        maxStorageMb: initialData.limits?.maxStorageMb ?? 1024,
        slaMonitoring: Boolean(initialData.features?.slaMonitoring),
        customBranding: Boolean(initialData.features?.customBranding),
        customDomain: Boolean(initialData.features?.customDomain),
        liveSpecimenPreview: Boolean(initialData.features?.liveSpecimenPreview),
        aiProposalGenerator: Boolean(initialData.features?.aiProposalGenerator),
        brandDnaMoodboards: Boolean(initialData.features?.brandDnaMoodboards),
        prioritySupport: Boolean(initialData.features?.prioritySupport),
        analyticsExport: Boolean(initialData.features?.analyticsExport),
        bulletPointsStr: (initialData.features?.featureBulletPoints || []).join("\n"),
        isActive: initialData.isActive !== false,
        isPublic: initialData.isPublic !== false,
      });
    } else {
      setFormData({
        name: "",
        slug: "",
        description: "",
        badge: "",
        monthlyPrice: 2999,
        semiAnnualPrice: 15290,
        yearlyPrice: 25190,
        maxProjects: 10,
        maxClients: 20,
        maxAiRunsPerMonth: 150,
        maxStorageMb: 4096,
        slaMonitoring: true,
        customBranding: true,
        customDomain: false,
        liveSpecimenPreview: true,
        aiProposalGenerator: true,
        brandDnaMoodboards: true,
        prioritySupport: false,
        analyticsExport: true,
        bulletPointsStr: "Up to 10 active client projects\nUp to 20 onboarded clients\nLive font specimen preview\nBrand DNA suite",
        isActive: true,
        isPublic: true,
      });
    }
  }, [initialData, isOpen]);

  // Auto-calculate suggested 6M & 1Y prices when monthly price changes (if not manually set)
  const handleMonthlyPriceChange = (val: number) => {
    setFormData((prev) => ({
      ...prev,
      monthlyPrice: val,
      semiAnnualPrice: Math.round(val * 6 * 0.85),
      yearlyPrice: Math.round(val * 12 * 0.7),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Plan name is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const bullets = formData.bulletPointsStr
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        description: formData.description.trim(),
        badge: formData.badge.trim(),
        pricing: {
          monthly: { price: Number(formData.monthlyPrice), discountPct: 0 },
          semiAnnual: { price: Number(formData.semiAnnualPrice), discountPct: 15 },
          yearly: { price: Number(formData.yearlyPrice), discountPct: 30 },
          currency: "INR",
        },
        limits: {
          maxProjects: Number(formData.maxProjects),
          maxClients: Number(formData.maxClients),
          maxAiRunsPerMonth: Number(formData.maxAiRunsPerMonth),
          maxStorageMb: Number(formData.maxStorageMb),
        },
        features: {
          slaMonitoring: formData.slaMonitoring,
          customBranding: formData.customBranding,
          customDomain: formData.customDomain,
          liveSpecimenPreview: formData.liveSpecimenPreview,
          aiProposalGenerator: formData.aiProposalGenerator,
          brandDnaMoodboards: formData.brandDnaMoodboards,
          prioritySupport: formData.prioritySupport,
          analyticsExport: formData.analyticsExport,
          featureBulletPoints: bullets,
        },
        isActive: formData.isActive,
        isPublic: formData.isPublic,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#08130e",
          border: "1px solid rgba(77, 255, 160, 0.25)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "720px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
          color: "#e8f5ef",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "rgba(77, 255, 160, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4dffa0",
              }}
            >
              <CreditCard size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                {isEditing ? `Edit Plan: ${initialData.name}` : "Create Dynamic Subscription Plan"}
              </h2>
              <p style={{ fontSize: "12px", color: "#607f72", margin: "2px 0 0" }}>
                Configure pricing tiers, onboarding quotas (projects & clients), and features.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#89aca0",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: "rgba(255, 107, 107, 0.12)",
                border: "1px solid rgba(255, 107, 107, 0.3)",
                color: "#ff6b6b",
                borderRadius: "6px",
                fontSize: "13px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div style={{ marginBottom: "22px" }}>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4dffa0", marginBottom: "12px" }}>
              1. General Details
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Plan Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Agency Growth"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Slug (Unique Identifier)
                </label>
                <input
                  type="text"
                  placeholder="e.g. growth"
                  disabled={isEditing}
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: isEditing ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: isEditing ? "#607f72" : "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "14px", marginTop: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Short Tagline / Description
                </label>
                <input
                  type="text"
                  placeholder="Best for studios managing multiple projects"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Card Badge (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Popular, Best Value"
                  value={formData.badge}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Multi-Cycle Pricing */}
          <div style={{ marginBottom: "22px", padding: "16px", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4dffa0", marginBottom: "12px" }}>
              2. Multi-Cycle Pricing (INR ₹)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Monthly Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.monthlyPrice}
                  onChange={(e) => handleMonthlyPriceChange(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#607f72" }}>Standard 30-day renewal</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  6-Month Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.semiAnnualPrice}
                  onChange={(e) => setFormData({ ...formData, semiAnnualPrice: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#4dffa0" }}>Auto-discount ~15% off</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Yearly Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.yearlyPrice}
                  onChange={(e) => setFormData({ ...formData, yearlyPrice: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#4dffa0" }}>Auto-discount ~30% off</span>
              </div>
            </div>
          </div>

          {/* Section 3: Quotas & Onboarding Limits */}
          <div style={{ marginBottom: "22px" }}>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4dffa0", marginBottom: "12px" }}>
              3. Onboarding Limits & Resource Quotas
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Max Active Projects (-1 = Unlimited) *
                </label>
                <input
                  type="number"
                  value={formData.maxProjects}
                  onChange={(e) => setFormData({ ...formData, maxProjects: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#607f72" }}>Blocks project creation when reached</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Max Onboarded Clients (-1 = Unlimited) *
                </label>
                <input
                  type="number"
                  value={formData.maxClients}
                  onChange={(e) => setFormData({ ...formData, maxClients: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#607f72" }}>Blocks client creation when reached</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Monthly AI Tool Runs (-1 = Unlimited)
                </label>
                <input
                  type="number"
                  value={formData.maxAiRunsPerMonth}
                  onChange={(e) => setFormData({ ...formData, maxAiRunsPerMonth: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
                  Storage Ceiling (MB)
                </label>
                <input
                  type="number"
                  value={formData.maxStorageMb}
                  onChange={(e) => setFormData({ ...formData, maxStorageMb: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Feature Entitlements */}
          <div style={{ marginBottom: "22px" }}>
            <h3 style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4dffa0", marginBottom: "12px" }}>
              4. Feature Entitlements & Toggles
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { key: "slaMonitoring", label: "SLA Monitoring & Escalation Alerts" },
                { key: "customBranding", label: "White-Label Portal & Custom Branding" },
                { key: "customDomain", label: "Custom CNAME Domain Mapping" },
                { key: "liveSpecimenPreview", label: "Live Font & Specimen Preview" },
                { key: "aiProposalGenerator", label: "AI Scope & Proposal Generator" },
                { key: "brandDnaMoodboards", label: "Brand DNA & Moodboard Directions" },
                { key: "prioritySupport", label: "24/7 Priority Support" },
                { key: "analyticsExport", label: "CSV & Analytics Reporting Exports" },
              ].map((item) => (
                <label
                  key={item.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(formData as any)[item.key]}
                    onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                    style={{ accentColor: "#4dffa0" }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section 5: Marketing Bullet Points */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px" }}>
              Plan Features Checklist (One item per line — displayed on consultant pricing card)
            </label>
            <textarea
              rows={4}
              placeholder="Up to 5 active client projects&#10;Up to 10 onboarded clients&#10;Live font specimen preview"
              value={formData.bulletPointsStr}
              onChange={(e) => setFormData({ ...formData, bulletPointsStr: e.target.value })}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#fff",
                fontSize: "13px",
                resize: "vertical",
              }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 16px",
                borderRadius: "6px",
                backgroundColor: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#89aca0",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "9px 20px",
                borderRadius: "6px",
                backgroundColor: "#4dffa0",
                border: "none",
                color: "#020806",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {saving && <RefreshCw size={14} className="animate-spin" />}
              <span>{isEditing ? "Save Changes" : "Create Plan"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPlans();
      setPlans(res.plans || []);
    } catch (err) {
      console.error("Failed to load subscription plans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleCreatePlan = async (payload: any) => {
    if (selectedPlan) {
      await adminApi.updatePlan(selectedPlan.id, payload);
    } else {
      await adminApi.createPlan(payload);
    }
    await fetchPlans();
  };

  const handleToggleActive = async (plan: any) => {
    try {
      setTogglingId(plan.id);
      await adminApi.updatePlan(plan.id, { isActive: !plan.isActive });
      await fetchPlans();
    } catch (err) {
      console.error("Failed to toggle plan status:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const totalSubscribers = plans.reduce((acc, p) => acc + (p.subscribersCount || 0), 0);
  const totalPaying = plans.filter((p) => (p.pricing?.monthly?.price || 0) > 0).reduce((acc, p) => acc + (p.subscribersCount || 0), 0);
  const estimatedMrr = plans.reduce((acc, p) => acc + (p.subscribersCount || 0) * (p.pricing?.monthly?.price || 0), 0);

  return (
    <div style={{ padding: "24px 32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0 }}>
            Subscription Plans & Quota Management
          </h1>
          <p style={{ fontSize: "13px", color: "#607f72", margin: "4px 0 0" }}>
            Dynamically configure pricing tiers, client & project onboarding ceilings, and feature entitlements.
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedPlan(null);
            setModalOpen(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#4dffa0",
            color: "#020806",
            border: "none",
            borderRadius: "6px",
            padding: "9px 18px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 0 15px rgba(77, 255, 160, 0.25)",
          }}
        >
          <Plus size={16} />
          <span>Create New Plan</span>
        </button>
      </div>

      {/* KPI Overview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#08130e", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#607f72", textTransform: "uppercase", letterSpacing: "0.06em" }}>Active Plans</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#e8f5ef", marginTop: "6px" }}>{plans.length}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#08130e", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#607f72", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Subscribers</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#4dffa0", marginTop: "6px" }}>{totalSubscribers}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#08130e", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#607f72", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid Subscribers</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#60a5fa", marginTop: "6px" }}>{totalPaying}</div>
        </div>

        <div style={{ padding: "16px", borderRadius: "10px", backgroundColor: "#08130e", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#607f72", textTransform: "uppercase", letterSpacing: "0.06em" }}>Estimated Monthly MRR</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#f0b429", marginTop: "6px" }}>
            ₹{estimatedMrr.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#607f72" }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
          <div>Loading subscription plans...</div>
        </div>
      ) : plans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#607f72", backgroundColor: "#08130e", borderRadius: "10px" }}>
          No plans found. Click "Create New Plan" to set up your first subscription tier.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
          {plans.map((plan) => {
            const monthlyPrice = plan.pricing?.monthly?.price || 0;
            const semiAnnualPrice = plan.pricing?.semiAnnual?.price || 0;
            const yearlyPrice = plan.pricing?.yearly?.price || 0;
            const isFree = monthlyPrice === 0;

            return (
              <div
                key={plan.id}
                style={{
                  backgroundColor: "#08130e",
                  border: `1px solid ${plan.isActive ? "rgba(77, 255, 160, 0.2)" : "rgba(255, 255, 255, 0.08)"}`,
                  borderRadius: "12px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  opacity: plan.isActive ? 1 : 0.65,
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#fff", margin: 0 }}>{plan.name}</h3>
                      {plan.badge && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            backgroundColor: "rgba(77, 255, 160, 0.15)",
                            color: "#4dffa0",
                            border: "1px solid rgba(77, 255, 160, 0.3)",
                          }}
                        >
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#607f72", marginTop: "2px" }}>slug: {plan.slug}</div>
                  </div>

                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: plan.isActive ? "rgba(77, 255, 160, 0.1)" : "rgba(255, 255, 255, 0.06)",
                      color: plan.isActive ? "#4dffa0" : "#89aca0",
                    }}
                  >
                    {plan.isActive ? "Active" : "Archived"}
                  </span>
                </div>

                <p style={{ fontSize: "12px", color: "#89aca0", margin: "0 0 16px", minHeight: "36px" }}>
                  {plan.description || "No description provided."}
                </p>

                {/* Pricing Box */}
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                    <span style={{ fontSize: "22px", fontWeight: 800, color: "#e8f5ef" }}>
                      {isFree ? "Free" : `₹${monthlyPrice.toLocaleString()}`}
                    </span>
                    {!isFree && <span style={{ fontSize: "11px", color: "#607f72" }}>/month</span>}
                  </div>
                  {!isFree && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "6px", fontSize: "11px", color: "#89aca0" }}>
                      <span>6M: ₹{semiAnnualPrice.toLocaleString()}</span>
                      <span>•</span>
                      <span>1Y: ₹{yearlyPrice.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Quotas & Limits */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#e8f5ef" }}>
                    <FolderKanban size={13} color="#4dffa0" />
                    <span>
                      {plan.limits?.maxProjects === -1 ? "Unlimited" : `${plan.limits?.maxProjects || 0}`} Projects
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#e8f5ef" }}>
                    <Users size={13} color="#4dffa0" />
                    <span>
                      {plan.limits?.maxClients === -1 ? "Unlimited" : `${plan.limits?.maxClients || 0}`} Clients
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#e8f5ef" }}>
                    <Zap size={13} color="#60a5fa" />
                    <span>
                      {plan.limits?.maxAiRunsPerMonth === -1 ? "Unlimited" : `${plan.limits?.maxAiRunsPerMonth || 0}`} AI runs/mo
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#e8f5ef" }}>
                    <HardDrive size={13} color="#f0b429" />
                    <span>{plan.limits?.maxStorageMb || 1024} MB Storage</span>
                  </div>
                </div>

                {/* Subscribers count */}
                <div style={{ fontSize: "11px", color: "#607f72", marginBottom: "14px" }}>
                  Subscribers on this tier: <strong style={{ color: "#4dffa0" }}>{plan.subscribersCount || 0}</strong>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <button
                    onClick={() => {
                      setSelectedPlan(plan);
                      setModalOpen(true);
                    }}
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#e8f5ef",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "5px",
                    }}
                  >
                    <Edit2 size={12} />
                    <span>Edit Plan</span>
                  </button>

                  <button
                    onClick={() => handleToggleActive(plan)}
                    disabled={togglingId === plan.id}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "6px",
                      backgroundColor: plan.isActive ? "rgba(255, 107, 107, 0.08)" : "rgba(77, 255, 160, 0.08)",
                      border: `1px solid ${plan.isActive ? "rgba(255, 107, 107, 0.2)" : "rgba(77, 255, 160, 0.2)"}`,
                      color: plan.isActive ? "#ff6b6b" : "#4dffa0",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {plan.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Modal */}
      <PlanModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedPlan(null);
        }}
        onSave={handleCreatePlan}
        initialData={selectedPlan}
      />
    </div>
  );
}
