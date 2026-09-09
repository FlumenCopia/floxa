"use client";

import { useMemo, useState } from "react";
import { createProject, retryProjectInvite } from "@/lib/projectApi";
import { showError, showSuccess } from "@/lib/toast";
import { Check } from "lucide-react";

const paymentFields = ["advance", "mid", "final"];

const wizardSteps = [
  { id: 1, label: "Client info" },
  { id: 2, label: "Payments" },
  { id: 3, label: "Review" },
];

const initialFormData = {
  client: "",
  email: "",
  company: "",
  sector: "",
  value: "",
  portal_password: "",
  advance: "40",
  mid: "30",
  final: "30",
  revisions: "2",
};


function StepIndicator({ done, active, step }) {
  if (done) {
    return (
      <span className={`project-step-chip ${active ? "active" : ""} done`.trim()}>
        <Check size={14} strokeWidth={2.4} />
      </span>
    );
  }

  return <span className={`project-step-chip ${active ? "active" : ""}`.trim()}>{step}</span>;
}

async function copyClientPortalLink(link) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      return;
    }
  } catch (err) {
    console.warn("Clipboard writeText skipped (document not focused):", err);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = link;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch (fallbackErr) {
    console.warn("Fallback clipboard copy skipped:", fallbackErr);
  }
}

function getCreateProjectError(error) {
  if (error?.detail) {
    return error.detail;
  }

  if (error?.message) {
    return error.message;
  }

  const firstFieldError = Object.values(error || {}).flat()[0];
  return firstFieldError || "Project could not be created. Please try again.";
}

function trimFormData(formData) {
  return Object.fromEntries(Object.entries(formData).map(([key, value]) => [key, String(value).trim()]));
}

function validateClientInfo(formData) {
  const nextFormData = trimFormData(formData);

  if (
    !nextFormData.client ||
    !nextFormData.email ||
    !nextFormData.company ||
    !nextFormData.sector ||
    !nextFormData.value ||
    !nextFormData.portal_password
  ) {
    return "Please complete all project fields.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextFormData.email)) {
    return "Enter a valid client email.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(nextFormData.value) || Number(nextFormData.value) <= 0) {
    return "Project value must be a positive amount.";
  }

  if (nextFormData.portal_password.length < 8) {
    return "Portal password must be at least 8 characters.";
  }

  return "";
}


function validatePaymentInfo(formData, isPaymentValid) {
  const nextFormData = trimFormData(formData);

  if (!nextFormData.advance || !nextFormData.mid || !nextFormData.final || !nextFormData.revisions) {
    return "Please complete all project fields.";
  }

  if (!isPaymentValid) {
    return "Payment split must total exactly 100%.";
  }

  return "";
}

