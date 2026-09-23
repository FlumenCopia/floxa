"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  UserCheck,
  UserX,
  Sliders,
  X,
  RefreshCw,
  FolderKanban,
  Check,
  Eye,
  Download,
} from "lucide-react";
import { adminApi } from "../../services/api";
import Consultant360Drawer from "../../components/Consultant360Drawer";

export default function AdminConsultantsPage() {
  const [consultants, setConsultants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  // 360° Drawer State
  const [drawerConsultantId, setDrawerConsultantId] = useState<string | null>(null);

  // Plan Edit Modal
  const [selectedConsultant, setSelectedConsultant] = useState<any>(null);
  const [modalPlan, setModalPlan] = useState("starter");
  const [modalMaxProjects, setModalMaxProjects] = useState(10);
  const [savingPlan, setSavingPlan] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchConsultants = async (resetPage = false) => {
    setLoading(true);
    setError("");
    const targetPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    try {
      const res = await adminApi.getConsultants({
        search: searchTerm,
        status: statusFilter,
        plan: planFilter,
        page: targetPage,
        limit: 20,
      });

      if (res?.success && Array.isArray(res.data)) {
        setConsultants(res.data);
        if (res.pagination) setPagination(res.pagination);
      } else {
        setError("Failed to fetch consultants.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load consultants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultants();
  }, [page, statusFilter, planFilter]);

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleToggleStatus = async (consultant: any) => {
    const nextStatus = !consultant.isActive;
    const confirmMsg = nextStatus
      ? `Reactivate account for ${consultant.name}? They will regain access to their dashboard.`
      : `Suspend account for ${consultant.name}? They and their clients will be blocked from accessing the platform.`;

    if (!window.confirm(confirmMsg)) return;

    setTogglingId(consultant.id);
    try {
      const res = await adminApi.updateConsultantStatus(consultant.id, nextStatus);
      if (res?.success) {
        showNotification(res.message || "Account updated.");
        setConsultants((prev) =>
          prev.map((c) => (c.id === consultant.id ? { ...c, isActive: nextStatus } : c))
        );
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  };

  const openPlanModal = (consultant: any) => {
    setSelectedConsultant(consultant);
    setModalPlan(consultant.subscription?.plan || "free");
    setModalMaxProjects(consultant.subscription?.maxProjects ?? 5);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsultant) return;

    setSavingPlan(true);
    try {
      const res = await adminApi.updateConsultantPlan(
        selectedConsultant.id,
        modalPlan,
        Number(modalMaxProjects)
      );

      if (res?.success) {
        showNotification(`Plan updated to ${modalPlan.toUpperCase()} for ${selectedConsultant.name}`);
        setConsultants((prev) =>
          prev.map((c) =>
            c.id === selectedConsultant.id
              ? {
                  ...c,
                  subscription: {
                    ...c.subscription,
                    plan: modalPlan,
                    maxProjects: Number(modalMaxProjects),
                  },
                }
              : c
          )
        );
        setSelectedConsultant(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update plan.");
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 6px 0", color: "#f8fafc" }}>
            Consultants & Agencies
          </h1>
          <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.6)", fontSize: "14px" }}>
            Manage your B2B customers, control account access, and adjust project quota limits
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => adminApi.downloadConsultantsCsv()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => fetchConsultants()}
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
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successMsg ? (
        <div style={{
          backgroundColor: "rgba(16, 185, 129, 0.15)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#34d399",
          padding: "12px 18px",
          borderRadius: "10px",
          marginBottom: "20px",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {error ? (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#fca5a5",
          padding: "14px 18px",
          borderRadius: "10px",
          marginBottom: "20px",
          fontSize: "14px",
        }}>
          {error}
        </div>
      ) : null}

      {/* Filter and Search */}
      <div style={{
        backgroundColor: "rgba(13, 27, 20, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "14px",
        padding: "18px 24px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
      }}>
        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchConsultants(true);
          }}
          style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "280px" }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "10px",
            padding: "8px 14px",
            width: "100%",
            gap: "10px",
          }}>
            <Search size={16} color="rgba(255, 255, 255, 0.4)" />
            <input
              type="text"
              placeholder="Search by consultant name, email, or agency..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                outline: "none",
                fontSize: "14px",
                width: "100%",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              backgroundColor: "rgba(16, 185, 129, 0.2)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              color: "#34d399",
              borderRadius: "10px",
              padding: "8px 16px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              padding: "8px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              padding: "8px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">All Subscription Plans</option>
            <option value="free">Free Trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise / Agency</option>
          </select>
        </div>
      </div>

      {/* Consultants Table */}
      <div style={{
        backgroundColor: "rgba(13, 27, 20, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "14px",
        overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                color: "rgba(255, 255, 255, 0.5)",
                textAlign: "left",
              }}>
                <th style={{ padding: "14px 18px" }}>Consultant</th>
                <th style={{ padding: "14px 18px" }}>Agency / Company</th>
                <th style={{ padding: "14px 18px" }}>Plan Tier</th>
                <th style={{ padding: "14px 18px" }}>Projects</th>
                <th style={{ padding: "14px 18px" }}>Account Status</th>
                <th style={{ padding: "14px 18px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "rgba(255, 255, 255, 0.5)" }}>
                    Loading consultants list...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "rgba(255, 255, 255, 0.5)" }}>
                    No consultants found matching your criteria.
                  </td>
                </tr>
              ) : (
                consultants.map((c) => {
                  const isUpdating = togglingId === c.id;
                  const plan = c.subscription?.plan || "free";
                  const maxProjects = c.subscription?.maxProjects ?? 5;

                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "16px 18px" }}>
                        <div
                          onClick={() => setDrawerConsultantId(c.id)}
                          style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
                          title="Click to open 360° Agency Intelligence Drawer"
                        >
                          <div style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            color: "#34d399",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "13px",
                            flexShrink: 0,
                          }}>
                            {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "#fff", fontSize: "14px", textDecoration: "underline", textDecorationColor: "rgba(16, 185, 129, 0.4)" }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
                              {c.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "16px 18px", color: "rgba(255, 255, 255, 0.8)", fontWeight: 500 }}>
                        {c.company || "Independent Consultant"}
                      </td>

                      <td style={{ padding: "16px 18px" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            backgroundColor:
                              plan === "enterprise"
                                ? "rgba(245, 158, 11, 0.15)"
                                : plan === "pro"
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : plan === "starter"
                                    ? "rgba(59, 130, 246, 0.15)"
                                    : "rgba(255, 255, 255, 0.08)",
                            color:
                              plan === "enterprise"
                                ? "#fbbf24"
                                : plan === "pro"
                                  ? "#34d399"
                                  : plan === "starter"
                                    ? "#60a5fa"
                                    : "#94a3b8",
                            border: `1px solid ${
                              plan === "enterprise"
                                ? "rgba(245, 158, 11, 0.3)"
                                : plan === "pro"
                                  ? "rgba(16, 185, 129, 0.3)"
                                  : plan === "starter"
                                    ? "rgba(59, 130, 246, 0.3)"
                                    : "rgba(255, 255, 255, 0.1)"
                            }`,
                          }}>
                            {plan}
                          </span>
                          <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>
                            Quota: {maxProjects >= 999 ? "Unlimited" : `${maxProjects} projects`}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f8fafc", fontWeight: 600 }}>
                          <FolderKanban size={14} color="#34d399" />
                          <span>{c.projectsCount ?? 0}</span>
                        </div>
                      </td>

                      <td style={{ padding: "16px 18px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: c.isActive ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                          color: c.isActive ? "#34d399" : "#f87171",
                          border: `1px solid ${c.isActive ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                        }}>
                          {c.isActive ? <UserCheck size={13} /> : <UserX size={13} />}
                          {c.isActive ? "Active" : "Suspended"}
                        </span>
                      </td>

                      <td style={{ padding: "16px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => setDrawerConsultantId(c.id)}
                            style={{
                              backgroundColor: "rgba(16, 185, 129, 0.2)",
                              border: "1px solid rgba(16, 185, 129, 0.4)",
                              color: "#34d399",
                              padding: "6px 12px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                            }}
                          >
                            <Eye size={13} />
                            <span>360° View</span>
                          </button>

                          <button
                            onClick={() => handleToggleStatus(c)}
                            disabled={isUpdating}
                            style={{
                              backgroundColor: c.isActive ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                              border: `1px solid ${c.isActive ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                              color: c.isActive ? "#f87171" : "#34d399",
                              padding: "6px 12px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isUpdating ? "Saving..." : c.isActive ? "Suspend" : "Activate"}
                          </button>

                          <button
                            onClick={() => openPlanModal(c)}
                            style={{
                              backgroundColor: "rgba(255, 255, 255, 0.08)",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                              color: "#fff",
                              padding: "6px 12px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Sliders size={12} />
                            <span>Plan</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "13px",
            color: "rgba(255, 255, 255, 0.6)",
          }}>
            <div>
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total consultants)
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: page <= 1 ? "rgba(255, 255, 255, 0.2)" : "#fff",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: page >= pagination.totalPages ? "rgba(255, 255, 255, 0.2)" : "#fff",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Plan Edit Modal */}
      {selectedConsultant ? (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}>
          <div style={{
            backgroundColor: "#0d1b14",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "480px",
            padding: "28px",
            position: "relative",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
          }}>
            <button
              onClick={() => setSelectedConsultant(null)}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "none",
                border: "none",
                color: "rgba(255, 255, 255, 0.5)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0", color: "#fff" }}>
              Edit Subscription Plan
            </h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "rgba(255, 255, 255, 0.6)" }}>
              Updating plan for <strong>{selectedConsultant.name}</strong> ({selectedConsultant.company || selectedConsultant.email})
            </p>

            <form onSubmit={handleSavePlan}>
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600 }}>
                  Select Subscription Plan
                </label>
                <select
                  value={modalPlan}
                  onChange={(e) => {
                    const p = e.target.value;
                    setModalPlan(p);
                    if (p === "free") setModalMaxProjects(3);
                    else if (p === "starter") setModalMaxProjects(10);
                    else if (p === "pro") setModalMaxProjects(30);
                    else if (p === "enterprise") setModalMaxProjects(999);
                  }}
                  style={{
                    width: "100%",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#fff",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "14px",
                    outline: "none",
                  }}
                >
                  <option value="free">Free Trial (3 Projects)</option>
                  <option value="starter">Starter Plan (10 Projects)</option>
                  <option value="pro">Professional Plan (30 Projects)</option>
                  <option value="enterprise">Enterprise / Agency (Unlimited)</option>
                </select>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "13px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600 }}>
                  Custom Max Projects Quota
                </label>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={modalMaxProjects}
                  onChange={(e) => setModalMaxProjects(Number(e.target.value))}
                  style={{
                    width: "100%",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#fff",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedConsultant(null)}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "rgba(255, 255, 255, 0.7)",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  style={{
                    backgroundColor: "#10b981",
                    border: "none",
                    color: "#000",
                    fontWeight: 700,
                    padding: "8px 20px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  {savingPlan ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 360° Operations Drawer */}
      <Consultant360Drawer
        consultantId={drawerConsultantId}
        isOpen={!!drawerConsultantId}
        onClose={() => setDrawerConsultantId(null)}
        onUpdated={fetchConsultants}
      />
    </div>
  );
}
