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
  UserPlus,
  Key,
  Copy,
  CheckCircle2,
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  // Drawer State
  const [drawerConsultantId, setDrawerConsultantId] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Add Customer Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    phone: "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string; emailDispatched?: boolean } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Reset Password Modal State
  const [resetPwdConsultant, setResetPwdConsultant] = useState<any>(null);
  const [resetPwdInput, setResetPwdInput] = useState("");
  const [resettingPwd, setResettingPwd] = useState(false);
  const [resetPwdError, setResetPwdError] = useState("");

  const fetchConsultants = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await adminApi.getConsultants({
        search: searchTerm,
        status: statusFilter,
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
  }, [page, statusFilter]);

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



  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateFormData((prev) => ({ ...prev, password: pwd }));
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (!createFormData.name.trim()) {
      setCreateError("Customer name is required.");
      return;
    }
    if (!createFormData.email.trim()) {
      setCreateError("Customer email is required.");
      return;
    }
    if (!createFormData.password.trim() || createFormData.password.length < 8) {
      setCreateError("Temporary password must be at least 8 characters.");
      return;
    }

    setCreatingCustomer(true);
    try {
      const res = await adminApi.createConsultant({
        name: createFormData.name.trim(),
        email: createFormData.email.trim().toLowerCase(),
        password: createFormData.password.trim(),
        company: createFormData.company.trim(),
        phone: createFormData.phone.trim(),
      });

      if (res?.success) {
        showNotification(
          res?.emailDispatched
            ? `Customer account added & credentials emailed to ${createFormData.email}`
            : `Customer account added for ${createFormData.name}`
        );
        setCreatedCredentials({
          name: createFormData.name,
          email: createFormData.email.trim().toLowerCase(),
          password: createFormData.password,
          emailDispatched: Boolean(res?.emailDispatched),
        });
        setCreateFormData({
          name: "",
          email: "",
          password: "",
          company: "",
          phone: "",
        });
        setIsCreateModalOpen(false);
        fetchConsultants();
      } else {
        setCreateError(res?.detail || "Failed to create customer account.");
      }
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create customer account.");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const copyCredentials = () => {
    if (!createdCredentials) return;
    const text = `FLOXA Customer Account Credentials:\nEmail: ${createdCredentials.email}\nTemporary Password: ${createdCredentials.password}\nLogin URL: http://localhost:3000/login`;
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 3000);
  };

  const openResetPwdModal = (consultant: any) => {
    setResetPwdConsultant(consultant);
    setResetPwdError("");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPwdInput(pwd);
  };

  const handleSaveResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdConsultant) return;
    if (!resetPwdInput.trim() || resetPwdInput.trim().length < 8) {
      setResetPwdError("Password must be at least 8 characters.");
      return;
    }

    setResettingPwd(true);
    setResetPwdError("");
    try {
      const res = await adminApi.resetConsultantPassword(resetPwdConsultant.id, resetPwdInput.trim());
      if (res?.success) {
        showNotification(
          res?.emailDispatched
            ? `Password reset and emailed to ${resetPwdConsultant.email}`
            : `Password reset for ${resetPwdConsultant.name}`
        );
        setCreatedCredentials({
          name: resetPwdConsultant.name,
          email: resetPwdConsultant.email,
          password: resetPwdInput.trim(),
          emailDispatched: Boolean(res?.emailDispatched),
        });
        setResetPwdConsultant(null);
      } else {
        setResetPwdError(res?.detail || "Failed to reset password.");
      }
    } catch (err: any) {
      setResetPwdError(err?.message || "Failed to reset password.");
    } finally {
      setResettingPwd(false);
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
            Manage customer accounts, monitor active projects, and configure access.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => {
              setIsCreateModalOpen(true);
              setCreateError("");
              generateRandomPassword();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#4dffa0",
              border: "none",
              color: "#001a0e",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <UserPlus size={15} />
            <span>Add Customer</span>
          </button>
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

      {/* Newly Created Credentials Banner */}
      {createdCredentials ? (
        <div style={{
          backgroundColor: "rgba(77, 255, 160, 0.08)",
          border: "1px solid rgba(77, 255, 160, 0.4)",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#4dffa0", fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
              <CheckCircle2 size={16} />
              <span>Customer Account: {createdCredentials.name}</span>
              {createdCredentials.emailDispatched ? (
                <span style={{
                  fontSize: "11px",
                  backgroundColor: "rgba(77, 255, 160, 0.15)",
                  border: "1px solid rgba(77, 255, 160, 0.3)",
                  color: "#4dffa0",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  ✉ Credentials Emailed
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: "13px", color: "#e8f5ef", display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <span><strong>Email:</strong> {createdCredentials.email}</span>
              <span><strong>Temporary Password:</strong> <code style={{ backgroundColor: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: "4px", color: "#4dffa0" }}>{createdCredentials.password}</code></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={copyCredentials}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: copiedPass ? "#4dffa0" : "rgba(77, 255, 160, 0.15)",
                border: "1px solid rgba(77, 255, 160, 0.3)",
                color: copiedPass ? "#001a0e" : "#4dffa0",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Copy size={13} />
              <span>{copiedPass ? "Copied to Clipboard!" : "Copy Credentials"}</span>
            </button>
            <button
              onClick={() => setCreatedCredentials(null)}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "#89aca0",
                padding: "6px",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

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
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    Loading consultants list...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
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

      {/* Add Customer Modal */}
      {isCreateModalOpen ? (
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
            border: "1px solid rgba(77, 255, 160, 0.25)",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "520px",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            position: "relative",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <UserPlus size={18} color="#4dffa0" />
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                Add Customer
              </h3>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#89aca0" }}>
              Create an active customer account and set their temporary credentials.
            </p>

            {createError ? (
              <div style={{
                backgroundColor: "rgba(255, 107, 107, 0.12)",
                border: "1px solid rgba(255, 107, 107, 0.25)",
                color: "#ff6b6b",
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12px",
              }}>
                {createError}
              </div>
            ) : null}

            <form onSubmit={handleCreateCustomer}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Jenkins"
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sarah@agency.com"
                    value={createFormData.email}
                    onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "11px", color: "#89aca0", fontWeight: 600 }}>
                    Temporary Password * (min 8 chars)
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
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
                  placeholder="Min 8 characters"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                  style={{
                    width: "100%",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.2)",
                    color: "#e8f5ef",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Company / Agency Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Digital"
                    value={createFormData.company}
                    onChange={(e) => setCreateFormData({ ...createFormData, company: e.target.value })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    value={createFormData.phone}
                    onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    border: "none",
                    color: "#89aca0",
                    padding: "8px 16px",
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
                  disabled={creatingCustomer}
                  style={{
                    backgroundColor: "#4dffa0",
                    border: "none",
                    color: "#001a0e",
                    fontWeight: 700,
                    padding: "8px 18px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: creatingCustomer ? "not-allowed" : "pointer",
                    opacity: creatingCustomer ? 0.7 : 1,
                  }}
                >
                  {creatingCustomer ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reset Password Modal */}
      {resetPwdConsultant ? (
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
              onClick={() => setResetPwdConsultant(null)}
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

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Key size={17} color="#4dffa0" />
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                Reset Customer Password
              </h3>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#89aca0" }}>
              Setting a new temporary password for <strong>{resetPwdConsultant.name}</strong> ({resetPwdConsultant.email})
            </p>

            {resetPwdError ? (
              <div style={{
                backgroundColor: "rgba(255, 107, 107, 0.12)",
                border: "1px solid rgba(255, 107, 107, 0.25)",
                color: "#ff6b6b",
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12px",
              }}>
                {resetPwdError}
              </div>
            ) : null}

            <form onSubmit={handleSaveResetPwd}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "11px", color: "#89aca0", fontWeight: 600 }}>
                    New Temporary Password (min 8 chars)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
                      let pwd = "";
                      for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
                      setResetPwdInput(pwd);
                    }}
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
                  placeholder="Min 8 characters"
                  value={resetPwdInput}
                  onChange={(e) => setResetPwdInput(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "rgba(2, 14, 9, 0.7)",
                    border: "1px solid rgba(77, 255, 160, 0.2)",
                    color: "#e8f5ef",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setResetPwdConsultant(null)}
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
                  disabled={resettingPwd}
                  style={{
                    backgroundColor: "#4dffa0",
                    border: "none",
                    color: "#001a0e",
                    fontWeight: 700,
                    padding: "7px 16px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: resettingPwd ? "not-allowed" : "pointer",
                    opacity: resettingPwd ? 0.7 : 1,
                  }}
                >
                  {resettingPwd ? "Updating..." : "Update Password"}
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