export default function ProjectCreateWizard({ onClose, onProjectCreated }) {
  const [wizardStep, setWizardStep] = useState(1);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState("");
  const [createdPortalLink, setCreatedPortalLink] = useState("");
  const [projectCreateSuccess, setProjectCreateSuccess] = useState("");
  const [formData, setFormData] = useState(initialFormData);
  const [showPassword, setShowPassword] = useState(false);

  const [createdProjectId, setCreatedProjectId] = useState(null);
  const [isEmailFailed, setIsEmailFailed] = useState(false);
  const [isRetryingEmail, setIsRetryingEmail] = useState(false);


  const paymentTotal = useMemo(() => {
    return Number(formData.advance || 0) + Number(formData.mid || 0) + Number(formData.final || 0);
  }, [formData.advance, formData.final, formData.mid]);
  const isPaymentValid = paymentTotal === 100;

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

  const handleCloseWizard = () => {
    setWizardStep(1);
    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
    setCreatedProjectId(null);
    setIsEmailFailed(false);
    setIsRetryingEmail(false);
    setShowPassword(false);
    onClose?.();
  };

  const handleContinueFromClientInfo = () => {
    const message = validateClientInfo(formData);

    if (message) {
      setProjectCreateError(message);
      showError(message);
      return;
    }

    setProjectCreateError("");
    setWizardStep(2);
  };

  const handleContinueFromPayments = () => {
    const message = validatePaymentInfo(formData, isPaymentValid);

    if (message) {
      setProjectCreateError(message);
      showError(message);
      return;
    }

    setProjectCreateError("");
    setWizardStep(3);
  };

  const handleCreateProject = async () => {
    const clientInfoMessage = validateClientInfo(formData);
    const paymentInfoMessage = validatePaymentInfo(formData, isPaymentValid);

    if (clientInfoMessage || paymentInfoMessage) {
      const message = clientInfoMessage || paymentInfoMessage;
      setProjectCreateError(message);
      showError(message);
      return;
    }

    const nextFormData = trimFormData(formData);

    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
    setIsCreatingProject(true);

    try {
      const createdProject = await createProject({
        client: nextFormData.client,
        email: nextFormData.email,
        company: nextFormData.company,
        sector: nextFormData.sector,
        value: nextFormData.value,
        portal_password: nextFormData.portal_password,
        advance: nextFormData.advance,
        mid: nextFormData.mid,
        final: nextFormData.final,
        revisions: nextFormData.revisions,
      });


      const projectObj = createdProject.project || createdProject;
      const portalToken = projectObj.portal_token || projectObj.portalToken;

      if (!portalToken) {
        throw new Error("Project was created, but no client portal token was returned.");
      }

      const portalLink = `${window.location.origin}/client/${portalToken}`;

      await copyClientPortalLink(portalLink);

      onProjectCreated?.(createdProject);
      setCreatedPortalLink(portalLink);

      const emailSent = createdProject.invite_email_sent !== false && createdProject.invite_email_status !== "failed";

      if (emailSent) {
        const msg = `Project created and invitation email sent to ${nextFormData.email}.`;
        setProjectCreateSuccess(msg);
        showSuccess(msg);
        setIsEmailFailed(false);
        handleCloseWizard();
      } else {
        const failMsg = createdProject.invite_email_detail || "Project created, but the invitation email could not be sent.";
        setProjectCreateError(failMsg);
        showError(failMsg);
        setCreatedProjectId(projectObj.id);
        setIsEmailFailed(true);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
      const message = getCreateProjectError(error);
      setProjectCreateError(message);
      showError(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleRetryInvite = async () => {
    if (!createdProjectId || isRetryingEmail) return;
    setIsRetryingEmail(true);
    setProjectCreateError("");
    setProjectCreateSuccess("");

    try {
      const res = await retryProjectInvite(createdProjectId);
      if (res.invite_email_sent) {
        const msg = `Invitation email sent to ${formData.email}.`;
        setProjectCreateSuccess(msg);
        showSuccess(msg);
        setIsEmailFailed(false);
      } else {
        const failMsg = res.detail || "The invitation email could not be sent. Please try again.";
        setProjectCreateError(failMsg);
        showError(failMsg);
      }
    } catch (error) {
      const failMsg = error?.detail || error?.message || "The invitation email could not be sent. Please try again.";
      setProjectCreateError(failMsg);
      showError(failMsg);
    } finally {
      setIsRetryingEmail(false);
    }
  };

  return (
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
              <div className="form-group">
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
              <div className="form-group">
                <label className="form-label">
                  Portal password <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    className="form-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter portal password (min. 8 characters)"
                    value={formData.portal_password}
                    onChange={handleFieldChange("portal_password")}
                    style={{ paddingRight: "60px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      background: "transparent",
                      border: "none",
                      color: "#8cb0a1",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                    }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

            </div>

            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}

            <div className="project-wizard-actions project-wizard-actions-end">
              <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleContinueFromClientInfo}>
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

            {!isPaymentValid ? <div className="project-payment-error-message">Payment split must total exactly 100%.</div> : null}
            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}

            <div className="form-group project-revision-field">
              <label className="form-label">Revision limit</label>
              <input className="form-input" type="text" value={formData.revisions} onChange={handleFieldChange("revisions")} />
            </div>

            <div className="project-wizard-actions">
              <button className="project-text-btn" type="button" onClick={() => setWizardStep(1)}>
                {"<- Back"}
              </button>
              <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleContinueFromPayments} disabled={!isPaymentValid}>
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
              <div className="project-review-row">
                <span>Portal Password</span>
                <strong>{showPassword ? formData.portal_password : "••••••••"}</strong>
              </div>

            </div>


            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}
            {projectCreateSuccess ? <div className="project-wizard-note">{projectCreateSuccess}</div> : null}
            {createdPortalLink ? <div className="project-wizard-note">Client portal link: {createdPortalLink}</div> : null}

            <div className="project-wizard-actions">
              {!isEmailFailed ? (
                <>
                  <button className="project-text-btn" type="button" onClick={() => setWizardStep(2)}>
                    {"<- Back"}
                  </button>
                  <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleCreateProject} disabled={isCreatingProject}>
                    {isCreatingProject ? "Creating..." : "Create & send link"}
                  </button>
                </>
              ) : (
                <>
                  <button className="project-text-btn" type="button" onClick={handleCloseWizard}>
                    Close
                  </button>
                  <button
                    className="btn btn-secondary project-wizard-btn"
                    type="button"
                    onClick={handleRetryInvite}
                    disabled={isRetryingEmail}
                  >
                    {isRetryingEmail ? "Sending..." : "Retry invitation"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      <button className="project-wizard-close" type="button" onClick={handleCloseWizard}>
        Close
      </button>
    </div>
  );
}
