"use client";

import { useEffect, useMemo, useState } from "react";
import { createProject, getProjects } from "../../src/lib/projectApi";
import { useRouter } from "next/navigation";
import { showError, showSuccess } from "../../src/lib/toast";

const paymentFields = ["advance", "mid", "final"];

const wizardSteps = [
  { id: 1, label: "Client info" },
  { id: 2, label: "Payments" },
  { id: 3, label: "Review" },
];

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

function KpiIcon({ type }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
  };

  switch (type) {
    case "revenue":
      return (
        <svg {...commonProps}>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "ai":
      return (
        <svg {...commonProps}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "completion":
      return (
        <svg {...commonProps}>
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      );
  }
}

function getStatusLabel(status) {
  const labels = {
    created: "Created",
    discovery: "Discovery",
    advance_paid: "Advance Paid",
    concepts: "Concepts",
    delivered: "Delivered",
    archived: "Archived",
  };

  return labels[status] || status || "Created";
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

async function copyClientPortalLink(link) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = link;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Client portal link could not be copied.");
  }
}

export default function Dashboardsection() {
      const router = useRouter();

  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState("");
  const [createdPortalLink, setCreatedPortalLink] = useState("");
  const [projectCreateSuccess, setProjectCreateSuccess] = useState("");
const [formData, setFormData] = useState({
  client: "",
  email: "",
  company: "",
  sector: "",
  value: "",
  advance: "40",
  mid: "30",
  final: "30",
  revisions: "2",
});
  const paymentTotal = Number(formData.advance || 0) + Number(formData.mid || 0) + Number(formData.final || 0);
  const isPaymentValid = paymentTotal === 100;

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjects();
        setProjects(data.results || []);
      } catch (error) {
        console.error("Failed to load projects:", error);
        setProjects([]);
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadProjects();
  }, []);

  const activeProjectsCount = useMemo(() => {
    return projects.filter((project) => project.status !== "delivered" && !project.is_archived).length;
  }, [projects]);

  const averageCompletion = useMemo(() => {
    if (projects.length === 0) {
      return 0;
    }

    const totalProgress = projects.reduce((total, project) => total + Number(project.progress || 0), 0);
    return Math.round(totalProgress / projects.length);
  }, [projects]);

  const stats = [
    {
      label: "Active Projects",
      value: String(activeProjectsCount),
      change: `${projects.length} total projects`,
      icon: "project",
      deltaClass: "up",
    },
    {
      label: "Revenue This Month",
      value: "Unavailable",
      change: "Revenue data unavailable",
      icon: "revenue",
      deltaClass: "",
    },
    {
      label: "AI Adoption Rate",
      value: "Unavailable",
      change: "AI usage data unavailable",
      icon: "ai",
      deltaClass: "",
    },
    {
      label: "Avg Completion",
      value: `${averageCompletion}%`,
      change: "Based on projects",
      icon: "completion",
      deltaClass: "up",
    },
  ];

  const recentProjects = projects.slice(0, 4);

  const handleFieldChange = (field) => (event) => {
    let nextValue = event.target.value;

    if (paymentFields.includes(field)) {
      const numericValue = Number(nextValue || 0);
      nextValue = Number.isNaN(numericValue) ? "0" : String(Math.min(100, Math.max(0, numericValue)));
    }

    setFormData((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setProjectCreateError("");
    setProjectCreateSuccess("");
  };

  const handleOpenWizard = () => {
    console.log("New project clicked");
    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
    setIsWizardOpen(true);
    setWizardStep(1);
  };

  const handleCloseWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
  };

  const getCreateProjectError = (error) => {
    if (error?.detail) {
      return error.detail;
    }

    if (error?.message) {
      return error.message;
    }

    const firstFieldError = Object.values(error || {}).flat()[0];
    if (firstFieldError) {
      return firstFieldError;
    }

    return "Project could not be created. Please try again.";
  };

  const handleCreateProject = async () => {
    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
    setIsCreatingProject(true);

    try {
      const createdProject = await createProject({
        client: formData.client,
        email: formData.email,
        company: formData.company,
        sector: formData.sector,
        value: formData.value,
        advance: formData.advance,
        mid: formData.mid,
        final: formData.final,
        revisions: formData.revisions,
      });

      const portalToken = createdProject.portal_token || createdProject.portalToken;

      if (!portalToken) {
        throw new Error("Project was created, but no client portal token was returned.");
      }

      const portalLink = `http://localhost:3000/client/${portalToken}`;

      await copyClientPortalLink(portalLink);

      setProjects((current) => [createdProject, ...current]);
      setCreatedPortalLink(portalLink);
      setProjectCreateSuccess("Client portal link copied.");
      showSuccess("Client portal link copied.");
      handleCloseWizard();
    } catch (error) {
      console.error("Failed to create project:", error);
      const message = getCreateProjectError(error);
      setProjectCreateError(message);
      showError(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <div className="content">
      <div className="screen active" id="screen-dashboard">
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
                      <input className="form-input" max="100" min="0" type="number" value={formData.advance} onChange={handleFieldChange("advance")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mid (%)</label>
                      <input className="form-input" max="100" min="0" type="number" value={formData.mid} onChange={handleFieldChange("mid")} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Final (%)</label>
                      <input className="form-input" max="100" min="0" type="number" value={formData.final} onChange={handleFieldChange("final")} />
                    </div>
                  </div>

                  <div className={`project-payment-bar ${isPaymentValid ? "" : "project-payment-bar-error"}`.trim()}>
                    <div className="project-payment-segment advance" style={{ width: `${formData.advance}%` }} />
                    <div className="project-payment-segment mid" style={{ width: `${formData.mid}%` }} />
                    <div className="project-payment-segment final" style={{ width: `${formData.final}%` }} />
                  </div>

                  {!isPaymentValid ? (
                    <div className="project-payment-error-message">Payment split must total exactly 100%.</div>
                  ) : null}

                  <div className="form-group project-revision-field">
                    <label className="form-label">Revision limit</label>
                    <input className="form-input" type="text" value={formData.revisions} onChange={handleFieldChange("revisions")} />
                  </div>

                  <div className="project-wizard-actions">
                    <button className="project-text-btn" type="button" onClick={() => setWizardStep(1)}>
                      {"<- Back"}
                    </button>
                    <button className="btn btn-primary project-wizard-btn" type="button" onClick={() => setWizardStep(3)} disabled={!isPaymentValid}>
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

                  {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}
                  {projectCreateSuccess ? <div className="project-wizard-note">{projectCreateSuccess}</div> : null}
                  {createdPortalLink ? (
                    <div className="project-wizard-note">
                      Client portal link: {createdPortalLink}
                    </div>
                  ) : null}

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
        <div className="kpi-grid">
          {stats.map((item) => (
            <div className="kpi-card" key={item.label}>
              <div className="kpi-card-header">
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-icon">
                  <KpiIcon type={item.icon} />
                </div>
              </div>
              <div className="kpi-value">{item.value}</div>
              <div className={`kpi-delta ${item.deltaClass}`}>{item.change}</div>
            </div>
          ))}
        </div>

        <div className="dashboard-grid">
          <div className="card dashboard-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent projects</div>
              <div className="dashboard-card-actions">
                <button className="btn btn-secondary dashboard-outline-btn" type="button">
                  View all
                </button>
                <button className="btn btn-primary dashboard-solid-btn" type="button" onClick={handleOpenWizard}>
                  + New
                </button>
              </div>
            </div>
            <div className="table-wrap dashboard-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingProjects ? (
                    <tr>
                      <td colSpan="3">Loading projects...</td>
                    </tr>
                  ) : null}

                  {!isLoadingProjects && recentProjects.length === 0 ? (
                    <tr>
                      <td colSpan="3">No projects found.</td>
                    </tr>
                  ) : null}

                 {!isLoadingProjects
  ? recentProjects.map((project) => (
      <tr
        key={project.id}
        onClick={() => router.push(`/discovery?projectId=${project.id}`)}
        style={{ cursor: "pointer" }}
      >
        <td>
                            <div className="font-6 dash-client-name">{project.company_name || project.client_name}</div>
                            <div className="dash-client-sector">{project.sector}</div>
                          </td>
                          <td>
                            <span className={`badge ${getStatusClass(project.status)}`}>
                              {getStatusLabel(project.status)}
                            </span>
                          </td>
                          <td>
                            <div className="progress-cell">
                              <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${Number(project.progress || 0)}%` }} />
                              </div>
                              <span className="progress-value">{Number(project.progress || 0)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card dashboard-card activity-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent activity</div>
            </div>
            <div className="activity-date">Activity</div>
            <div className="activity-item">
              <div className="act-av system">--</div>
              <div>
                <div className="act-action">No recent activity</div>
                <div className="act-time">Activity will appear here when available.</div>
              </div>
            </div>
          </div>
        </div>

        
          </>
        ) : null}
      </div>
    </div>
  );
}
