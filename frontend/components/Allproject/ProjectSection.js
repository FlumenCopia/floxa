"use client";

import { useEffect, useRef, useState } from "react";
import { getProjects } from "../../src/lib/projectApi";
import { useRouter, useSearchParams } from "next/navigation";
import ProjectCreateWizard from "../dashboard/ProjectCreateWizard";

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

const PROJECT_PAGE_SIZE = 10;

export default function ProjectSection({ isWizardOpen = false, setIsWizardOpen = () => {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectSearch = (searchParams.get("search") || "").trim();

  const [projects, setProjects] = useState([]);
  const [projectCount, setProjectCount] = useState(0);
  const [pagination, setPagination] = useState({ next: null, previous: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState("");
  const requestIdRef = useRef(0);
  const previousSearchRef = useRef(projectSearch);

  useEffect(() => {
    if (previousSearchRef.current !== projectSearch) {
      previousSearchRef.current = projectSearch;

      if (currentPage !== 1) {
        requestIdRef.current += 1;
        Promise.resolve().then(() => setCurrentPage(1));
        return;
      }
    }

    async function loadProjects() {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsLoadingProjects(true);
      setProjectError("");

      try {
        const data = await getProjects({
          search: projectSearch,
          status: statusByLabel[selectedStatus] || "",
          page: currentPage,
          pageSize: PROJECT_PAGE_SIZE,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        const nextProjects = Array.isArray(data.results) ? data.results : [];
        const nextCount = Number(data.count || 0);
        const nextTotalPages = Math.max(1, Math.ceil(nextCount / PROJECT_PAGE_SIZE));

        if (currentPage > nextTotalPages) {
          setCurrentPage(nextTotalPages);
          return;
        }

        setProjects(nextProjects);
        setProjectCount(nextCount);
        setPagination({
          next: data.next || null,
          previous: data.previous || null,
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        console.error("Failed to load projects:", error);
        setProjectError(error?.detail || "Projects could not be loaded.");
        setProjects([]);
        setProjectCount(0);
        setPagination({ next: null, previous: null });
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoadingProjects(false);
        }
      }
    }

    loadProjects();
  }, [projectSearch, selectedStatus, currentPage]);

  const totalPages = Math.max(1, Math.ceil(projectCount / PROJECT_PAGE_SIZE));
  const showingStart = projectCount === 0 ? 0 : (currentPage - 1) * PROJECT_PAGE_SIZE + 1;
  const showingEnd = projectCount === 0 ? 0 : Math.min(projectCount, showingStart + projects.length - 1);

  const handleOpenWizard = () => {
    setIsStatusOpen(false);
    setIsWizardOpen(true);
    setProjectError("");
  };

  const handleStatusSelect = (status) => {
    setSelectedStatus(status);
    setCurrentPage(1);
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
                    <svg
                      className="project-filter-caret"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M3.5 5.25L7 8.75L10.5 5.25"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
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
                  + New
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
                    {isLoadingProjects ? (
                      <tr>
                        <td className="project-empty-state" colSpan="6">
                          Loading projects...
                        </td>
                      </tr>
                    ) : null}

                    {!isLoadingProjects &&
                      projects.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => router.push(`/discovery?projectId=${row.id}`)}
                          style={{ cursor: "pointer" }}
                        >
                          <td>
                            <div className="project-client-name">{row.company_name || row.client_name}</div>
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
                                <div className="project-progress-fill" style={{ width: `${row.progress}%` }} />
                              </div>
                            </div>
                          </td>
                          <td>{new Date(row.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    {!isLoadingProjects && projects.length === 0 ? (
                      <tr>
                        <td className="project-empty-state" colSpan="6">
                          {projectSearch || selectedStatus !== "All statuses"
                            ? "No projects found for this search or status."
                            : "No projects found."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="project-pagination">
                <div className="project-pagination-summary">
                  Showing {showingStart}-{showingEnd} of {projectCount} projects
                </div>
                <div className="project-pagination-controls">
                  <button
                    className="btn btn-secondary project-pagination-btn"
                    type="button"
                    disabled={!pagination.previous || isLoadingProjects}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </button>
                  <span className="project-pagination-page">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="btn btn-secondary project-pagination-btn"
                    type="button"
                    disabled={!pagination.next || isLoadingProjects}
                    onClick={() => setCurrentPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
