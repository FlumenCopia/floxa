"use client";

import { useEffect, useMemo, useState } from "react";
import { createProject, getProjects } from "../../src/lib/projectApi";
import { useRouter, useSearchParams } from "next/navigation";
import { showError, showSuccess } from "../../src/lib/toast";

const statusOptions = ["All statuses", "Discovery", "Advance Paid", "Concepts", "Delivered", "Created"];
const wizardSteps = [
  { id: 1, label: "Client info" },
  { id: 2, label: "Payments" },
  { id: 3, label: "Review" },
];

function getStatusLabel(status) {
  const labels = {
    created: "Created",
    discovery: "Discovery",
    advance_paid: "Advance Paid",
    concepts: "Concepts",
    delivered: "Delivered",
    archived: "Archived",
  };

  return labels[status] || status;
}

function getStatusClass(status) {
  const classes = {
    created: "badge-muted",
    discovery: "badge-amber",
    advance_paid: "badge-green",
    concepts: "badge-blue",
    delivered: "badge-green",
    archived: "badge-muted",
  };

  return classes[status] || "badge-muted";
}

function StepIndicator({ done, active, step }) {
  if (done) {
    return (
      <span className={`project-step-chip ${active ? "active" : ""} done`.trim()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="m5 13 4 4L19 7" />
        </svg>
      </span>
    );
  }

  return <span className={`project-step-chip ${active ? "active" : ""}`.trim()}>{step}</span>;
}

export default function ProjectSection({ isWizardOpen = false, setIsWizardOpen = () => {} }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectSearch = (searchParams.get("search") || "").trim();

  const [projects, setProjects] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [formData, setFormData] = useState({
    client: "",
    email: "",
    company: " ",
    sector: " ",
    value: "",
    advance: "",
    mid: "",
    final: "",
    revisions: "",
  });

  const filteredProjects = useMemo(() => {
    const statusFilteredProjects =
      selectedStatus === "All statuses"
        ? projects
        : projects.filter((row) => getStatusLabel(row.status) === selectedStatus);

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

  const handleFieldChange = (field) => (event) => {
    setFormData((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleOpenWizard = () => {
    setIsStatusOpen(false);
    setIsWizardOpen(true);
    setWizardStep(1);
  };

  const handleCloseWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setProjectError("");
  };

  const getCreateProjectError = (error) => {
    if (error?.detail) {
      return error.detail;
    }

    if (error?.message) {
      return error.message;
    }

    const firstFieldError = Object.values(error || {}).flat()[0];
    return firstFieldError || "Project could not be created. Please try again.";
  };

  const handleCreateProject = async () => {
    setProjectError("");
    setIsCreatingProject(true);

    try {
      const createdProject = await createProject({
        client: formData.client,
        email: formData.email,
        company: formData.company,
        sector: formData.sector,
        value: formData.value,
        advance: formData.advance || "50",
        mid: formData.mid || "25",
        final: formData.final || "25",
        revisions: formData.revisions || "3 revisions",
      });

      setProjects((current) => [createdProject, ...current]);
      setSelectedStatus("All statuses");
      showSuccess("Project created successfully.");
      handleCloseWizard();
    } catch (error) {
      console.error("Failed to create project:", error);
      const message = getCreateProjectError(error);
      setProjectError(message);
      showError(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <div className="content">
      <div className="screen active">
        {isWizardOpen ? (
          <div className="project-wizard-shell">
            <div className="project-wizard-eyebrow">New Project</div>
            <h1 className="project-wizard-title">Set up a client project</h1>

            <div className="project-wizard-steps">
              {wizardSteps.map((step, index) => {
                const isActive = wizardStep === step.id;
                const isDone = wizardStep > step.id;

                return (
                  <div className="project-wizard-step-block" key={step.id}>
                    <StepIndicator done={isDone} active={isActive} step={step.id} />
                    <div className={`project-step-label ${isActive ? "active" : ""}`.trim()}>{step.label}</div>
                    {index < wizardSteps.length - 1 ? <div className="project-step-line" /> : null}
                  </div>
                );
              })}
            </div>

            <div className="project-wizard-card">
              {wizardStep === 1 ? (
                <>
                  <div className="project-create-grid">
                    <div className="form-group">
                      <label className="form-label">Client name</label>
                      <input className="form-input" type="text" value={formData.client} onChange={handleFieldChange("client")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Client email</label>
                      <input className="form-input" type="email" value={formData.email} onChange={handleFieldChange("email")} />
                    </div>
                    <div className="form-group project-create-grid-span">
                      <label className="form-label">Company</label>
                      <input className="form-input" type="text" value={formData.company} onChange={handleFieldChange("company")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sector</label>
                      <input className="form-input" type="text" value={formData.sector} onChange={handleFieldChange("sector")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Project value (Rs)</label>
                      <input className="form-input" type="text" value={formData.value} onChange={handleFieldChange("value")} />
                    </div>
                  </div>

                  <div className="project-wizard-actions project-wizard-actions-end">
                    <button className="btn btn-primary project-wizard-btn" type="button" onClick={() => setWizardStep(2)}>
                      {"Continue ->"}
                    </button>
                  </div>
                </>
              ) : null}

              {wizardStep === 2 ? (
                <>
                  <div className="project-wizard-note">Payment splits - must sum to 100%</div>
                  <div className="project-payment-grid">
                    <div className="form-group">
                      <label className="form-label">Advance (%)</label>
                      <input className="form-input" type="text" value={formData.advance} onChange={handleFieldChange("advance")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mid (%)</label>
                      <input className="form-input" type="text" value={formData.mid} onChange={handleFieldChange("mid")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Final (%)</label>
                      <input className="form-input" type="text" value={formData.final} onChange={handleFieldChange("final")} />
                    </div>
                  </div>

                  <div className="project-payment-bar">
                    <div className="project-payment-segment advance" style={{ width: `${formData.advance}%` }} />
                    <div className="project-payment-segment mid" style={{ width: `${formData.mid}%` }} />
                    <div className="project-payment-segment final" style={{ width: `${formData.final}%` }} />
                  </div>

                  <div className="form-group project-revision-field">
                    <label className="form-label">Revision limit</label>
                    <input className="form-input" type="text" value={formData.revisions} onChange={handleFieldChange("revisions")} />
                  </div>

                  <div className="project-wizard-actions">
                    <button className="project-text-btn" type="button" onClick={() => setWizardStep(1)}>
                      {"<- Back"}
                    </button>
                    <button className="btn btn-primary project-wizard-btn" type="button" onClick={() => setWizardStep(3)}>
                      {"Review ->"}
                    </button>
                  </div>
                </>
              ) : null}

              {wizardStep === 3 ? (
                <>
                  <div className="project-wizard-note">Review details - a portal link will be emailed to your client after creation.</div>
                  <div className="project-review-card">
                    <div className="project-review-row">
                      <span>Client</span>
                      <strong>{formData.client}</strong>
                    </div>
                    <div className="project-review-row">
                      <span>Email</span>
                      <strong>{formData.email}</strong>
                    </div>
                    <div className="project-review-row">
                      <span>Company</span>
                      <strong>{formData.company}</strong>
                    </div>
                    <div className="project-review-row">
                      <span>Value</span>
                      <strong>Rs{formData.value}</strong>
                    </div>
                  </div>

                  {projectError ? <div className="project-wizard-note">{projectError}</div> : null}

                  <div className="project-wizard-actions">
                    <button className="project-text-btn" type="button" onClick={() => setWizardStep(2)}>
                      {"<- Back"}
                    </button>
                    <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleCreateProject} disabled={isCreatingProject}>
                      {isCreatingProject ? "Creating..." : "Create & send link"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <button className="project-wizard-close" type="button" onClick={handleCloseWizard}>
              Close
            </button>
          </div>
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
                            <span className={`badge ${getStatusClass(row.status)}`}>
                              {getStatusLabel(row.status)}
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
