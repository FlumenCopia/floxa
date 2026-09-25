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

  // Drawer State
  const [drawerConsultantId, setDrawerConsultantId] = useState<string | null>(null);

  // Plan Edit Modal
  const [selectedConsultant, setSelectedConsultant] = useState<any>(null);
  const [modalPlan, setModalPlan] = useState("starter");
  const [modalMaxProjects, setModalMaxProjects] = useState(10);
  const [savingPlan, setSavingPlan] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const fetchConsultants = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await adminApi.getConsultants({
        search: searchTerm,
        status: statusFilter,
        plan: planFilter,
        page: page,
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      fetchConsultants();
    } else {
      setPage(1);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    setError("");
    try {
      await adminApi.downloadConsultantsCsv();
    } catch (err: any) {
      setError(err?.message || "Failed to download consultants CSV export.");
    } finally {
      setDownloadingCsv(false);
    }
  };

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px 0", color: "#f3f8f4", letterSpacing: "-0.01em" }}>
            Consultants & Agencies
          </h1>
          <p style={{ margin: 0, color: "#89aca0", fontSize: "13px" }}>
            Manage agency accounts, monitor subscription plans, and configure project quotas.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={handleDownloadCsv}
            disabled={downloadingCsv}
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
              cursor: downloadingCsv ? "not-allowed" : "pointer",
              opacity: downloadingCsv ? 0.7 : 1,
            }}
          >
            <Download size={14} style={{ color: "#4dffa0" }} />
            <span>{downloadingCsv ? "Exporting..." : "Export CSV"}</span>
          </button>
          <button
            onClick={() => fetchConsultants()}
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
            }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} style={{ color: "#4dffa0" }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successMsg ? (
        <div style={{
          backgroundColor: "rgba(77, 255, 160, 0.12)",
          border: "1px solid rgba(77, 255, 160, 0.3)",
          color: "#4dffa0",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "18px",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <Check size={15} />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {error ? (
        <div style={{
          backgroundColor: "rgba(255, 107, 107, 0.12)",
          border: "1px solid rgba(255, 107, 107, 0.25)",
          color: "#ff6b6b",
          padding: "14px 18px",
          borderRadius: "8px",
          marginBottom: "18px",
          fontSize: "13px",
        }}>
          {error}
        </div>
      ) : null}

      {/* Filter and Search */}
      <div style={{
        backgroundColor: "rgba(6, 22, 15, 0.72)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(77, 255, 160, 0.2)",
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(2, 14, 9, 0.6)",
            border: "1px solid rgba(77, 255, 160, 0.15)",
            borderRadius: "6px",
            padding: "8px 12px",
            width: "100%",
            gap: "8px",
          }}>
            <Search size={14} color="#607f72" />
            <input
              type="text"
              placeholder="Search by name, email, or agency..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "none",
                border: "none",
                color: "#e8f5ef",
                outline: "none",
                fontSize: "13px",
                width: "100%",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              backgroundColor: "rgba(77, 255, 160, 0.12)",
              border: "1px solid rgba(77, 255, 160, 0.3)",
              color: "#4dffa0",
              borderRadius: "6px",
              padding: "8px 14px",
              fontWeight: 600,
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              color: "#e8f5ef",
              padding: "7px 12px",
              borderRadius: "6px",
              fontSize: "12px",
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
              backgroundColor: "rgba(2, 14, 9, 0.6)",
              border: "1px solid rgba(77, 255, 160, 0.15)",
              color: "#e8f5ef",
              padding: "7px 12px",
              borderRadius: "6px",
              fontSize: "12px",
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
        backgroundColor: "rgba(6, 22, 15, 0.72)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(77, 255, 160, 0.2)",
        borderRadius: "10px",
        overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{
                backgroundColor: "rgba(2, 14, 9, 0.55)",
                borderBottom: "1px solid rgba(77, 255, 160, 0.15)",
                color: "#607f72",
                textAlign: "left",
              }}>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Consultant</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Agency / Company</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Plan Tier</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    Loading consultants list...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    No consultants found matching your criteria.
                  </td>
                </tr>
              ) : (
                consultants.map((c) => {
                  const isUpdating = togglingId === c.id;
                  const plan = c.subscription?.plan || "free";
                  const maxProjects = c.subscription?.maxProjects ?? 5;

                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div
                          onClick={() => setDrawerConsultantId(c.id)}
                          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                          title="View agency details"
                        >
                          <div style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            backgroundColor: "rgba(77, 255, 160, 0.12)",
                            border: "1px solid rgba(77, 255, 160, 0.3)",
                            color: "#4dffa0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "12px",
                            flexShrink: 0,
                          }}>
                            {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "#e8f5ef", fontSize: "13px" }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "#607f72" }}>
                              {c.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#89aca0", fontWeight: 500 }}>
                        {c.company || "Independent Consultant"}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            backgroundColor:
                              plan === "enterprise"
                                ? "rgba(240, 180, 41, 0.12)"
                                : plan === "pro"
                                  ? "rgba(77, 255, 160, 0.12)"
                                  : plan === "starter"
                                    ? "rgba(74, 158, 255, 0.12)"
                                    : "rgba(255, 255, 255, 0.08)",
                            color:
                              plan === "enterprise"
                                ? "#f0b429"
                                : plan === "pro"
                                  ? "#4dffa0"
                                  : plan === "starter"
                                    ? "#4a9eff"
                                    : "#89aca0",
                            border: `1px solid ${
                              plan === "enterprise"
                                ? "rgba(240, 180, 41, 0.25)"
                                : plan === "pro"
                                  ? "rgba(77, 255, 160, 0.25)"
                                  : plan === "starter"
                                    ? "rgba(74, 158, 255, 0.25)"
                                    : "rgba(255, 255, 255, 0.08)"
                            }`,
                          }}>
                            {plan}
                          </span>
                          <span style={{ fontSize: "10px", color: "#607f72" }}>
                            Limit: {maxProjects >= 999 ? "Unlimited" : `${maxProjects} proj`}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e8f5ef", fontWeight: 600 }}>
                          <FolderKanban size={13} color="#4dffa0" />
                          <span>{c.projectsCount ?? 0}</span>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: c.isActive ? "rgba(77, 255, 160, 0.1)" : "rgba(255, 107, 107, 0.1)",
                          color: c.isActive ? "#4dffa0" : "#ff6b6b",
                          border: `1px solid ${c.isActive ? "rgba(77, 255, 160, 0.25)" : "rgba(255, 107, 107, 0.25)"}`,
                        }}>
                          <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: c.isActive ? "#4dffa0" : "#ff6b6b", display: "inline-block" }} />
                          {c.isActive ? "Active" : "Suspended"}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={() => setDrawerConsultantId(c.id)}
                            style={{
                              backgroundColor: "rgba(77, 255, 160, 0.08)",
                              border: "1px solid rgba(77, 255, 160, 0.25)",
                              color: "#4dffa0",
                              padding: "5px 10px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>

                          <button
                            onClick={() => handleToggleStatus(c)}
                            disabled={isUpdating}
                            style={{
                              backgroundColor: c.isActive ? "rgba(255, 107, 107, 0.1)" : "rgba(77, 255, 160, 0.1)",
                              border: `1px solid ${c.isActive ? "rgba(255, 107, 107, 0.25)" : "rgba(77, 255, 160, 0.25)"}`,
                              color: c.isActive ? "#ff6b6b" : "#4dffa0",
                              padding: "5px 10px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isUpdating ? "Saving..." : c.isActive ? "Suspend" : "Activate"}
                          </button>

                          <button
                            onClick={() => openPlanModal(c)}
                            style={{
                              backgroundColor: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              color: "#89aca0",
                              padding: "5px 10px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Sliders size={11} />
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
            padding: "12px 18px",
            borderTop: "1px solid rgba(77, 255, 160, 0.12)",
            fontSize: "12px",
            color: "#607f72",
          }}>
            <div>
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total consultants)
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  backgroundColor: "rgba(2, 14, 9, 0.6)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  color: page <= 1 ? "#4a6b5e" : "#e8f5ef",
                  padding: "5px 10px",
                  borderRadius: "4px",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontSize: "11px",
                }}
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  backgroundColor: "rgba(2, 14, 9, 0.6)",
                  border: "1px solid rgba(77, 255, 160, 0.15)",
                  color: page >= pagination.totalPages ? "#4a6b5e" : "#e8f5ef",
                  padding: "5px 10px",
                  borderRadius: "4px",
                  cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
                  fontSize: "11px",
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
            backgroundColor: "#06160f",
            border: "1px solid rgba(77, 255, 160, 0.3)",
            borderRadius: "10px",
            width: "100%",
            maxWidth: "460px",
            padding: "22px",
            position: "relative",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
          }}>
            <button
              onClick={() => setSelectedConsultant(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "#607f72",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 4px 0", color: "#f3f8f4" }}>
              Edit Subscription Plan
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#89aca0" }}>
              Updating plan for <strong>{selectedConsultant.name}</strong> ({selectedConsultant.company || selectedConsultant.email})
            </p>

            <form onSubmit={handleSavePlan}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "6px", fontWeight: 600 }}>
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
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.2)",
                    color: "#e8f5ef",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none",
                  }}
                >
                  <option value="free">Free Trial (3 Projects)</option>
                  <option value="starter">Starter Plan (10 Projects)</option>
                  <option value="pro">Professional Plan (30 Projects)</option>
                  <option value="enterprise">Enterprise / Agency (Unlimited)</option>
                </select>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "6px", fontWeight: 600 }}>
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
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.2)",
                    color: "#e8f5ef",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedConsultant(null)}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    border: "none",
                    color: "#89aca0",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlan}
                  style={{
                    backgroundColor: "#4dffa0",
                    border: "none",
                    color: "#001a0e",
                    fontWeight: 700,
                    padding: "7px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
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

      {/* Agency Details Drawer */}
      <Consultant360Drawer
        consultantId={drawerConsultantId}
        isOpen={!!drawerConsultantId}
        onClose={() => setDrawerConsultantId(null)}
        onUpdated={fetchConsultants}
      />
    </div>
  );
}
