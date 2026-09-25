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

  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const fetchProjects = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await adminApi.getProjects({
        search: searchTerm,
        page: page,
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      fetchProjects();
    } else {
      setPage(1);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    setError("");
    try {
      await adminApi.downloadProjectsCsv();
    } catch (err: any) {
      setError(err?.message || "Failed to download platform projects CSV export.");
    } finally {
      setDownloadingCsv(false);
    }
  };

  return (
    <div>
      {/* Title & Refresh */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px 0", color: "#f3f8f4", letterSpacing: "-0.01em" }}>
            Platform Projects
          </h1>
          <p style={{ margin: 0, color: "#89aca0", fontSize: "13px" }}>
            Monitor active branding deliverables and client portal progress across all agency workspaces.
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
            onClick={() => fetchProjects()}
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

      {error ? (
        <div style={{
          backgroundColor: "rgba(255, 107, 107, 0.12)",
          border: "1px solid rgba(255, 107, 107, 0.25)",
          color: "#ff6b6b",
          padding: "14px 18px",
          borderRadius: "8px",
          marginBottom: "20px",
          fontSize: "13px",
        }}>
          {error}
        </div>
      ) : null}

      {/* Search Bar */}
      <div style={{
        backgroundColor: "rgba(6, 22, 15, 0.72)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(77, 255, 160, 0.2)",
        borderRadius: "10px",
        padding: "14px 18px",
        marginBottom: "18px",
      }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(2, 14, 9, 0.6)",
            border: "1px solid rgba(77, 255, 160, 0.15)",
            borderRadius: "6px",
            padding: "8px 12px",
            flex: 1,
            gap: "8px",
          }}>
            <Search size={14} color="#607f72" />
            <input
              type="text"
              placeholder="Search by project title or client company..."
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
      </div>

      {/* Projects Table */}
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
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Project & Client</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Consultant Owner</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Stage</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Progress</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Portal Token</th>
                <th style={{ padding: "12px 16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    Loading platform projects...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#607f72" }}>
                    No projects found on the platform.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#e8f5ef", fontSize: "13px" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "#607f72", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <Building size={11} /> {p.company || "Direct Client"}
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      {p.consultant ? (
                        <div>
                          <div style={{ color: "#4dffa0", fontWeight: 600 }}>{p.consultant.name}</div>
                          <div style={{ fontSize: "11px", color: "#607f72" }}>
                            {p.consultant.company || p.consultant.email}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#607f72" }}>Unassigned</span>
                      )}
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: "rgba(74, 158, 255, 0.12)",
                        border: "1px solid rgba(74, 158, 255, 0.25)",
                        color: "#4a9eff",
                      }}>
                        {p.stage}
                      </span>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          flex: 1,
                          height: "5px",
                          backgroundColor: "rgba(255, 255, 255, 0.08)",
                          borderRadius: "3px",
                          overflow: "hidden",
                          minWidth: "60px",
                        }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, p.progress))}%`,
                            height: "100%",
                            backgroundColor: "#4dffa0",
                            borderRadius: "3px",
                          }} />
                        </div>
                        <span style={{ fontSize: "11px", color: "#4dffa0", fontWeight: 700 }}>
                          {p.progress}%
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: "11px", color: "#89aca0" }}>
                      {p.portalToken ? `${p.portalToken.substring(0, 16)}...` : "—"}
                    </td>

                    <td style={{ padding: "14px 16px", color: "#607f72", fontSize: "11px" }}>
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
            padding: "12px 18px",
            borderTop: "1px solid rgba(77, 255, 160, 0.12)",
            fontSize: "12px",
            color: "#607f72",
          }}>
            <div>
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total projects)
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
    </div>
  );
}
