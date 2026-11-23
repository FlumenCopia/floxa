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
  Bell,
  Mail,
  AlertTriangle,
  Edit,
  Trash2,
  Calendar,
  Sparkles,
  Shield,
  Layers,
  Clock,
} from "lucide-react";
import { adminApi } from "../../services/api";
import Consultant360Drawer from "../../components/Consultant360Drawer";

export default function AdminConsultantsPage() {
  const [consultants, setConsultants] = useState<any[]>([]);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
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
    isActive: true,
    plan: "free",
    billingCycle: "monthly",
    durationMonths: 1,
    isLifetime: false,
    customMaxProjects: "",
    customMaxClients: "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string; emailDispatched?: boolean } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Edit Customer Modal State
  const [editConsultant, setEditConsultant] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    phone: "",
    isActive: true,
    plan: "free",
    billingCycle: "monthly",
    status: "active",
    currentPeriodEnd: "",
    isLifetime: false,
    customMaxProjects: "",
    customMaxClients: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete Customer Modal State
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Reset Password Modal State
  const [resetPwdConsultant, setResetPwdConsultant] = useState<any>(null);
  const [resetPwdInput, setResetPwdInput] = useState("");
  const [resettingPwd, setResettingPwd] = useState(false);
  const [resetPwdError, setResetPwdError] = useState("");

  const fetchPlans = async () => {
    try {
      const res = await adminApi.listPlans();
      if (res?.success && Array.isArray(res.data)) {
        setAvailablePlans(res.data);
      }
    } catch (err) {
      console.warn("Failed to load plans:", err);
    }
  };

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
    fetchPlans();
  }, []);

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
        showNotification(res.message || "Account status updated.");
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
        isActive: createFormData.isActive,
        plan: createFormData.plan,
        billingCycle: createFormData.billingCycle,
        durationMonths: createFormData.isLifetime ? undefined : Number(createFormData.durationMonths),
        isLifetime: createFormData.isLifetime,
        customMaxProjects: createFormData.customMaxProjects !== "" ? Number(createFormData.customMaxProjects) : null,
        customMaxClients: createFormData.customMaxClients !== "" ? Number(createFormData.customMaxClients) : null,
      });

      if (res?.success) {
        showNotification(
          res?.emailDispatched
            ? `Customer account created & credentials emailed to ${createFormData.email}`
            : `Customer account created with ${createFormData.plan.toUpperCase()} plan for ${createFormData.name}`
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
          isActive: true,
          plan: "free",
          billingCycle: "monthly",
          durationMonths: 1,
          isLifetime: false,
          customMaxProjects: "",
          customMaxClients: "",
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
    const text = `FLOXA Customer Account Credentials:\nEmail: ${createdCredentials.email}\nTemporary Password: ${createdCredentials.password}\nLogin URL: https://floxa.flumenx.in/login`;
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 3000);
  };

  const openEditModal = (consultant: any) => {
    setEditConsultant(consultant);
    setEditError("");
    const sub = consultant.subscription || {};
    const overrides = sub.customLimitOverrides || {};
    const pEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString().slice(0, 10) : "";
    setEditFormData({
      name: consultant.name || "",
      email: consultant.email || "",
      password: "",
      company: consultant.company || "",
      phone: consultant.phone || "",
      isActive: Boolean(consultant.isActive),
      plan: sub.plan || "free",
      billingCycle: sub.billingCycle || "monthly",
      status: sub.status || (consultant.isActive ? "active" : "suspended"),
      currentPeriodEnd: pEnd,
      isLifetime: !sub.currentPeriodEnd,
      customMaxProjects: overrides.maxProjects !== null && overrides.maxProjects !== undefined ? String(overrides.maxProjects) : "",
      customMaxClients: overrides.maxClients !== null && overrides.maxClients !== undefined ? String(overrides.maxClients) : "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editConsultant) return;
    setEditError("");
    setSavingEdit(true);

    try {
      const payload: any = {
        name: editFormData.name.trim(),
        email: editFormData.email.trim().toLowerCase(),
        company: editFormData.company.trim(),
        phone: editFormData.phone.trim(),
        isActive: editFormData.isActive,
        plan: editFormData.plan,
        billingCycle: editFormData.billingCycle,
        status: editFormData.status,
        isLifetime: editFormData.isLifetime,
        currentPeriodEnd: editFormData.isLifetime ? null : (editFormData.currentPeriodEnd || null),
        customMaxProjects: editFormData.customMaxProjects !== "" ? Number(editFormData.customMaxProjects) : null,
        customMaxClients: editFormData.customMaxClients !== "" ? Number(editFormData.customMaxClients) : null,
      };

      if (editFormData.password.trim()) {
        payload.password = editFormData.password.trim();
      }

      const res = await adminApi.updateConsultant(editConsultant.id, payload);
      if (res?.success) {
        showNotification(res.message || "Consultant and subscription updated successfully.");
        setEditConsultant(null);
        fetchConsultants();
      } else {
        setEditError(res?.detail || "Failed to update consultant.");
      }
    } catch (err: any) {
      setEditError(err?.message || "Failed to update consultant.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteConsultant = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const res = await adminApi.deleteConsultant(deleteTarget.id);
      if (res?.success) {
        showNotification(res.message || "Consultant deleted successfully.");
        setDeleteTarget(null);
        fetchConsultants();
      } else {
        setDeleteError(res?.detail || "Failed to delete consultant.");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete consultant.");
    } finally {
      setDeleting(false);
    }
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
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px 0", color: "#f3f8f4", letterSpacing: "-0.01em" }}>
            Consultants &amp; User Subscriptions
          </h1>
          <p style={{ margin: 0, color: "#89aca0", fontSize: "13px" }}>
            Full CRUD management: create users, assign/change dynamic subscription plans, override quotas, and configure access.
          </p>
        </div>
        <div className="admin-header-actions">
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
            <span>Add User &amp; Assign Plan</span>
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
                  <Mail size={12} />
                  <span>Credentials Emailed</span>
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
      <div
        className="admin-filter-bar"
        style={{
          backgroundColor: "rgba(6, 22, 15, 0.72)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(77, 255, 160, 0.2)",
          borderRadius: "10px",
          padding: "14px 18px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
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
            <option value="">All Plans</option>
            {availablePlans.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

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

      {/* Pending Reactivation Requests Banner */}
      {consultants.some((c) => c.reactivationRequest?.status === "pending") && (
        <div style={{
          marginBottom: "16px",
          padding: "12px 18px",
          borderRadius: "8px",
          backgroundColor: "rgba(240, 180, 41, 0.12)",
          border: "1px solid rgba(240, 180, 41, 0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          boxShadow: "0 0 16px rgba(240, 180, 41, 0.12)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#f0b429", fontWeight: 600, fontSize: "13px" }}>
            <Bell size={16} />
            <span>
              Action Required: Reactivation requested by consultant (
              {consultants
                .filter((c) => c.reactivationRequest?.status === "pending")
                .map((c) => c.email)
                .join(", ")}
              )
            </span>
          </div>
          <button
            onClick={() => {
              const pendingC = consultants.find((c) => c.reactivationRequest?.status === "pending");
              if (pendingC) setDrawerConsultantId(pendingC.id);
            }}
            style={{
              backgroundColor: "#f0b429",
              color: "#001a0e",
              border: "none",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Review &amp; Reactivate
          </button>
        </div>
      )}

      {/* Consultants Table */}
      <div style={{
        backgroundColor: "rgba(6, 22, 15, 0.72)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(77, 255, 160, 0.2)",
        borderRadius: "10px",
        overflow: "hidden",
      }}>
        <div className="admin-table-wrapper" style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{
                backgroundColor: "rgba(2, 14, 9, 0.55)",
                borderBottom: "1px solid rgba(77, 255, 160, 0.15)",
                color: "#607f72",
                textAlign: "left",
              }}>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>User / Consultant</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Subscription Plan</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quota Usage</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Expiry / Renewal</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    Loading consultants and subscriptions...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    No users found matching your criteria.
                  </td>
                </tr>
              ) : (
                consultants.map((c) => {
                  const isUpdating = togglingId === c.id;
                  const sub = c.subscription || {};
                  const planSlug = (sub.plan || "free").toLowerCase();
                  const overrides = sub.customLimitOverrides || {};
                  
                  const maxProjects = typeof overrides.maxProjects === "number" ? overrides.maxProjects : (sub.maxProjects ?? 2);
                  const maxClients = typeof overrides.maxClients === "number" ? overrides.maxClients : (sub.maxClients ?? 2);

                  const projectsUsed = c.projectsCount ?? 0;
                  const clientsUsed = c.clientsCount ?? 0;

                  const periodEndStr = sub.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })
                    : "Lifetime / No Expiry";

                  const isExpired = sub.currentPeriodEnd && new Date() > new Date(sub.currentPeriodEnd);

                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div
                          onClick={() => setDrawerConsultantId(c.id)}
                          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                          title="View agency details & 360 drawer"
                        >
                          <div style={{
                            width: "34px",
                            height: "34px",
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
                            <div style={{ fontSize: "11px", color: "#89aca0" }}>
                              {c.email}
                            </div>
                            {c.company ? (
                              <div style={{ fontSize: "10px", color: "#607f72" }}>
                                {c.company}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* Plan Badge */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            backgroundColor:
                              planSlug === "pro"
                                ? "rgba(77, 255, 160, 0.15)"
                                : planSlug === "enterprise"
                                ? "rgba(168, 85, 247, 0.15)"
                                : planSlug === "starter"
                                ? "rgba(59, 130, 246, 0.15)"
                                : "rgba(255, 255, 255, 0.08)",
                            color:
                              planSlug === "pro"
                                ? "#4dffa0"
                                : planSlug === "enterprise"
                                ? "#c084fc"
                                : planSlug === "starter"
                                ? "#60a5fa"
                                : "#9ca3af",
                            border: `1px solid ${
                              planSlug === "pro"
                                ? "rgba(77, 255, 160, 0.3)"
                                : planSlug === "enterprise"
                                ? "rgba(168, 85, 247, 0.3)"
                                : planSlug === "starter"
                                ? "rgba(59, 130, 246, 0.3)"
                                : "rgba(255, 255, 255, 0.15)"
                            }`,
                          }}>
                            <Sparkles size={11} />
                            <span>{sub.plan ? sub.plan.toUpperCase() : "FREE"}</span>
                          </span>
                          <span style={{ fontSize: "10px", color: "#607f72", textTransform: "capitalize" }}>
                            Cycle: {sub.billingCycle || "monthly"}
                          </span>
                        </div>
                      </td>

                      {/* Usage */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#e8f5ef" }}>
                            <span style={{ color: "#89aca0" }}>Projects:</span>
                            <strong style={{ color: maxProjects !== -1 && projectsUsed >= maxProjects ? "#ff6b6b" : "#4dffa0" }}>
                              {projectsUsed} / {maxProjects === -1 ? "∞" : maxProjects}
                            </strong>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#e8f5ef" }}>
                            <span style={{ color: "#89aca0" }}>Clients:</span>
                            <strong>
                              {clientsUsed} / {maxClients === -1 ? "∞" : maxClients}
                            </strong>
                          </div>
                        </div>
                      </td>

                      {/* Expiry */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: isExpired ? "#ff6b6b" : "#e8f5ef", fontSize: "12px" }}>
                          <Clock size={13} color={isExpired ? "#ff6b6b" : "#89aca0"} />
                          <span>{periodEndStr}</span>
                        </div>
                        {isExpired ? (
                          <span style={{ fontSize: "10px", color: "#ff6b6b", fontWeight: 600 }}>Plan Expired</span>
                        ) : null}
                      </td>

                      {/* Status */}
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
                        {c.reactivationRequest?.status === "pending" && (
                          <div style={{ marginTop: "4px" }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 700,
                              backgroundColor: "rgba(240, 180, 41, 0.18)",
                              color: "#f0b429",
                              border: "1px solid rgba(240, 180, 41, 0.4)",
                            }}>
                              <AlertTriangle size={11} />
                              <span>Reactivation Requested</span>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          {/* Edit Consultant & Subscription */}
                          <button
                            onClick={() => openEditModal(c)}
                            title="Edit user details & subscription"
                            style={{
                              backgroundColor: "rgba(77, 255, 160, 0.12)",
                              border: "1px solid rgba(77, 255, 160, 0.3)",
                              color: "#4dffa0",
                              padding: "5px 9px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Edit size={12} />
                            <span>Edit</span>
                          </button>

                          {/* 360 Details */}
                          <button
                            onClick={() => setDrawerConsultantId(c.id)}
                            title="Open 360 analytics & subscription history"
                            style={{
                              backgroundColor: "rgba(255, 255, 255, 0.06)",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                              color: "#e8f5ef",
                              padding: "5px 9px",
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
                            <span>360</span>
                          </button>

                          {/* Toggle Active / Suspended */}
                          <button
                            onClick={() => handleToggleStatus(c)}
                            disabled={isUpdating}
                            title={c.isActive ? "Suspend user" : "Activate user"}
                            style={{
                              backgroundColor: c.isActive ? "rgba(255, 107, 107, 0.1)" : "rgba(77, 255, 160, 0.1)",
                              border: `1px solid ${c.isActive ? "rgba(255, 107, 107, 0.25)" : "rgba(77, 255, 160, 0.25)"}`,
                              color: c.isActive ? "#ff6b6b" : "#4dffa0",
                              padding: "5px 9px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isUpdating ? "..." : c.isActive ? "Suspend" : "Activate"}
                          </button>

                          {/* Delete Account */}
                          <button
                            onClick={() => {
                              setDeleteTarget(c);
                              setDeleteError("");
                            }}
                            title="Delete customer account"
                            style={{
                              backgroundColor: "rgba(255, 107, 107, 0.08)",
                              border: "1px solid rgba(255, 107, 107, 0.25)",
                              color: "#ff6b6b",
                              padding: "5px 8px",
                              borderRadius: "5px",
                              fontSize: "11px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <Trash2 size={12} />
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
            flexWrap: "wrap",
            gap: "10px",
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

      {/* Add Customer & Assign Subscription Modal */}
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
          overflowY: "auto",
        }}>
          <div className="admin-modal-card" style={{ maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <UserPlus size={18} color="#4dffa0" />
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  Add User &amp; Assign Subscription
                </h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: "none", border: "none", color: "#89aca0", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#89aca0" }}>
              Provision an active consultant account and grant them their initial subscription plan and limits.
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
              {/* Profile Details */}
              <div style={{ fontWeight: 700, fontSize: "12px", color: "#4dffa0", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                1. Account Details
              </div>
              <div className="admin-form-grid-2">
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

              <div style={{ margin: "12px 0" }}>
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

              <div className="admin-form-grid-2" style={{ marginBottom: "16px" }}>
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
                    placeholder="+91 9876543210"
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

              {/* Subscription Assignment Section */}
              <div style={{ fontWeight: 700, fontSize: "12px", color: "#4dffa0", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid rgba(77, 255, 160, 0.15)", paddingTop: "14px" }}>
                2. Subscription Tier &amp; Plan Configuration
              </div>

              <div className="admin-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Subscription Plan Tier *
                  </label>
                  <select
                    value={createFormData.plan}
                    onChange={(e) => setCreateFormData({ ...createFormData, plan: e.target.value })}
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
                  >
                    {availablePlans.length > 0 ? (
                      availablePlans.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name} (Max {p.limits?.maxProjects === -1 ? "∞" : p.limits?.maxProjects} Projects, {p.limits?.maxClients === -1 ? "∞" : p.limits?.maxClients} Clients)
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="free">Free Starter (2 Projects, 2 Clients)</option>
                        <option value="starter">Studio Starter (5 Projects, 10 Clients)</option>
                        <option value="pro">Agency Pro (20 Projects, 50 Clients)</option>
                        <option value="enterprise">Enterprise Scale (Unlimited)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Billing Cycle
                  </label>
                  <select
                    value={createFormData.billingCycle}
                    onChange={(e) => setCreateFormData({ ...createFormData, billingCycle: e.target.value })}
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
                  >
                    <option value="monthly">Monthly Cycle</option>
                    <option value="semi_annual">Semi-Annual (6 Months)</option>
                    <option value="yearly">Yearly (12 Months)</option>
                    <option value="custom">Custom Cycle</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-grid-2" style={{ marginTop: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Validity Duration
                  </label>
                  <select
                    disabled={createFormData.isLifetime}
                    value={createFormData.durationMonths}
                    onChange={(e) => setCreateFormData({ ...createFormData, durationMonths: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: createFormData.isLifetime ? "#607f72" : "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value={1}>1 Month</option>
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>1 Year (12 Months)</option>
                    <option value={24}>2 Years</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "24px" }}>
                  <input
                    type="checkbox"
                    id="create_isLifetime"
                    checked={createFormData.isLifetime}
                    onChange={(e) => setCreateFormData({ ...createFormData, isLifetime: e.target.checked })}
                    style={{ accentColor: "#4dffa0", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="create_isLifetime" style={{ fontSize: "12px", color: "#e8f5ef", cursor: "pointer", fontWeight: 600 }}>
                    Lifetime / No Expiration Date
                  </label>
                </div>
              </div>

              {/* Quota overrides */}
              <div className="admin-form-grid-2" style={{ marginTop: "12px", marginBottom: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Custom Max Projects (optional override)
                  </label>
                  <input
                    type="number"
                    placeholder="Leave empty for plan default"
                    value={createFormData.customMaxProjects}
                    onChange={(e) => setCreateFormData({ ...createFormData, customMaxProjects: e.target.value })}
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
                    Custom Max Clients (optional override)
                  </label>
                  <input
                    type="number"
                    placeholder="Leave empty for plan default"
                    value={createFormData.customMaxClients}
                    onChange={(e) => setCreateFormData({ ...createFormData, customMaxClients: e.target.value })}
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
                  {creatingCustomer ? "Provisioning..." : "Create Account & Grant Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Customer & Subscription Modal */}
      {editConsultant ? (
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
          overflowY: "auto",
        }}>
          <div className="admin-modal-card" style={{ maxWidth: "620px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Edit size={18} color="#4dffa0" />
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f3f8f4" }}>
                  Edit Customer &amp; Manage Subscription
                </h3>
              </div>
              <button onClick={() => setEditConsultant(null)} style={{ background: "none", border: "none", color: "#89aca0", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#89aca0" }}>
              Update profile details, change subscription tiers, extend validity timelines, or override project/client limits.
            </p>

            {editError ? (
              <div style={{
                backgroundColor: "rgba(255, 107, 107, 0.12)",
                border: "1px solid rgba(255, 107, 107, 0.25)",
                color: "#ff6b6b",
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12px",
              }}>
                {editError}
              </div>
            ) : null}

            <form onSubmit={handleSaveEdit}>
              {/* Profile Details */}
              <div style={{ fontWeight: 700, fontSize: "12px", color: "#4dffa0", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                1. Customer Profile
              </div>
              <div className="admin-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
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
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
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

              <div className="admin-form-grid-2" style={{ margin: "12px 0" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Company / Agency Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.company}
                    onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
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
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
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

              <div className="admin-form-grid-2" style={{ marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Account Login Status
                  </label>
                  <select
                    value={editFormData.isActive ? "active" : "suspended"}
                    onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.value === "active" })}
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
                  >
                    <option value="active">Active (Full Portal Access)</option>
                    <option value="suspended">Suspended (Blocked from Dashboard)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Change Password (leave empty to keep unchanged)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter new password (min 8 chars)"
                    value={editFormData.password}
                    onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
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
              </div>

              {/* Subscription Management Section */}
              <div style={{ fontWeight: 700, fontSize: "12px", color: "#4dffa0", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid rgba(77, 255, 160, 0.15)", paddingTop: "14px" }}>
                2. Subscription Tier, Billing &amp; Quotas
              </div>

              <div className="admin-form-grid-2">
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Subscription Plan Tier
                  </label>
                  <select
                    value={editFormData.plan}
                    onChange={(e) => setEditFormData({ ...editFormData, plan: e.target.value })}
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
                  >
                    {availablePlans.length > 0 ? (
                      availablePlans.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name} (Max {p.limits?.maxProjects === -1 ? "∞" : p.limits?.maxProjects} Projects, {p.limits?.maxClients === -1 ? "∞" : p.limits?.maxClients} Clients)
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="free">Free Starter (2 Projects, 2 Clients)</option>
                        <option value="starter">Studio Starter (5 Projects, 10 Clients)</option>
                        <option value="pro">Agency Pro (20 Projects, 50 Clients)</option>
                        <option value="enterprise">Enterprise Scale (Unlimited)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Billing Cycle
                  </label>
                  <select
                    value={editFormData.billingCycle}
                    onChange={(e) => setEditFormData({ ...editFormData, billingCycle: e.target.value })}
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
                  >
                    <option value="monthly">Monthly Cycle</option>
                    <option value="semi_annual">Semi-Annual (6 Months)</option>
                    <option value="yearly">Yearly (12 Months)</option>
                    <option value="custom">Custom Cycle</option>
                  </select>
                </div>
              </div>

              <div className="admin-form-grid-2" style={{ marginTop: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Subscription Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
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
                  >
                    <option value="active">Active (Good standing)</option>
                    <option value="grace_period">Grace Period (5 Days renewal window)</option>
                    <option value="expired">Expired (Creation blocked)</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Expiry / Period End Date
                  </label>
                  <input
                    type="date"
                    disabled={editFormData.isLifetime}
                    value={editFormData.currentPeriodEnd}
                    onChange={(e) => setEditFormData({ ...editFormData, currentPeriodEnd: e.target.value })}
                    style={{
                      width: "100%",
                      backgroundColor: "rgba(2, 14, 9, 0.7)",
                      border: "1px solid rgba(77, 255, 160, 0.2)",
                      color: editFormData.isLifetime ? "#607f72" : "#e8f5ef",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Quick Extend Buttons & Lifetime Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "#89aca0" }}>Quick Extend:</span>
                  {[
                    { label: "+15d", days: 15 },
                    { label: "+30d", days: 30 },
                    { label: "+6m", days: 180 },
                    { label: "+1y", days: 365 },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      disabled={editFormData.isLifetime}
                      onClick={() => {
                        const base = editFormData.currentPeriodEnd ? new Date(editFormData.currentPeriodEnd) : new Date();
                        base.setDate(base.getDate() + btn.days);
                        setEditFormData({ ...editFormData, currentPeriodEnd: base.toISOString().slice(0, 10), isLifetime: false });
                      }}
                      style={{
                        backgroundColor: "rgba(77, 255, 160, 0.1)",
                        border: "1px solid rgba(77, 255, 160, 0.25)",
                        color: "#4dffa0",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: editFormData.isLifetime ? "not-allowed" : "pointer",
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="edit_isLifetime"
                    checked={editFormData.isLifetime}
                    onChange={(e) => setEditFormData({ ...editFormData, isLifetime: e.target.checked })}
                    style={{ accentColor: "#4dffa0", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="edit_isLifetime" style={{ fontSize: "12px", color: "#e8f5ef", cursor: "pointer", fontWeight: 600 }}>
                    Lifetime / No Expiration
                  </label>
                </div>
              </div>

              {/* Custom Overrides */}
              <div className="admin-form-grid-2" style={{ marginTop: "14px", marginBottom: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#89aca0", marginBottom: "4px", fontWeight: 600 }}>
                    Custom Max Projects (Leave empty for plan default)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 50 (-1 for unlimited)"
                    value={editFormData.customMaxProjects}
                    onChange={(e) => setEditFormData({ ...editFormData, customMaxProjects: e.target.value })}
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
                    Custom Max Clients (Leave empty for plan default)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 100 (-1 for unlimited)"
                    value={editFormData.customMaxClients}
                    onChange={(e) => setEditFormData({ ...editFormData, customMaxClients: e.target.value })}
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
                  onClick={() => setEditConsultant(null)}
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
                  disabled={savingEdit}
                  style={{
                    backgroundColor: "#4dffa0",
                    border: "none",
                    color: "#001a0e",
                    fontWeight: 700,
                    padding: "8px 18px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: savingEdit ? "not-allowed" : "pointer",
                    opacity: savingEdit ? 0.7 : 1,
                  }}
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteTarget ? (
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
            backgroundColor: "#160707",
            border: "1px solid rgba(255, 107, 107, 0.4)",
            borderRadius: "10px",
            width: "100%",
            maxWidth: "460px",
            padding: "22px",
            position: "relative",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
          }}>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "#ff8585",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Trash2 size={18} color="#ff6b6b" />
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#ff8585" }}>
                Delete Customer Account
              </h3>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#fca5a5", lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})?
              All associated projects will be safely archived and their portal login will be permanently revoked. This action cannot be undone.
            </p>

            {deleteError ? (
              <div style={{
                backgroundColor: "rgba(255, 107, 107, 0.2)",
                border: "1px solid rgba(255, 107, 107, 0.4)",
                color: "#ff6b6b",
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "14px",
                fontSize: "12px",
              }}>
                {deleteError}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "none",
                  color: "#e8f5ef",
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
                type="button"
                onClick={handleDeleteConsultant}
                disabled={deleting}
                style={{
                  backgroundColor: "#ff4d4d",
                  border: "none",
                  color: "#ffffff",
                  fontWeight: 700,
                  padding: "8px 18px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
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
