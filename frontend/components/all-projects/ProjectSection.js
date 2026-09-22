"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getProjects, getConsultantActivities, markProjectActivitiesRead } from "@/lib/projectApi";
import { supportSocket } from "@/services/supportSocketService";
import { useRouter, useSearchParams } from "next/navigation";
import ProjectCreateWizard from "../dashboard/ProjectCreateWizard";
import { ChevronDown, Plus } from "lucide-react";

export const statusOptions = [
  "All statuses",
  "Created",
  "Discovery",
  "Advance Payment",
  "Advance Paid",
  "Brand DNA",
  "Moodboards",
  "Concepts",
  "Agreement",
  "Deliverables",
  "Final Paid",
  "Delivered",
];
export function getStatusLabel(status) {
  const labels = {
    created: "Created",
    discovery: "Discovery",
    advance_payment: "Advance Payment",
    advance_paid: "Advance Paid",
    brand_dna: "Brand DNA",
    moodboards: "Moodboards",
    concepts: "Concepts",
    agreement: "Agreement",
    deliverables: "Deliverables",
    final_paid: "Final Paid",
    delivered: "Delivered",
    archived: "Archived",
  };

  return labels[status] || status;
}

export function getStatusClass(status) {
  const classes = {
    created: "badge-muted",
    discovery: "badge-amber",
    advance_payment: "badge-amber",
    advance_paid: "badge-green",
    brand_dna: "badge-blue",
    moodboards: "badge-blue",
    concepts: "badge-blue",
    agreement: "badge-amber",
    deliverables: "badge-green",
    final_paid: "badge-green",
    delivered: "badge-green",
    archived: "badge-muted",
  };

  return classes[status] || "badge-muted";
}

const statusByLabel = {
  Created: "created",
  Discovery: "discovery",
  "Advance Payment": "advance_payment",
  "Advance Paid": "advance_paid",
  "Brand DNA": "brand_dna",
  Moodboards: "moodboards",
  Concepts: "concepts",
  Agreement: "agreement",
  Deliverables: "deliverables",
  "Final Paid": "final_paid",
  Delivered: "delivered",
  Archived: "archived",
};

export function getStatusClassByLabel(label) {
  return getStatusClass(statusByLabel[label]);
}

export function getStatusColorByLabel(label) {
  const colors = {
    "badge-muted": "#7ea092",
    "badge-amber": "#f0b429",
    "badge-green": "#4dffa0",
    "badge-blue": "#4a9eff",
  };

  return colors[getStatusClassByLabel(label)] || colors["badge-muted"];
}

const PROJECT_PAGE_SIZE = 12;

