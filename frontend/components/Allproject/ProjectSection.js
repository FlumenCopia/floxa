"use client";

import { useEffect, useMemo, useState } from "react";
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

export function getStatusClassByLabel(label) {
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

export default function ProjectSection({ isWizardOpen = false, setIsWizardOpen = () => {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectSearch = (searchParams.get("search") || "").trim();

  const [projects, setProjects] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState("");

  const filteredProjects = useMemo(() => {
    const statusFilteredProjects =
      selectedStatus === "All statuses"
        ? projects
        : projects.filter((row) => getStatusLabel(row.workflow_status || row.status) === selectedStatus);

    return statusFilteredProjects;
  }, [projects, selectedStatus]);

  useEffect(() => {
    async function loadProjects() {
      setProjectError("");

      try {
        const data = await getProjects(projectSearch);
        setProjects(data.results || []);
      } catch (error) {
        console.error("Failed to load projects:", error);
        setProjectError(error?.detail || "Projects could not be loaded.");
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadProjects();
  }, [projectSearch]);

  const handleOpenWizard = () => {
    setIsStatusOpen(false);
    setIsWizardOpen(true);
    setProjectError("");
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
              <h1 className="project-page-title">{filteredProjects.length} projects</h1>
              <div className="project-page-actions">
                <div className={`project-filter-wrap ${isStatusOpen ? "open" : ""}`.trim()}>
                  <button
                    className="btn btn-secondary project-filter-btn"
                    type="button"
                    onClick={() => setIsStatusOpen((open) => !open)}
                  >
                    {selectedStatus}
                    <span className="project-filter-caret">{isStatusOpen ? "^" : "v"}</span>
                  </button>

                  {isStatusOpen ? (
                    <div className="project-filter-menu">
                      {statusOptions.map((status) => (
                        <button
                          key={status}
                          className={`project-filter-option ${selectedStatus === status ? "active" : ""}`.trim()}
                          type="button"
                          onClick={() => {
                            setSelectedStatus(status);
                            setIsStatusOpen(false);
                          }}
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
                      filteredProjects.map((row) => (
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
                    {!isLoadingProjects && filteredProjects.length === 0 ? (
                      <tr>
                        <td className="project-empty-state" colSpan="6">
                          {projectSearch ? "No projects found for this search." : "No projects found for this status."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
