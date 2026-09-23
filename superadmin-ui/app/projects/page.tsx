"use client";

import { useEffect, useState } from "react";
import {
  FolderKanban,
  Search,
  RefreshCw,
  Building,
  Download,
} from "lucide-react";
import { adminApi } from "../../services/api";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const fetchProjects = async (resetPage = false) => {
    setLoading(true);
    setError("");
    const targetPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    try {
      const res = await adminApi.getProjects({
        search: searchTerm,
        page: targetPage,
        limit: 20,
      });

      if (res?.success && Array.isArray(res.data)) {
        setProjects(res.data);
        if (res.pagination) setPagination(res.pagination);
      } else {
        setError("Failed to fetch platform projects.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load platform projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [page]);

  return (
    <div>
      {/* Title & Refresh */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 6px 0", color: "#f8fafc" }}>
            Platform Projects
          </h1>
          <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.6)", fontSize: "14px" }}>
            Cross-agency project visibility • Inspect active client portals and branding deliverables
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => adminApi.downloadProjectsCsv()}
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
            onClick={() => fetchProjects()}
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

      {/* Search Bar */}
      <div style={{
        backgroundColor: "rgba(13, 27, 20, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "14px",
        padding: "18px 24px",
        marginBottom: "24px",
      }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchProjects(true);
          }}
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "10px",
            padding: "8px 14px",
            flex: 1,
            gap: "10px",
          }}>
            <Search size={16} color="rgba(255, 255, 255, 0.4)" />
            <input
              type="text"
              placeholder="Search by project title or client company..."
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
              padding: "8px 18px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Projects Table */}
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
                <th style={{ padding: "14px 18px" }}>Project & Client</th>
                <th style={{ padding: "14px 18px" }}>Consultant Owner</th>
                <th style={{ padding: "14px 18px" }}>Stage</th>
                <th style={{ padding: "14px 18px" }}>Progress</th>
                <th style={{ padding: "14px 18px" }}>Portal Token</th>
                <th style={{ padding: "14px 18px" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "rgba(255, 255, 255, 0.5)" }}>
                    Loading platform projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "rgba(255, 255, 255, 0.5)" }}>
                    No projects found on the platform.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ fontWeight: 600, color: "#fff", fontSize: "14px" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <Building size={11} /> {p.company || "Direct Client"}
                      </div>
                    </td>

                    <td style={{ padding: "16px 18px" }}>
                      {p.consultant ? (
                        <div>
                          <div style={{ color: "#34d399", fontWeight: 600 }}>{p.consultant.name}</div>
                          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)" }}>
                            {p.consultant.company || p.consultant.email}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>Unassigned</span>
                      )}
                    </td>

                    <td style={{ padding: "16px 18px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 9px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: "rgba(59, 130, 246, 0.15)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "#60a5fa",
                      }}>
                        {p.stage}
                      </span>
                    </td>

                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          flex: 1,
                          height: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.1)",
                          borderRadius: "3px",
                          overflow: "hidden",
                          minWidth: "60px",
                        }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, p.progress))}%`,
                            height: "100%",
                            backgroundColor: "#10b981",
                            borderRadius: "3px",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "#34d399", fontWeight: 600 }}>
                          {p.progress}%
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: "16px 18px", fontFamily: "monospace", fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
                      {p.portalToken ? `${p.portalToken.substring(0, 16)}...` : "—"}
                    </td>

                    <td style={{ padding: "16px 18px", color: "rgba(255, 255, 255, 0.5)", fontSize: "12px" }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
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
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total projects)
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
    </div>
  );
}