export default function ProjectSection({ isWizardOpen = false, setIsWizardOpen = () => {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectSearch = (searchParams.get("search") || "").trim();

  const [projects, setProjects] = useState([]);
  const [projectNotifications, setProjectNotifications] = useState({});
  const [projectCount, setProjectCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [projectError, setProjectError] = useState("");

  const requestIdRef = useRef(0);
  const loadMoreSentinelRef = useRef(null);

  const [prevFilters, setPrevFilters] = useState({ search: projectSearch, status: selectedStatus });
  if (prevFilters.search !== projectSearch || prevFilters.status !== selectedStatus) {
    setPrevFilters({ search: projectSearch, status: selectedStatus });
    setIsLoadingInitial(true);
    setIsLoadingMore(false);
    setProjectError("");
    setCurrentPage(1);
  }

  // Load Initial Page (Page 1) on Search or Status Filter Change
  useEffect(() => {
    let isMounted = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function loadFirstPage() {
      try {
        const data = await getProjects({
          search: projectSearch,
          status: statusByLabel[selectedStatus] || "",
          page: 1,
          pageSize: PROJECT_PAGE_SIZE,
        });

        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }

        const initialProjects = Array.isArray(data.results) ? data.results : [];
        const total = Number(data.count || 0);

        setProjects(initialProjects);
        setProjectNotifications((prev) => {
          const next = { ...prev };
          for (const p of initialProjects) {
            const pId = String(p.id);
            const existing = next[pId];
            next[pId] = {
              hasHelp: existing?.hasHelp !== undefined ? existing.hasHelp : Boolean(p.has_help_request),
              helpInfo: existing?.helpInfo !== undefined ? existing.helpInfo : (p.help_request || null),
              unreadCount: existing?.unreadCount !== undefined ? existing.unreadCount : (p.unread_count || 0),
              latestActivity: existing?.latestActivity !== undefined ? existing.latestActivity : (p.latest_activity || null),
            };
          }
          return next;
        });
        setProjectCount(total);
        setHasMore(Boolean(data.has_more ?? data.next ?? (initialProjects.length < total)));
      } catch (error) {
        if (!isMounted || requestId !== requestIdRef.current) {
          return;
        }

        console.error("Failed to load projects:", error);
        setProjectError(error?.detail || "Projects could not be loaded.");
        setProjects([]);
        setProjectCount(0);
        setHasMore(false);
      } finally {
        if (isMounted && requestId === requestIdRef.current) {
          setIsLoadingInitial(false);
        }
      }
    }

    loadFirstPage();

    return () => {
      isMounted = false;
    };
  }, [projectSearch, selectedStatus]);

  // Load Next Page for Infinite Scrolling
  const loadNextPage = useCallback(async () => {
    if (isLoadingInitial || isLoadingMore || !hasMore) {
      return;
    }

    const nextPage = currentPage + 1;
    const requestId = requestIdRef.current;
    setIsLoadingMore(true);

    try {
      const data = await getProjects({
        search: projectSearch,
        status: statusByLabel[selectedStatus] || "",
        page: nextPage,
        pageSize: PROJECT_PAGE_SIZE,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const newProjects = Array.isArray(data.results) ? data.results : [];
      const total = Number(data.count || 0);

      setProjects((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const filteredNew = newProjects.filter((p) => !existingIds.has(p.id));
        return [...prev, ...filteredNew];
      });

      setProjectNotifications((prev) => {
        const next = { ...prev };
        for (const p of newProjects) {
          const pId = String(p.id);
          const existing = next[pId];
          next[pId] = {
            hasHelp: existing?.hasHelp !== undefined ? existing.hasHelp : Boolean(p.has_help_request),
            helpInfo: existing?.helpInfo !== undefined ? existing.helpInfo : (p.help_request || null),
            unreadCount: existing?.unreadCount !== undefined ? existing.unreadCount : (p.unread_count || 0),
            latestActivity: existing?.latestActivity !== undefined ? existing.latestActivity : (p.latest_activity || null),
          };
        }
        return next;
      });

      setProjectCount(total);
      setCurrentPage(nextPage);
      setHasMore(Boolean(data.has_more ?? data.next ?? (projects.length + newProjects.length < total)));
    } catch (error) {
      console.error("Failed to load more projects:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentPage, hasMore, isLoadingInitial, isLoadingMore, projectSearch, projects.length, selectedStatus]);

  // Synchronize Unread Activities and Live WebSocket Notifications
  useEffect(() => {
    let isMounted = true;

    async function syncActivities() {
      try {
        const activities = await getConsultantActivities();
        if (!isMounted || !Array.isArray(activities)) return;

        const unread = activities.filter((a) => !a.is_read && a.actor_type !== "consultant");
        setProjectNotifications((prev) => {
          const next = { ...prev };
          for (const act of unread) {
            const pId = String(act.project_id || act.project || act.metadata?.project_id || "");
            if (!pId) continue;
            if (!next[pId]) {
              next[pId] = { hasHelp: false, helpInfo: null, unreadCount: 0, latestActivity: null };
            }
            next[pId].unreadCount = (next[pId].unreadCount || 0) + 1;
            if (!next[pId].latestActivity) {
              next[pId].latestActivity = {
                action: act.action,
                description: act.description,
                created_at: act.created_at,
              };
            }
            if (act.action === "client_help_requested") {
              next[pId].hasHelp = true;
              next[pId].helpInfo = {
                question: act.metadata?.question || act.description,
                page_id: act.metadata?.page_id || "Step",
                requested_at: act.created_at,
              };
            }
          }
          return next;
        });
      } catch {
        // ignore
      }
    }

    syncActivities();

    const unsubHelpReq = supportSocket.on("help_requested", (data) => {
      if (!isMounted || !data?.project_id) return;
      const pId = String(data.project_id);
      setProjectNotifications((prev) => ({
        ...prev,
        [pId]: {
          ...(prev[pId] || {}),
          hasHelp: true,
          helpInfo: {
            question: data.question || "Client requested help",
            page_id: data.page_id || "Step",
            requested_at: data.requested_at || new Date().toISOString(),
          },
          unreadCount: ((prev[pId]?.unreadCount) || 0) + 1,
          latestActivity: {
            action: "client_help_requested",
            description: `💬 ${data.client_name || "Client"} needs help: "${data.question || ""}"`,
            created_at: new Date().toISOString(),
          },
        },
      }));
    });

    const unsubHelpRes = supportSocket.on("help_resolved", (data) => {
      if (!isMounted || !data?.project_id) return;
      const pId = String(data.project_id);
      setProjectNotifications((prev) => {
        if (!prev[pId]) return prev;
        return {
          ...prev,
          [pId]: {
            ...prev[pId],
            hasHelp: false,
            helpInfo: null,
            unreadCount: Math.max(0, (prev[pId].unreadCount || 1) - 1),
          },
        };
      });
    });

    const unsubNotif = supportSocket.on("notification", (act) => {
      if (!isMounted || !act) return;
      const pId = String(act.project_id || act.project || act.metadata?.project_id || "");
      if (!pId) return;

      if (act.action === "client_help_resolved" || act.is_read) {
        setProjectNotifications((prev) => {
          if (!prev[pId]) return prev;
          return {
            ...prev,
            [pId]: {
              ...prev[pId],
              hasHelp: act.action === "client_help_resolved" ? false : prev[pId].hasHelp,
              unreadCount: Math.max(0, (prev[pId].unreadCount || 1) - 1),
            },
          };
        });
      } else if (act.actor_type !== "consultant" && !act.is_read) {
        setProjectNotifications((prev) => ({
          ...prev,
          [pId]: {
            ...(prev[pId] || {}),
            hasHelp: act.action === "client_help_requested" ? true : (prev[pId]?.hasHelp || false),
            helpInfo: act.action === "client_help_requested"
              ? { question: act.metadata?.question || act.description, page_id: act.metadata?.page_id || "Step", requested_at: act.created_at }
              : (prev[pId]?.helpInfo || null),
            unreadCount: ((prev[pId]?.unreadCount) || 0) + 1,
            latestActivity: {
              action: act.action,
              description: act.description,
              created_at: act.created_at,
            },
          },
        }));
      }
    });

    const unsubProjectRead = supportSocket.on("project_read", (data) => {
      if (!isMounted || !data?.projectId) return;
      const pId = String(data.projectId);
      setProjectNotifications((prev) => ({
        ...prev,
        [pId]: {
          ...(prev[pId] || {}),
          hasHelp: false,
          helpInfo: null,
          unreadCount: 0,
        },
      }));
      setProjects((prev) =>
        prev.map((p) =>
          String(p.id) === pId
            ? { ...p, has_help_request: false, help_request: null, unread_count: 0 }
            : p
        )
      );
    });

    return () => {
      isMounted = false;
      unsubHelpReq();
      unsubHelpRes();
      unsubProjectRead();
      unsubNotif();
    };
  }, []);

  // IntersectionObserver for Infinite Scroll Sentinel
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingInitial && !isLoadingMore) {
          loadNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingInitial, isLoadingMore, loadNextPage]);

  const handleOpenWizard = () => {
    setIsStatusOpen(false);
    setIsWizardOpen(true);
    setProjectError("");
  };

  const handleStatusSelect = (status) => {
    setSelectedStatus(status);
    setIsStatusOpen(false);
  };

  return (
    <div className="content">
      <div className="screen active">
        {isWizardOpen ? (
          <ProjectCreateWizard
            onClose={() => setIsWizardOpen(false)}
            onProjectCreated={(createdProject) => {
              setProjects((current) => [createdProject, ...current]);
              setProjectCount((count) => count + 1);
              setSelectedStatus("All statuses");
            }}
          />
        ) : null}

        {!isWizardOpen ? (
          <>
            <div className="project-page-head">
              <h1 className="project-page-title">{projectCount} projects</h1>
              <div className="project-page-actions">
                <div className={`project-filter-wrap ${isStatusOpen ? "open" : ""}`.trim()}>
                  <button
                    className="btn btn-secondary project-filter-btn"
                    type="button"
                    onClick={() => setIsStatusOpen((open) => !open)}
                  >
                    {selectedStatus}
                    <ChevronDown className="project-filter-caret" size={14} />
                  </button>

                  {isStatusOpen ? (
                    <div className="project-filter-menu">
                      {statusOptions.map((status) => (
                        <button
                          key={status}
                          className={`project-filter-option ${selectedStatus === status ? "active" : ""}`.trim()}
                          type="button"
                          onClick={() => handleStatusSelect(status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button className="btn btn-primary project-new-btn" type="button" onClick={handleOpenWizard}>
                  <Plus size={15} strokeWidth={2.2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
                  New
                </button>
              </div>
            </div>

            {projectError ? <div className="project-wizard-note">{projectError}</div> : null}

            <div className="project-table-card">
              <div className="project-table-wrap">
                <table className="project-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Sector</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Progress</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingInitial ? (
                      <tr>
                        <td className="project-empty-state" colSpan="6" style={{ padding: "40px 0" }}>
                          Loading projects...
                        </td>
                      </tr>
                    ) : null}

                    {!isLoadingInitial &&
                      projects.map((row) => {
                        const notif = projectNotifications[String(row.id)];
                        const hasHelp = notif?.hasHelp !== undefined ? Boolean(notif.hasHelp) : Boolean(row.has_help_request);
                        const helpInfo = notif?.helpInfo !== undefined ? notif.helpInfo : row.help_request;
                        const unreadCount = notif?.unreadCount !== undefined ? Number(notif.unreadCount) : Number(row.unread_count || 0);
                        const latestActivity = notif?.latestActivity !== undefined ? notif.latestActivity : row.latest_activity;
                        const hasNotification = hasHelp || unreadCount > 0;

                        return (
                          <tr
                            key={row.id}
                            onClick={() => {
                              const pId = String(row.id);
                              // Optimistically clear notification dot immediately on click
                              setProjectNotifications((prev) => ({
                                ...prev,
                                [pId]: {
                                  ...(prev[pId] || {}),
                                  hasHelp: false,
                                  helpInfo: null,
                                  unreadCount: 0,
                                },
                              }));
                              setProjects((prev) =>
                                prev.map((p) =>
                                  String(p.id) === pId
                                    ? { ...p, has_help_request: false, help_request: null, unread_count: 0 }
                                    : p
                                )
                              );
                              // Broadcast project_read to FloxaHeader and WS
                              supportSocket.markProjectRead?.({ projectId: row.id });
                              supportSocket.emit("project_read", { projectId: row.id });
                              // Call backend to persist read status
                              markProjectActivitiesRead(row.id).catch(() => {});

                              // If client requested live assistance, route directly to live portal
                              if (hasHelp && row.portal_token) {
                                const stepMatch = String(helpInfo?.page_id || "").match(/\d+/);
                                const stepParam = stepMatch ? `&step=${stepMatch[0]}` : "";
                                router.push(`/client-portal?token=${encodeURIComponent(row.portal_token)}&mode=consultant${stepParam}`);
                                return;
                              }

                              // Navigate to discovery
                              router.push(`/discovery?projectId=${row.id}`);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <td>
                              <div className="project-client-name-wrap">
                                <span className="project-client-label-wrap">
                                  <span className="project-client-name">{row.client_name || row.company_name}</span>
                                  {hasNotification ? (
                                    <span
                                      className="project-unread-dot project-client-dot discovery-tab-dot"
                                      title={
                                        hasHelp
                                          ? (helpInfo?.question ? `Help Requested: "${helpInfo.question}"` : "Client requested help on this project")
                                          : (latestActivity?.description || `${unreadCount} unread client update${unreadCount > 1 ? "s" : ""}`)
                                      }
                                      aria-label="Unread notification"
                                    />
                                  ) : null}
                                </span>
                              </div>
                              <div className="project-client-email">{row.client_email}</div>
                            </td>
                            <td>{row.sector}</td>
                            <td>
                              <span className={`badge ${getStatusClass(row.workflow_status || row.status)}`}>
                                {getStatusLabel(row.workflow_status || row.status)}
                              </span>
                            </td>
                            <td className="project-value">Rs {row.project_value}</td>
                            <td>
                              <div className="project-progress-cell">
                                <div className="project-progress-track">
                                  <div
                                    className="project-progress-fill"
                                    style={{ width: `${Math.min(100, Math.max(0, Math.round(Number(row.progress || 0))))}%` }}
                                  />
                                </div>
                                <span className="project-progress-value">
                                  {Math.min(100, Math.max(0, Math.round(Number(row.progress || 0))))}%
                                </span>
                              </div>
                            </td>
                            <td>{new Date(row.created_at).toLocaleDateString()}</td>
                          </tr>
                        );
                      })}

                    {!isLoadingInitial && projects.length === 0 ? (
                      <tr>
                        <td className="project-empty-state" colSpan="6" style={{ padding: "40px 0" }}>
                          {projectSearch || selectedStatus !== "All statuses"
                            ? "No projects found for this search or status."
                            : "No projects found."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {/* Infinite Scrolling Sentinel & Status Bar */}
              <div
                ref={loadMoreSentinelRef}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px 20px",
                  borderTop: "1px solid rgba(16, 185, 129, 0.15)",
                  fontSize: "0.85rem",
                  color: "#94a3b8",
                  minHeight: "50px",
                }}
              >
                {isLoadingMore ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#34d399" }}>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid rgba(52, 211, 153, 0.2)",
                        borderTopColor: "#34d399",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span>Loading more projects...</span>
                  </div>
                ) : null}

                {!isLoadingInitial && !isLoadingMore && projects.length > 0 && !hasMore ? (
                  <span style={{ color: "#618272", fontSize: "0.8rem" }}>
                    ✓ Showing all {projects.length} {projects.length === 1 ? "project" : "projects"}
                  </span>
                ) : null}

                {!isLoadingInitial && !isLoadingMore && hasMore ? (
                  <button
                    type="button"
                    onClick={loadNextPage}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#34d399",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Scroll down or click to load more
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
