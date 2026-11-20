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
  advance: "",
  mid: "",
  final: "",
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
    !nextFormData.value
  ) {
    return "Please complete all project fields.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextFormData.email)) {
    return "Enter a valid client email.";
  }

  if (!/^\d+(\.\d{1,2})?$/.test(nextFormData.value) || Number(nextFormData.value) <= 0) {
    return "Project value must be a positive amount.";
  }

  return "";
}


function validatePaymentInfo(formData, isPaymentValid) {
  const nextFormData = trimFormData(formData);

  if (nextFormData.advance === "" || nextFormData.mid === "" || nextFormData.final === "" || !nextFormData.revisions) {
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

  const [createdProjectId, setCreatedProjectId] = useState(null);
  const [isEmailFailed, setIsEmailFailed] = useState(false);
  const [isRetryingEmail, setIsRetryingEmail] = useState(false);
  const [subscriptionLimitError, setSubscriptionLimitError] = useState(null);

  const hasPaymentValues = formData.advance !== "" && formData.mid !== "" && formData.final !== "";
  const paymentTotal = useMemo(() => {
    return Number(formData.advance || 0) + Number(formData.mid || 0) + Number(formData.final || 0);
  }, [formData.advance, formData.final, formData.mid]);
  const isPaymentValid = hasPaymentValues && paymentTotal === 100;

  const parsedProjectValue = useMemo(() => {
    const val = Number(String(formData.value || "").trim());
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : 0;
  }, [formData.value]);

  const milestoneAmounts = useMemo(() => {
    const round2 = (n) => Math.round(n * 100) / 100;
    const advPct = Number(formData.advance || 0);
    const midPct = Number(formData.mid || 0);
    const finPct = Number(formData.final || 0);

    if (parsedProjectValue <= 0) {
      return { advance: 0, mid: 0, final: 0, total: 0 };
    }

    const advance = round2((parsedProjectValue * advPct) / 100);
    const mid = round2((parsedProjectValue * midPct) / 100);
    const final =
      advPct + midPct + finPct === 100
        ? round2(parsedProjectValue - advance - mid)
        : round2((parsedProjectValue * finPct) / 100);

    return {
      advance,
      mid,
      final,
      total: round2(advance + mid + final),
    };
  }, [parsedProjectValue, formData.advance, formData.mid, formData.final]);

  const formatRs = (amount) =>
    `Rs ${Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const handlePaymentChange = (field) => (event) => {
    const rawVal = event.target.value;

    if (rawVal === "") {
      setFormData((current) => {
        if (field === "advance") {
          return {
            ...current,
            advance: "",
            mid: "",
            final: "",
          };
        }
        return {
          ...current,
          [field]: "",
        };
      });
      setProjectCreateError("");
      return;
    }

    const numeric = Math.min(100, Math.max(0, parseInt(rawVal, 10) || 0));

    setFormData((current) => {
      let nextAdvance = current.advance;
      let nextMid = current.mid;
      let nextFinal = current.final;

      if (field === "advance") {
        nextAdvance = String(numeric);
        const remaining = 100 - numeric;
        if (remaining <= 0) {
          nextMid = "0";
          nextFinal = "0";
        } else {
          // Standard 3-stage industry split: evenly divide remaining percentage between Mid and Final
          const half = Math.floor(remaining / 2);
          nextMid = String(half);
          nextFinal = String(remaining - half);
        }
      } else if (field === "mid") {
        nextMid = String(numeric);
        const advNum = Number(current.advance || 0);
        if (advNum + numeric > 100) {
          nextMid = String(Math.max(0, 100 - advNum));
          nextFinal = "0";
        } else {
          nextFinal = String(100 - advNum - numeric);
        }
      } else if (field === "final") {
        nextFinal = String(numeric);
        const advNum = Number(current.advance || 0);
        if (advNum + numeric > 100) {
          nextFinal = String(Math.max(0, 100 - advNum));
          nextMid = "0";
        } else {
          nextMid = String(100 - advNum - numeric);
        }
      }

      return {
        ...current,
        advance: nextAdvance,
        mid: nextMid,
        final: nextFinal,
      };
    });

    setProjectCreateError("");
    setProjectCreateSuccess("");
  };

  const handleFieldChange = (field) => (event) => {
    const nextValue = event.target.value;

    setFormData((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setProjectCreateError("");
    setProjectCreateSuccess("");
  };

  const handleCloseWizard = () => {
    setWizardStep(1);
    setFormData(initialFormData);
    setProjectCreateError("");
    setProjectCreateSuccess("");
    setCreatedPortalLink("");
    setCreatedProjectId(null);
    setIsEmailFailed(false);
    setIsRetryingEmail(false);
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
        portal_password: "",
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

      const setupToken = createdProject.setup_token || "";
      const portalLink = setupToken
        ? `${window.location.origin}/client/${portalToken}?setup_token=${encodeURIComponent(setupToken)}`
        : `${window.location.origin}/client/${portalToken}`;

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
      const isLimit =
        error?.code === "SUBSCRIPTION_LIMIT_REACHED" ||
        error?.code === "SUBSCRIPTION_CLIENT_LIMIT_REACHED" ||
        error?.code === "SUBSCRIPTION_EXPIRED";
      if (isLimit) {
        setSubscriptionLimitError(error);
      }
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
            </div>

            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}

            <div className="project-wizard-actions project-wizard-actions-end">
              <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleContinueFromClientInfo}>
                Continue
              </button>
            </div>
          </>
        ) : null}

        {wizardStep === 2 ? (
          <>
            <div
              className="project-wizard-note"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}
            >
              <span>Payment splits - must sum to 100%</span>
              {parsedProjectValue > 0 ? (
                <span style={{ color: "#f3f8f2", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  Total: {formatRs(parsedProjectValue)}
                </span>
              ) : null}
            </div>
            <div className="project-payment-grid">
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}
                >
                  <span>Advance (%)</span>
                  {parsedProjectValue > 0 ? (
                    <span style={{ color: "#f3f8f2", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {formatRs(milestoneAmounts.advance)}
                    </span>
                  ) : null}
                </label>
                <input
                  className="form-input"
                  max="100"
                  min="0"
                  type="number"
                  placeholder="e.g. 50"
                  value={formData.advance}
                  onChange={handlePaymentChange("advance")}
                />
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}
                >
                  <span>Mid (%)</span>
                  {parsedProjectValue > 0 ? (
                    <span style={{ color: "#f3f8f2", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {formatRs(milestoneAmounts.mid)}
                    </span>
                  ) : null}
                </label>
                <input
                  className="form-input"
                  max="100"
                  min="0"
                  type="number"
                  placeholder={formData.advance ? "Auto" : "e.g. 25"}
                  value={formData.mid}
                  onChange={handlePaymentChange("mid")}
                />
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}
                >
                  <span>Final (%)</span>
                  {parsedProjectValue > 0 ? (
                    <span style={{ color: "#f3f8f2", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {formatRs(milestoneAmounts.final)}
                    </span>
                  ) : null}
                </label>
                <input
                  className="form-input"
                  max="100"
                  min="0"
                  type="number"
                  placeholder={formData.advance ? "Auto" : "e.g. 25"}
                  value={formData.final}
                  onChange={handlePaymentChange("final")}
                />
              </div>
            </div>

            <div className={`project-payment-bar ${formData.advance !== "" && !isPaymentValid ? "project-payment-bar-error" : ""}`.trim()}>
              <div className="project-payment-segment advance" style={{ width: `${formData.advance || 0}%` }} />
              <div className="project-payment-segment mid" style={{ width: `${formData.mid || 0}%` }} />
              <div className="project-payment-segment final" style={{ width: `${formData.final || 0}%` }} />
            </div>

            {formData.advance !== "" && !isPaymentValid ? (
              <div className="project-payment-error-message">Payment split must total exactly 100%.</div>
            ) : null}

            {formData.advance === "" ? (
              <div style={{ fontSize: "12px", color: "#8cb0a1", marginTop: "8px" }}>
                Type your Advance percentage — Mid and Final will auto-calculate to 100%.
              </div>
            ) : null}

            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}

            <div className="form-group project-revision-field" style={{ marginTop: "14px" }}>
              <label className="form-label">Revision limit</label>
              <input className="form-input" type="text" value={formData.revisions} onChange={handleFieldChange("revisions")} />
            </div>

            <div className="project-wizard-actions">
              <button className="project-text-btn" type="button" onClick={() => setWizardStep(1)}>
                Back
              </button>
              <button className="btn btn-primary project-wizard-btn" type="button" onClick={handleContinueFromPayments} disabled={!isPaymentValid}>
                Review
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
                <strong>{formatRs(parsedProjectValue || formData.value)}</strong>
              </div>
              <div className="project-review-row">
                <span>Payment Split</span>
                <strong>
                  {formData.advance}% Advance ({formatRs(milestoneAmounts.advance)}) / {formData.mid}% Mid ({formatRs(milestoneAmounts.mid)}) / {formData.final}% Final ({formatRs(milestoneAmounts.final)})
                </strong>
              </div>
            </div>


            {projectCreateError ? <div className="project-wizard-note">{projectCreateError}</div> : null}
            {subscriptionLimitError ? (
              <div
                style={{
                  margin: "12px 0",
                  padding: "14px 16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 107, 107, 0.12)",
                  border: "1px solid rgba(255, 107, 107, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ color: "#ff6b6b", fontSize: "12px", fontWeight: 600 }}>
                  {subscriptionLimitError.detail || "You have reached your subscription plan limits."}
                </div>
                <a
                  href="/settings?tab=billing"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                    fontSize: "12px",
                    padding: "8px 14px",
                    backgroundColor: "#4dffa0",
                    color: "#020806",
                    borderRadius: "6px",
                    fontWeight: 700,
                    width: "fit-content",
                  }}
                >
                  Upgrade or Renew Plan in Settings →
                </a>
              </div>
            ) : null}
            {projectCreateSuccess ? <div className="project-wizard-note">{projectCreateSuccess}</div> : null}
            {createdPortalLink ? <div className="project-wizard-note">Client portal link: {createdPortalLink}</div> : null}

            <div className="project-wizard-actions">
              {!isEmailFailed ? (
                <>
                  <button className="project-text-btn" type="button" onClick={() => setWizardStep(2)}>
                    Back
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
