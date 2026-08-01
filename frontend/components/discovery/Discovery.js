"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Floxaheader from "../../commone/Floxaheader";
import ProtectedAssetImage from "../common/ProtectedAssetImage";
import { downloadProtectedAsset } from "../../src/lib/api";
import { getStatusClass, getStatusLabel } from "../Allproject/ProjectSection";
import { showError, showSuccess } from "../../src/lib/toast";
import {
  askProjectAssistant,
  generateAgreement,
  generateBrandDNA,
  deleteConcept,
  deleteDeliverable,
  getAgreement,
  getBrandDNA,
  getConsultantActivities,
  getConcepts,
  getDeliverables,
  getDiscoverySummary,
  getMoodboards,
  getPaymentMilestones,
  getProject,
  getProjectActivities,
  initializePaymentMilestones,
  markPaymentMilestonePaid,
  markProjectActivitiesRead,
  requestAgreementSignature,
  requestPaymentMilestone,
  retrySignedAgreementEmail,
  shareAgreement,
  shareConcept,
  shareDeliverable,
  updateConcept,
  updateDeliverable,
  uploadConcept,
  uploadDeliverable,
  uploadMoodboard,
} from "../../src/lib/projectApi";

const discoveryTabs = [
  "Overview",
  "Agreement",
  "Brand DNA",
  "Discovery",
  "Moodboards",
  "Concepts",
  "Deliverables",
  "Payments",
  "Activity",
];

const discoveryTabByQuery = {
  overview: "Overview",
  "brand-dna": "Brand DNA",
  discovery: "Discovery",
  moodboards: "Moodboards",
  concepts: "Concepts",
  deliverables: "Deliverables",
  agreement: "Agreement",
  payments: "Payments",
  activity: "Activity",
};

const assistantSuggestions = [
  "Summarize this client's Discovery",
  "What should I do next in this project?",
  "Review the current Brand DNA",
  "Suggest moodboard directions",
  "Why is the next payment milestone locked?",
  "Prepare a client follow-up message",
];

const assistantSourceLabels = {
  project: "Project",
  workflow: "Workflow",
  client_profile: "Client Profile",
  discovery: "Discovery",
  brand_dna: "Brand DNA",
  moodboards: "Moodboards",
  concepts: "Concepts",
  agreement: "Agreement",
  payments: "Payments",
  deliverables: "Deliverables",
  recent_activity: "Recent Activity",
};

const activityActionsByTab = {
  Discovery: [
    "client_profile_submitted",
    "client_profile_updated",
    "discovery_submitted",
    "discovery_updated",
  ],
  Moodboards: [
    "moodboard_selected",
  ],
  Concepts: [
    "concept_approved",
    "concept_changes_requested",
  ],
  Agreement: [
    "agreement_opened",
    "agreement_downloaded",
    "agreement_signed",
    "agreement_accepted",
  ],
  Deliverables: [
    "deliverable_downloaded",
    "deliverable_accepted",
    "project_signed_off",
  ],
  Payments: [
    "payment_requested",
    "payment_received",
    "payment_paid",
  ],
};

function getDiscoveryTabFromQuery(tab) {
  return discoveryTabByQuery[String(tab || "").toLowerCase()] || "Overview";
}

function getTabActivityActions(tab) {
  return activityActionsByTab[tab] || [];
}

function getConceptStatusLabel(status) {
  const labels = {
    draft: "Draft",
    shared: "Shared",
    approved: "Approved",
    changes_requested: "Changes Requested",
  };

  return labels[status] || status || "Draft";
}

function getConceptStatusClass(status) {
  const classes = {
    draft: "badge-muted",
    shared: "badge-blue",
    approved: "badge-green",
    changes_requested: "badge-amber",
  };

  return classes[status] || "badge-muted";
}

function getDeliverableStatusLabel(status) {
  const labels = {
    draft: "Draft",
    shared: "Shared",
  };

  return labels[status] || status || "Draft";
}

function getDeliverableStatusClass(status) {
  const classes = {
    draft: "badge-muted",
    shared: "badge-blue",
  };

  return classes[status] || "badge-muted";
}

function formatProjectValue(value) {
  if (value === undefined || value === null || value === "") {
    return "No value available";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return `Rs ${value}`;
  }

  return `Rs${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function getPercent(rawValue, fallback) {
  const percent = Number(String(rawValue ?? fallback).replace("%", ""));
  return Number.isNaN(percent) ? fallback : percent;
}

function getPaymentAmount(projectValue, percentage) {
  const amount = (Number(projectValue || 0) * Number(percentage || 0)) / 100;
  return formatProjectValue(amount);
}

function getProjectPaymentItems(project) {
  if (!project) {
    return [];
  }

  const advance = getPercent(project?.advance_percentage, 50);
  const mid = getPercent(project?.mid_percentage, 25);
  const final = getPercent(project?.final_percentage, 25);

  return [
    { label: "Advance", split: advance, value: getPaymentAmount(project?.project_value, advance), status: "Pending", statusClass: "pending" },
    { label: "Mid", split: mid, value: getPaymentAmount(project?.project_value, mid), status: "Locked", statusClass: "locked" },
    { label: "Final", split: final, value: getPaymentAmount(project?.project_value, final), status: "Locked", statusClass: "locked" },
  ];
}

function getPaymentTypeLabel(type) {
  const labels = {
    advance: "Advance",
    mid: "Mid",
    final: "Final",
  };

  return labels[type] || type || "Payment";
}

function getPaymentStatusLabel(status) {
  const labels = {
    locked: "Locked",
    ready: "Ready",
    requested: "Requested",
    paid: "Paid",
  };

  return labels[status] || status || "Locked";
}

function getPaymentStatusClass(status) {
  const classes = {
    locked: "locked",
    ready: "ready",
    requested: "requested",
    paid: "paid",
  };

  return classes[status] || "locked";
}

function getPaymentItemsFromMilestones(milestones) {
  return milestones.map((milestone) => ({
    id: milestone.id,
    type: milestone.type,
    label: getPaymentTypeLabel(milestone.type),
    split: milestone.percentage,
    value: formatProjectValue(milestone.amount),
    status: milestone.status,
    statusLabel: getPaymentStatusLabel(milestone.status),
    statusClass: getPaymentStatusClass(milestone.status),
  }));
}

function getPaymentGridColumns(paymentItems) {
  return paymentItems.map((item) => `${item.split}fr`).join(" ");
}

function formatActivityDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAgreementHistoryLabel(item) {
  if (item?.label) {
    return item.label;
  }

  const version = item?.version || "";
  const title = item?.title || "";
  const eventType = item?.event_type || "";

  if (eventType === "agreement_signed") {
    return `Agreement v${version} - Basic Agreement Signed`;
  }

  const readableTitle = title
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return `Agreement v${version} - ${readableTitle}`;
}

function getAgreementStatusLabel(status) {
  const labels = {
    draft: "Draft",
    shared: "Draft",
    signature_requested: "Signature Requested",
    signed: "Signed / Active",
    active: "Signed / Active",
    locked: "Completed / Locked",
    completed: "Completed / Locked",
  };

  return labels[status] || status || "Not generated yet";
}

function formatFileSize(value) {
  const size = Number(value || 0);

  if (!size) {
    return "Unknown size";
  }

  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getApiErrorMessage(error, fallback = "Unable to complete this action. Please try again.") {
  if (typeof error === "string") {
    return error;
  }

  if (error?.detail) {
    return Array.isArray(error.detail) ? error.detail.join(" ") : error.detail;
  }

  if (error?.message) {
    return error.message;
  }

  const firstFieldError = Object.values(error || {}).flat()[0];
  if (firstFieldError) {
    return Array.isArray(firstFieldError) ? firstFieldError.join(" ") : firstFieldError;
  }

  return fallback;
}

function FileDetails({ file }) {
  if (!file) {
    return null;
  }

  return (
    <div className="discovery-info-row">
      <span>Selected file</span>
      <strong>
        {file.name} - {file.type || "Unknown type"} - {formatFileSize(file.size)}
      </strong>
    </div>
  );
}

function formatRevisionLimit(value) {
  if (value === undefined || value === null || value === "") {
    return "3 revisions";
  }

  const revisionText = String(value).trim();
  return revisionText.toLowerCase().includes("revision") ? revisionText : `${revisionText} revisions`;
}

function SummaryHeader({ project }) {
  const progress = Number(project?.progress ?? 0);
  const title = project?.company_name || "No project selected";
  const email = project?.client_email || "No email available";
  const sector = project?.sector || "No sector available";
  const value = formatProjectValue(project?.project_value);
  const status = project?.workflow_status || project?.status || "discovery";

  async function handleCopyPortalLink() {
    if (!project?.portal_token) {
      showError("Client portal link is unavailable for this project.");
      return;
    }

    const portalUrl = `${window.location.origin}/client/${project.portal_token}`;

    try {
      await navigator.clipboard.writeText(portalUrl);
      showSuccess("Client portal link copied.");
    } catch (error) {
      console.error("Failed to copy client portal link:", error);
      showError("Unable to copy client portal link.");
    }
  }

  function handleOpenPortal() {
    if (!project?.portal_token) {
      showError("Client portal link is unavailable for this project.");
      return;
    }

    window.open(`/client/${project.portal_token}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="discovery-card discovery-summary">
      <div className="discovery-summary-main">
        <div className="discovery-summary-copy">
          <div className="discovery-summary-head">
            <h1 className="discovery-summary-title">{title}</h1>
            <span className={`badge ${getStatusClass(status)}`}>{getStatusLabel(status)}</span>
          </div>
          <div className="discovery-summary-meta">{email} - {sector} - {value}</div>
        </div>

        <div className="discovery-summary-actions">
          <div className="discovery-progress-ring" style={{ "--progress": `${progress}%` }}>
            <span>{progress}%</span>
          </div>
          <button className="btn btn-secondary discovery-link-btn" type="button" onClick={handleCopyPortalLink}>
            <span className="discovery-btn-icon" aria-hidden="true" />
            Link
          </button>
          <button className="btn btn-primary discovery-portal-btn" type="button" onClick={handleOpenPortal}>
            {"Portal ->"}
          </button>
        </div>
      </div>
    </section>
  );
}

function OverviewPanel({
  gateDeliverables,
  project,
  projectActivities,
  projectActivitiesLoading,
  paymentItems: realPaymentItems = [],
  setGateDeliverables,
}) {
  const clientName = project?.client_name || "No project selected";
  const clientEmail = project?.client_email || "No email available";
  const sector = project?.sector || "No sector available";
  const value = project ? formatProjectValue(project.project_value) : "No value available";
  const paymentItems = realPaymentItems.length ? realPaymentItems : getProjectPaymentItems(project);
  const revisions = project ? formatRevisionLimit(project.revision_limit) : "No revision limit set";
  const timelineActivities = [...(projectActivities || [])].sort((firstActivity, secondActivity) => {
    return new Date(secondActivity.created_at || 0) - new Date(firstActivity.created_at || 0);
  });

  return (
    <div className="discovery-overview-grid">
      <section className="discovery-card discovery-panel discovery-overview-card discovery-overview-timeline-card">
        <h2 className="discovery-panel-title">Timeline</h2>
        <div className="discovery-timeline">
          {projectActivitiesLoading ? (
            <div className="discovery-timeline-item idle">
              <div className="discovery-timeline-dot" />
              <div className="discovery-timeline-copy">
                <div className="discovery-timeline-text">Loading timeline</div>
                <div className="discovery-timeline-date">Fetching recent project activity.</div>
              </div>
            </div>
          ) : null}
          {!projectActivitiesLoading && timelineActivities.length === 0 ? (
            <div className="discovery-timeline-item idle">
              <div className="discovery-timeline-dot" />
              <div className="discovery-timeline-copy">
                <div className="discovery-timeline-text">No activity yet</div>
                <div className="discovery-timeline-date">Activity will appear here when available.</div>
              </div>
            </div>
          ) : null}
          {!projectActivitiesLoading
            ? timelineActivities.map((activity) => (
                <div className="discovery-timeline-item" key={activity.id}>
                  <div className="discovery-timeline-dot" />
                  <div className="discovery-timeline-copy">
                    <div className="discovery-timeline-text">{activity.description || activity.action}</div>
                    <div className="discovery-timeline-date">
                      {activity.actor_type || "system"} - {formatActivityDate(activity.created_at)}
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      </section>

      <section className="discovery-card discovery-panel discovery-overview-card discovery-overview-payment-card">
        <h2 className="discovery-panel-title">Payment schedule</h2>
        {paymentItems.length > 0 ? (
          <>
            <div className="discovery-payment-bar" style={{ gridTemplateColumns: getPaymentGridColumns(paymentItems) }} aria-hidden="true">
              <span className="advance" />
              <span className="mid" />
              <span className="final" />
            </div>
            <div className="discovery-payment-legend">
              <span><i className="advance" /> Advance {paymentItems[0].split}%</span>
              <span><i className="mid" /> Mid {paymentItems[1].split}%</span>
              <span><i className="final" /> Final {paymentItems[2].split}%</span>
            </div>
            <div className="discovery-payment-list">
              {paymentItems.map((item) => (
                <div className="discovery-payment-item" key={item.label}>
                  <div className="discovery-payment-name">{item.label}</div>
                  <div className="discovery-payment-meta">
                    <strong>{item.value}</strong>
                    <span className={`discovery-pill ${item.statusClass}`.trim()}>{item.statusLabel || item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="discovery-info-list">
            <div className="discovery-info-row">
              <span>Payment terms</span>
              <strong>No project selected</strong>
            </div>
          </div>
        )}
      </section>

      <section className="discovery-card discovery-panel discovery-overview-card discovery-overview-client-card">
        <h2 className="discovery-panel-title">Client info</h2>
        <div className="discovery-info-list">
          <div className="discovery-info-row">
            <span>Name</span>
            <strong>{clientName}</strong>
          </div>
          <div className="discovery-info-row">
            <span>Email</span>
            <strong>{clientEmail}</strong>
          </div>
          <div className="discovery-info-row">
            <span>Sector</span>
            <strong>{sector}</strong>
          </div>
          <div className="discovery-info-row">
            <span>Value</span>
            <strong className="discovery-value">{value}</strong>
          </div>
        </div>
      </section>

      <section className="discovery-card discovery-panel discovery-overview-card discovery-overview-settings-card">
        <h2 className="discovery-panel-title">Settings</h2>
        <div className="discovery-setting-row">
          <span>Revision limit</span>
          <strong>{revisions}</strong>
        </div>
        <div className="discovery-setting-row">
          <span>Gate deliverables</span>
          <button
            className={`discovery-toggle ${gateDeliverables ? "active" : ""}`.trim()}
            type="button"
            aria-pressed={gateDeliverables}
            onClick={() => setGateDeliverables((current) => !current)}
          >
            <span />
          </button>
        </div>
      </section>
    </div>
  );
}

function formatBriefList(items) {
  return items?.length ? items.join(", ") : "Not submitted yet.";
}

function formatBriefCompetitors(competitors) {
  if (!competitors?.length) {
    return "Not submitted yet.";
  }

  return competitors
    .map((competitor) => [
      `${competitor.name || "Unnamed competitor"} (${competitor.rating || "neutral"})`,
      competitor.reason ? `Reason: ${competitor.reason}` : "",
    ].filter(Boolean).join(" - "))
    .join("\n");
}

function formatSliderValue(slider) {
  const value = Number(slider.value);

  if (!Number.isFinite(value)) {
    return "Balanced";
  }

  if (value < 45) {
    return `${slider.left_label || "Left"} leaning (${value}%)`;
  }

  if (value > 55) {
    return `${slider.right_label || "Right"} leaning (${value}%)`;
  }

  return `Balanced (${value}%)`;
}

function formatBriefSliders(sliders) {
  if (!sliders?.length) {
    return "Not submitted yet.";
  }

  return sliders
    .map((slider) => `${slider.left_label || "Left"} / ${slider.right_label || "Right"}: ${formatSliderValue(slider)}`)
    .join("\n");
}

function getBriefFileName(companyName) {
  const safeName = String(companyName || "client")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `brand-brief-${safeName || "client"}.txt`;
}

function buildClientBriefText(summary) {
  return [
    `Client Brief - ${summary.company_name || "Client"}`,
    "",
    `Client: ${summary.client_name || "Not submitted yet."}`,
    `Company: ${summary.company_name || "Not submitted yet."}`,
    `Industry: ${summary.industry || "Not submitted yet."}`,
    "",
    "Business",
    summary.what_business_does || "Not submitted yet.",
    "",
    "Target Audience",
    summary.target_customer || "Not submitted yet.",
    "",
    "Brand Goal / Why Choose Us",
    summary.why_choose_us || "Not submitted yet.",
    "",
    "Desired Brand Feeling",
    summary.brand_feeling || "Not submitted yet.",
    "",
    "Audience Archetype",
    summary.audience_archetype || "Not submitted yet.",
    "",
    "Brand Personality Sliders",
    formatBriefSliders(summary.sliders),
    "",
    "Emotions",
    formatBriefList(summary.emotions),
    "",
    "Visual Direction",
    formatBriefList(summary.visual_styles),
    "",
    "Competitors",
    formatBriefCompetitors(summary.top_competitors),
  ].join("\n");
}

function buildEnhancedBrief(summary) {
  const company = summary.company_name || "the brand";
  const industry = summary.industry || "its category";
  const business = summary.what_business_does || "a focused client offering";
  const audience = summary.target_customer || "the target audience";
  const reason = summary.why_choose_us || "a clearer and more valuable client experience";
  const feeling = summary.brand_feeling || "clear, confident, and memorable";
  const archetype = summary.audience_archetype || "quality-focused buyers";
  const emotions = formatBriefList(summary.emotions).toLowerCase();
  const styles = formatBriefList(summary.visual_styles).toLowerCase();
  const sliders = formatBriefSliders(summary.sliders).toLowerCase();
  const competitors = formatBriefCompetitors(summary.top_competitors);

  return {
    business: `${company} should be framed as a refined ${industry} brand with a clear, confident explanation of its work: ${business}. The designer should make the offer feel immediate, credible, and easy to understand at first glance.`,
    targetAudience: `The visual and verbal direction should speak directly to ${audience}. Every touchpoint should feel relevant to this audience's expectations, decision-making style, and level of trust needed before they engage.`,
    brandGoal: `The brand should clearly communicate why clients should choose ${company}: ${reason}. This should come through as a strong positioning idea, not only as supporting copy.`,
    brandFeeling: `The desired emotional impression is ${feeling}. The identity should feel intentional, polished, and memorable while avoiding anything generic or overly decorative.`,
    audienceArchetype: `Primary audience archetype: ${archetype}. Personality slider cues: ${sliders}. Design choices should respect this mindset through tone, pacing, hierarchy, and visual confidence.`,
    emotions: `Core emotional cues to preserve: ${emotions}. These should guide typography, color, composition, photography style, and interaction tone.`,
    visualDirection: `Recommended visual direction: ${styles}. Treat this as the creative foundation for moodboards, brand exploration, and early concept routes.`,
    competitors: `Competitive references:\n${competitors}\nUse these notes to understand what the client is drawn to or avoiding, then build a direction that feels distinct rather than imitative.`,
  };
}

function downloadClientBrief(summary) {
  if (!hasDiscoverySummary(summary)) {
    return;
  }

  const blob = new Blob([buildClientBriefText(summary)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = getBriefFileName(summary.company_name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BriefValue({ children }) {
  return <p className="discovery-form-value">{children || "Not submitted yet."}</p>;
}

function isAfterDate(value, comparisonValue) {
  const date = new Date(value);
  const comparisonDate = new Date(comparisonValue);

  if (Number.isNaN(date.getTime()) || Number.isNaN(comparisonDate.getTime())) {
    return false;
  }

  return date.getTime() > comparisonDate.getTime();
}

function BrandDnaPanel({ summary, brandDNA, generatingBrandDNA, brandDNAError, onGenerateBrandDNA }) {
  const hasSummary = hasDiscoverySummary(summary);
  const hasBrandDNA = Boolean(brandDNA);
  const [showEnhancedBrief, setShowEnhancedBrief] = useState(false);
  const enhancedBrief = hasSummary ? buildEnhancedBrief(summary) : {};
  const isStaleBrandDNA = Boolean(
    hasBrandDNA &&
      summary?.discovery_updated_at &&
      brandDNA?.updated_at &&
      isAfterDate(summary.discovery_updated_at, brandDNA.updated_at)
  );
  const savedBrief = hasBrandDNA ? {
    business: brandDNA.business_summary,
    targetAudience: brandDNA.target_audience_summary,
    brandGoal: brandDNA.positioning_summary,
    brandFeeling: brandDNA.brand_feeling_summary,
    audienceArchetype: brandDNA.brand_personality_cluster,
    emotions: enhancedBrief.emotions,
    visualDirection: brandDNA.visual_direction_summary,
    competitors: brandDNA.competitor_summary,
  } : {
    business: summary?.what_business_does,
    targetAudience: summary?.target_customer,
    brandGoal: summary?.why_choose_us,
    brandFeeling: summary?.brand_feeling,
    audienceArchetype: summary?.audience_archetype,
    emotions: formatBriefList(summary?.emotions),
    visualDirection: formatBriefList(summary?.visual_styles),
    competitors: formatBriefCompetitors(summary?.top_competitors),
  };
  const brief = showEnhancedBrief ? enhancedBrief : savedBrief;

  return (
    <div className="discovery-stack">
      <section className="discovery-brand-hero">
        <div className="discovery-brand-kicker">Brand Personality Cluster</div>
        <h2 className="discovery-brand-title">
          {hasBrandDNA ? brandDNA.brand_personality_cluster : hasSummary ? "Discovery received" : "Not generated yet"}
        </h2>
        <button
          className="discovery-brand-pill"
          type="button"
          onClick={onGenerateBrandDNA}
          disabled={!hasSummary || generatingBrandDNA}
        >
          {generatingBrandDNA ? "Generating Brand DNA..." : hasBrandDNA ? "Brand DNA generated" : hasSummary ? "Ready to generate Brand DNA" : "Waiting for client discovery"}
        </button>
      </section>

      {hasSummary || hasBrandDNA ? (
        <section className="discovery-card discovery-form-card">
          <div className="discovery-form-block">
            <div className="discovery-form-label">Business</div>
            <BriefValue>{brief.business}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Target Audience</div>
            <BriefValue>{brief.targetAudience}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Brand Goal / Why Choose Us</div>
            <BriefValue>{brief.brandGoal}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Desired Brand Feeling</div>
            <BriefValue>{brief.brandFeeling}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Audience Archetype</div>
            <BriefValue>{brief.audienceArchetype}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Brand personality sliders</div>
            <DiscoverySliderValue sliders={summary?.sliders} />
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Emotions</div>
            <BriefValue>{brief.emotions}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Visual Direction</div>
            <BriefValue>{brief.visualDirection}</BriefValue>
          </div>

          <div className="discovery-form-block">
            <div className="discovery-form-label">Competitors</div>
            <BriefValue>{brief.competitors}</BriefValue>
          </div>

          {generatingBrandDNA ? (
              <div className="discovery-form-block">
                <div className="discovery-form-label">Generating</div>
                <BriefValue>Creating and saving the Brand DNA report from client discovery...</BriefValue>
              </div>
            ) : null}

          {brandDNAError ? (
            <div className="discovery-form-block">
              <div className="discovery-form-label">Generation issue</div>
              <BriefValue>{brandDNAError}</BriefValue>
            </div>
          ) : null}

          {isStaleBrandDNA ? (
            <div className="discovery-form-block">
              <div className="discovery-form-label">Brand DNA update needed</div>
              <BriefValue>
                The client updated the Discovery information after the last Brand DNA generation. Please regenerate Brand DNA to reflect the latest client input.
              </BriefValue>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="discovery-inline-actions">
        <button
          className="btn btn-secondary discovery-wide-btn"
          type="button"
          onClick={() => setShowEnhancedBrief(true)}
          disabled={!hasSummary || showEnhancedBrief}
        >
          {showEnhancedBrief ? "Enhanced brief ready" : "+ Enhance with AI"}
        </button>
        <button
          className="discovery-text-action"
          type="button"
          onClick={() => downloadClientBrief(summary)}
        >
          Export brief
        </button>
      </div>
    </div>
  );
}

function hasDiscoverySummary(summary) {
  return Boolean(
    summary &&
      (
        summary.client_name ||
        summary.company_name ||
        summary.industry ||
        summary.what_business_does ||
        summary.target_customer ||
        summary.why_choose_us ||
        summary.brand_feeling ||
        summary.audience_archetype ||
        summary.sliders?.length ||
        summary.emotions?.length ||
        summary.visual_styles?.length ||
        summary.top_competitors?.length
      )
  );
}

function DiscoveryListValue({ items, emptyText }) {
  if (!items?.length) {
    return <p className="discovery-form-value">{emptyText}</p>;
  }

  return (
    <p className="discovery-form-value">
      {items.join(", ")}
    </p>
  );
}

function DiscoveryCompetitorValue({ competitors }) {
  if (!competitors?.length) {
    return <p className="discovery-form-value">No competitors submitted yet.</p>;
  }

  return (
    <div className="discovery-info-list">
      {competitors.map((competitor) => (
        <div className="discovery-info-row" key={`${competitor.name}-${competitor.rating}`}>
          <span>
            {competitor.name || "Unnamed competitor"}
            {competitor.reason ? ` - ${competitor.reason}` : ""}
          </span>
          <strong>{competitor.rating || "neutral"}</strong>
        </div>
      ))}
    </div>
  );
}

function DiscoverySliderValue({ sliders }) {
  if (!sliders?.length) {
    return <p className="discovery-form-value">No personality sliders submitted yet.</p>;
  }

  return (
    <div className="discovery-info-list">
      {sliders.map((slider) => (
        <div className="discovery-info-row" key={slider.slider_key}>
          <span>{slider.left_label || "Left"} / {slider.right_label || "Right"}</span>
          <strong>{formatSliderValue(slider)}</strong>
        </div>
      ))}
    </div>
  );
}

function DiscoveryAnswersPanel({ summary, loading }) {
  if (loading) {
    return (
      <section className="discovery-card discovery-form-card">
        <div className="discovery-form-block">
          <div className="discovery-form-label">Discovery answers</div>
          <p className="discovery-form-value">Loading client discovery summary...</p>
        </div>
      </section>
    );
  }

  if (!hasDiscoverySummary(summary)) {
    return (
      <section className="discovery-card discovery-form-card">
        <div className="discovery-form-block">
          <div className="discovery-form-label">Discovery answers</div>
          <p className="discovery-form-value">Client discovery answers are not connected yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="discovery-card discovery-form-card">
      <div className="discovery-form-block">
        <div className="discovery-form-label">Client</div>
        <p className="discovery-form-value">
          {[summary.client_name, summary.company_name, summary.industry].filter(Boolean).join(" - ")}
        </p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">What business does</div>
        <p className="discovery-form-value">{summary.what_business_does || "Not submitted yet."}</p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Target customer</div>
        <p className="discovery-form-value">{summary.target_customer || "Not submitted yet."}</p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Why choose us</div>
        <p className="discovery-form-value">{summary.why_choose_us || "Not submitted yet."}</p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Brand feeling</div>
        <p className="discovery-form-value">{summary.brand_feeling || "Not submitted yet."}</p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Audience archetype</div>
        <p className="discovery-form-value">{summary.audience_archetype || "Not submitted yet."}</p>
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Brand personality sliders</div>
        <DiscoverySliderValue sliders={summary.sliders} />
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Emotions</div>
        <DiscoveryListValue items={summary.emotions} emptyText="No emotions submitted yet." />
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Visual styles</div>
        <DiscoveryListValue items={summary.visual_styles} emptyText="No visual styles submitted yet." />
      </div>

      <div className="discovery-form-block">
        <div className="discovery-form-label">Top competitors</div>
        <DiscoveryCompetitorValue competitors={summary.top_competitors} />
      </div>
    </section>
  );
}

function MoodboardsPanel({ projectId, onProjectRefresh }) {
  const [moodboards, setMoodboards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const imageInputRef = useRef(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    image: null,
  });

  const loadMoodboards = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);

    try {
      const data = await getMoodboards(projectId);
      setMoodboards(Array.isArray(data) ? data : []);
    } catch (loadError) {
      console.error("Failed to load moodboards:", loadError);
      setMoodboards([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      await loadMoodboards();
    };

    load();
  }, [loadMoodboards]);

  async function handleUpload(event) {
    event.preventDefault();
    const uploadForm = event.currentTarget;

    if (!projectId || !form.title.trim() || !form.image) {
      const message = "Please add a title and image before uploading.";
      setError(message);
      showError(message);
      return;
    }

    const formData = new FormData();
    formData.append("title", form.title.trim());
    formData.append("description", form.description.trim());
    formData.append("image", form.image);

    setSaving(true);
    setError("");

    try {
      const createdMoodboard = await uploadMoodboard(projectId, formData);
      if (createdMoodboard && createdMoodboard.id) {
        setMoodboards((current) => [
          createdMoodboard,
          ...current.filter((item) => item.id !== createdMoodboard.id),
        ]);
      }
      setForm({ title: "", description: "", image: null });
      uploadForm.reset();
      showSuccess("Moodboard uploaded.");
    } catch (uploadError) {
      console.error("Failed to upload moodboard:", uploadError);
      const message = getApiErrorMessage(
        uploadError,
        "Unable to upload moodboard. Please try again."
      );
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleClearMoodboardImage() {
    setForm((current) => ({ ...current, image: null }));

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">
          {moodboards.length ? `${moodboards.length} moodboard${moodboards.length === 1 ? "" : "s"} uploaded` : "No moodboards uploaded"}
        </div>
      </div>
      <section className="discovery-card discovery-panel">
        <div className="discovery-moodboard-head">
          <div>
            <h2 className="discovery-panel-title">Moodboards</h2>
            <p>Create polished visual directions for client review. Add one clear image, a concise title, and a short note for each option.</p>
          </div>
          <span>{moodboards.length} uploaded</span>
        </div>
        <form className="discovery-moodboard-upload" onSubmit={handleUpload}>
          <div className="discovery-moodboard-fields">
            <label>
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Moodboard title"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Short direction note"
              />
            </label>
          </div>
          <label className={`discovery-moodboard-dropzone ${form.image ? "has-file" : ""}`}>
            <input
              ref={imageInputRef}
              className="discovery-moodboard-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => setForm((current) => ({ ...current, image: event.target.files?.[0] || null }))}
            />
            <span>Image upload</span>
            <strong>{form.image ? "Image ready to upload" : "Choose or drop moodboard image"}</strong>
            <small>{form.image ? "Review the selected file below." : "PNG, JPG, or WebP recommended under 10 MB."}</small>
          </label>
          {form.image ? (
            <div className="discovery-moodboard-selected-file">
              <div>
                <span>Selected file</span>
                <strong>{form.image.name}</strong>
                <small>{form.image.type || "Image"} - {formatFileSize(form.image.size)}</small>
              </div>
              <button type="button" onClick={handleClearMoodboardImage}>
                Remove
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="discovery-moodboard-error">
              {error}
            </div>
          ) : null}
          <div className="discovery-moodboard-actions">
            <button className="btn btn-secondary discovery-upload-btn" type="submit" disabled={saving}>
              {saving ? "Uploading..." : "+ Upload moodboard"}
            </button>
          </div>
        </form>
      </section>
      <section className="discovery-card discovery-panel">
        <div className="discovery-moodboard-head">
          <div>
            <h2 className="discovery-panel-title">Uploaded moodboards</h2>
            <p>Track shared directions and the client-selected option.</p>
          </div>
        </div>
        <div className="discovery-moodboard-list">
          {loading ? (
            <div className="discovery-moodboard-empty">
              <strong>Loading moodboards...</strong>
              <span>Please wait while directions are fetched.</span>
            </div>
          ) : null}
          {!loading && moodboards.length === 0 ? (
            <div className="discovery-moodboard-empty">
              <strong>No moodboards found</strong>
              <span>Upload the first visual direction to begin moodboard review.</span>
            </div>
          ) : null}
          {moodboards.map((item) => (
            <div className={`discovery-moodboard-list-card ${item.is_selected ? "selected" : ""}`} key={item.id}>
              <ProtectedAssetImage
                src={item.image_url}
                asBackground
                className="discovery-moodboard-preview"
                fallbackText="No image"
              >
                {item.is_selected ? <strong>Selected</strong> : null}
              </ProtectedAssetImage>
              <div className="discovery-moodboard-content">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description || "No description added."}</p>
                </div>
                {item.image_url ? (
                  <button
                    type="button"
                    className="discovery-moodboard-link"
                    onClick={() => downloadProtectedAsset(item.image_url, `moodboard-${item.id}.jpg`)}
                  >
                    View image
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConceptsPanel({ projectId, onProjectRefresh }) {
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharingId, setSharingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const conceptImageInputRef = useRef(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    image: null,
  });
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    image: null,
  });

  const loadConcepts = useCallback(async () => {
    if (!projectId) {
      setConcepts([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await getConcepts(projectId);
      setConcepts(Array.isArray(data) ? data : data?.results || []);
    } catch (loadError) {
      console.error("Failed to load concepts:", loadError);
      setError("Unable to load project concepts.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConcepts();
  }, [loadConcepts]);

  async function handleUpload(event) {
    event.preventDefault();
    const uploadForm = event.currentTarget;

    if (!projectId || !form.title.trim() || !form.image) {
      const message = "Please add a title and upload a preview image.";
      setError(message);
      showError(message);
      return;
    }

    const formData = new FormData();
    formData.append("title", form.title.trim());
    formData.append("description", form.description.trim());

    if (form.image) {
      formData.append("image", form.image);
    }

    setSaving(true);
    setError("");

    try {
      await uploadConcept(projectId, formData);
      setForm({ title: "", description: "", image: null });
      uploadForm.reset();
      showSuccess("Concept uploaded.");
      await loadConcepts();
      await onProjectRefresh?.();
    } catch (uploadError) {
      console.error("Failed to upload concept:", uploadError);
      const message = getApiErrorMessage(uploadError, "Unable to upload concept. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  function handleClearConceptImage() {
    setForm((current) => ({ ...current, image: null }));

    if (conceptImageInputRef.current) {
      conceptImageInputRef.current.value = "";
    }
  }

  async function handleShare(conceptId) {
    if (!projectId || !conceptId) {
      return;
    }

    setSharingId(conceptId);
    setError("");

    try {
      await shareConcept(projectId, conceptId);
      showSuccess("Concept shared with client.");
      await loadConcepts();
      await onProjectRefresh?.();
    } catch (shareError) {
      console.error("Failed to share concept:", shareError);
      const message = getApiErrorMessage(shareError, "Unable to share concept. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSharingId(null);
    }
  }

  function startEditConcept(concept) {
    if (concept.status === "approved") {
      return;
    }

    if (
      concept.status === "shared" &&
      !window.confirm("Editing this shared concept will move it back to Draft and hide it from the client until it is shared again.")
    ) {
      return;
    }

    if (
      concept.status === "changes_requested" &&
      !window.confirm("Editing this concept will move it back to Draft. Share it again after completing the requested changes.")
    ) {
      return;
    }

    setEditingId(concept.id);
    setEditForm({
      title: concept.title || "",
      description: concept.description || "",
      image: null,
      file: null,
    });
    setError("");
  }

  function cancelEditConcept() {
    setEditingId(null);
    setEditForm({
      title: "",
      description: "",
      image: null,
      file: null,
    });
  }

  async function handleEditConcept(event, conceptId) {
    event.preventDefault();

    if (!projectId || !conceptId || !editForm.title.trim()) {
      const message = "Please add a title before saving changes.";
      setError(message);
      showError(message);
      return;
    }

    const formData = new FormData();
    formData.append("title", editForm.title.trim());
    formData.append("description", editForm.description.trim());

    if (editForm.image) {
      formData.append("image", editForm.image);
    }

    if (editForm.file) {
      formData.append("file", editForm.file);
    }

    setSavingEditId(conceptId);
    setError("");

    try {
      await updateConcept(projectId, conceptId, formData);
      cancelEditConcept();
      showSuccess("Concept updated.");
      await loadConcepts();
      await onProjectRefresh?.();
    } catch (editError) {
      console.error("Failed to update concept:", editError);
      const message = getApiErrorMessage(editError, "Unable to update concept. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSavingEditId(null);
    }
  }

  async function handleDeleteConcept(concept) {
    if (!projectId || !concept?.id || concept.status === "approved") {
      return;
    }

    const confirmed = window.confirm(`Delete '${concept.title}'? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeletingId(concept.id);
    setError("");

    try {
      await deleteConcept(projectId, concept.id);
      if (editingId === concept.id) {
        cancelEditConcept();
      }
      showSuccess("Concept deleted.");
      await loadConcepts();
      await onProjectRefresh?.();
    } catch (deleteError) {
      console.error("Failed to delete concept:", deleteError);
      const message = getApiErrorMessage(deleteError, "Unable to delete concept. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">
          {concepts.length ? `${concepts.length} concept${concepts.length === 1 ? "" : "s"} uploaded` : "No concepts uploaded"}
        </div>
      </div>
      <section className="discovery-card discovery-panel">
        <div className="discovery-moodboard-head">
          <div>
            <h2 className="discovery-panel-title">Concepts</h2>
            <p>Upload client-ready concept routes with a preview image and concise rationale.</p>
          </div>
          <span>{concepts.length} uploaded</span>
        </div>
        <form className="discovery-concept-upload" onSubmit={handleUpload}>
          <div className="discovery-moodboard-fields">
            <label>
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Concept title"
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Short concept note"
              />
            </label>
          </div>
          <div className="discovery-concept-upload-files">
            <label className={`discovery-moodboard-dropzone ${form.image ? "has-file" : ""}`}>
              <input
                ref={conceptImageInputRef}
                className="discovery-moodboard-file-input"
                type="file"
                accept="image/*"
                onChange={(event) => setForm((current) => ({ ...current, image: event.target.files?.[0] || null }))}
              />
              <span>Preview image</span>
              <strong>{form.image ? "Preview image selected" : "Choose preview image"}</strong>
              <small>{form.image ? "This image will represent the concept card." : "PNG, JPG, or WebP recommended."}</small>
            </label>
          </div>
          {form.image ? (
            <div className="discovery-moodboard-selected-file">
              <div>
                <span>Selected preview</span>
                <strong>{form.image.name}</strong>
                <small>{form.image.type || "Image"} - {formatFileSize(form.image.size)}</small>
              </div>
              <button type="button" onClick={handleClearConceptImage}>
                Remove
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="discovery-moodboard-error">
              {error}
            </div>
          ) : null}
          <div className="discovery-moodboard-actions">
            <button className="btn btn-secondary discovery-upload-btn" type="submit" disabled={saving}>
              {saving ? "Uploading..." : "+ Upload concept"}
            </button>
          </div>
        </form>
      </section>
      <section className="discovery-card discovery-panel">
        <div className="discovery-moodboard-head">
          <div>
            <h2 className="discovery-panel-title">Uploaded concepts</h2>
            <p>Review versions, status, client feedback, and available concept files.</p>
          </div>
        </div>
        <div className="discovery-moodboard-list">
          {loading ? (
            <div className="discovery-moodboard-empty">
              <strong>Loading concepts...</strong>
              <span>Please wait while concept routes are fetched.</span>
            </div>
          ) : null}
          {!loading && concepts.length === 0 ? (
            <div className="discovery-moodboard-empty">
              <strong>No concepts found</strong>
              <span>Upload the first concept route when the visual direction is ready.</span>
            </div>
          ) : null}
          {concepts.length > 0 ? (
            <div className="discovery-concept-grid">
              {concepts.map((item) => (
                <article className="discovery-concept-card" key={item.id}>
                  <ProtectedAssetImage
                    src={item.image_url}
                    asBackground
                    className="discovery-concept-preview"
                    fallbackText="No preview"
                  />

                  <div className="discovery-concept-body">
                    <div className="discovery-concept-heading">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.description || "No description"}</p>
                      </div>
                      <span className={`badge ${getConceptStatusClass(item.status)}`}>
                        {getConceptStatusLabel(item.status)}
                      </span>
                    </div>

                    <div className="discovery-concept-meta">
                      <span>Version {item.version}</span>
                      <span>{formatActivityDate(item.created_at)}</span>
                    </div>

                    {item.status === "changes_requested" && item.client_feedback ? (
                      <div className="discovery-concept-feedback">
                        <span>Client Feedback</span>
                        <p>{item.client_feedback}</p>
                      </div>
                    ) : null}

                    {editingId === item.id ? (
                      <form
                        className="discovery-concept-edit"
                        onSubmit={(event) => handleEditConcept(event, item.id)}
                      >
                        <label>
                          <span>Title</span>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Description</span>
                          <textarea
                            value={editForm.description}
                            onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Replace image</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => setEditForm((current) => ({ ...current, image: event.target.files?.[0] || null }))}
                          />
                        </label>
                        <FileDetails file={editForm.image} />
                        <label>
                          <span>Replace file</span>
                          <input
                            type="file"
                            accept="application/pdf,image/*,.zip,.ai,.psd,.fig"
                            onChange={(event) => setEditForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                          />
                        </label>
                        <FileDetails file={editForm.file} />
                        <div className="discovery-concept-actions">
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="submit"
                            disabled={savingEditId === item.id}
                          >
                            {savingEditId === item.id ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="button"
                            disabled={savingEditId === item.id}
                            onClick={cancelEditConcept}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <div className="discovery-concept-actions">
                      {item.status === "draft" ? (
                        <button
                          className="btn btn-secondary discovery-upload-btn"
                          type="button"
                          disabled={sharingId === item.id}
                          onClick={() => handleShare(item.id)}
                        >
                          {sharingId === item.id ? "Sharing..." : "Share with Client"}
                        </button>
                      ) : item.status === "shared" ? (
                        <span className="badge badge-green">Shared</span>
                      ) : null}
                      {item.status === "approved" ? (
                        <span className="badge badge-green">Locked</span>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="button"
                            disabled={editingId === item.id || savingEditId === item.id || deletingId === item.id}
                            onClick={() => startEditConcept(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="button"
                            disabled={editingId === item.id || deletingId === item.id || savingEditId === item.id}
                            onClick={() => handleDeleteConcept(item)}
                          >
                            {deletingId === item.id ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}
                      {item.image_url ? (
                        <button
                          type="button"
                          className="btn btn-secondary discovery-upload-btn"
                          onClick={() => downloadProtectedAsset(item.image_url, `concept-image-${item.id}.jpg`)}
                        >
                          View image
                        </button>
                      ) : null}
                      {item.file_url ? (
                        <button
                          type="button"
                          className="btn btn-secondary discovery-upload-btn"
                          onClick={() => downloadProtectedAsset(item.file_url, `concept-file-${item.id}`)}
                        >
                          View file
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DeliverablesPanel({ projectId, onProjectRefresh }) {
  const [deliverables, setDeliverables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharingId, setSharingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    file: null,
  });
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    file: null,
  });

  const loadDeliverables = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);

    try {
      const data = await getDeliverables(projectId);
      setDeliverables(Array.isArray(data) ? data : []);
    } catch (loadError) {
      console.error("Failed to load deliverables:", loadError);
      setDeliverables([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      await loadDeliverables();
    };

    load();
  }, [loadDeliverables]);

  async function handleUpload(event) {
    event.preventDefault();
    const uploadForm = event.currentTarget;

    if (!projectId || !form.title.trim() || !form.file) {
      const message = "Please add a title and upload a deliverable file.";
      setError(message);
      showError(message);
      return;
    }

    const formData = new FormData();
    formData.append("title", form.title.trim());
    formData.append("description", form.description.trim());
    formData.append("file", form.file);

    setSaving(true);
    setError("");

    try {
      await uploadDeliverable(projectId, formData);
      setForm({ title: "", description: "", file: null });
      uploadForm.reset();
      await loadDeliverables();
      showSuccess("Deliverable uploaded.");
      await onProjectRefresh?.();
    } catch (uploadError) {
      console.error("Failed to upload deliverable:", uploadError);
      const message = getApiErrorMessage(uploadError, "Unable to upload deliverable. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleShare(deliverableId) {
    if (!projectId || !deliverableId) {
      return;
    }

    setSharingId(deliverableId);
    setError("");

    try {
      await shareDeliverable(projectId, deliverableId);
      showSuccess("Deliverable shared with client.");
      await loadDeliverables();
      await onProjectRefresh?.();
    } catch (shareError) {
      console.error("Failed to share deliverable:", shareError);
      const message = getApiErrorMessage(shareError, "Unable to share deliverable. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSharingId(null);
    }
  }

  function startEditDeliverable(deliverable) {
    if (
      deliverable.status === "shared" &&
      !window.confirm("Editing this shared deliverable will move it back to Draft and hide it from the client until it is shared again.")
    ) {
      return;
    }

    setEditingId(deliverable.id);
    setEditForm({
      title: deliverable.title || "",
      description: deliverable.description || "",
      file: null,
    });
    setError("");
  }

  function cancelEditDeliverable() {
    setEditingId(null);
    setEditForm({
      title: "",
      description: "",
      file: null,
    });
  }

  async function handleEditDeliverable(event, deliverableId) {
    event.preventDefault();

    if (!projectId || !deliverableId || !editForm.title.trim()) {
      const message = "Please add a title before saving changes.";
      setError(message);
      showError(message);
      return;
    }

    const formData = new FormData();
    formData.append("title", editForm.title.trim());
    formData.append("description", editForm.description.trim());

    if (editForm.file) {
      formData.append("file", editForm.file);
    }

    setSavingEditId(deliverableId);
    setError("");

    try {
      await updateDeliverable(projectId, deliverableId, formData);
      cancelEditDeliverable();
      showSuccess("Deliverable updated.");
      await loadDeliverables();
      await onProjectRefresh?.();
    } catch (editError) {
      console.error("Failed to update deliverable:", editError);
      const message = getApiErrorMessage(editError, "Unable to update deliverable. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setSavingEditId(null);
    }
  }

  async function handleDeleteDeliverable(deliverable) {
    if (!projectId || !deliverable?.id) {
      return;
    }

    const confirmed = window.confirm(`Delete '${deliverable.title}'? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeletingId(deliverable.id);
    setError("");

    try {
      await deleteDeliverable(projectId, deliverable.id);
      if (editingId === deliverable.id) {
        cancelEditDeliverable();
      }
      showSuccess("Deliverable deleted.");
      await loadDeliverables();
      await onProjectRefresh?.();
    } catch (deleteError) {
      console.error("Failed to delete deliverable:", deleteError);
      const message = getApiErrorMessage(deleteError, "Unable to delete deliverable. Please try again.");
      setError(message);
      showError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">
          {deliverables.length ? `${deliverables.length} deliverable${deliverables.length === 1 ? "" : "s"} uploaded` : "No deliverables uploaded"}
        </div>
      </div>
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Deliverables</h2>
        <form className="discovery-info-list" onSubmit={handleUpload}>
          <label className="discovery-info-row">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Deliverable title"
            />
          </label>
          <label className="discovery-info-row">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Short delivery note"
            />
          </label>
          <label className="discovery-info-row">
            <span>File</span>
            <input
              type="file"
              accept="application/pdf,image/*,.zip,.ai,.psd,.fig,.doc,.docx"
              onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
            />
          </label>
          <FileDetails file={form.file} />
          {error ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>{error}</strong>
            </div>
          ) : null}
          <button className="btn btn-secondary discovery-upload-btn" type="submit" disabled={saving}>
            {saving ? "Uploading..." : "+ Upload deliverable"}
          </button>
        </form>
      </section>
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Uploaded deliverables</h2>
        <div className="discovery-info-list">
          {loading ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>Loading deliverables...</strong>
            </div>
          ) : null}
          {!loading && deliverables.length === 0 ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>No deliverables found</strong>
            </div>
          ) : null}
          {deliverables.length > 0 ? (
            <div className="discovery-concept-grid">
              {deliverables.map((item) => (
                <article className="discovery-concept-card" key={item.id}>
                  <div className="discovery-concept-body">
                    <div className="discovery-concept-heading">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.description || "No description"}</p>
                      </div>
                      <span className={`badge ${getDeliverableStatusClass(item.status)}`}>
                        {getDeliverableStatusLabel(item.status)}
                      </span>
                    </div>

                    <div className="discovery-concept-meta">
                      <span>{item.file_name || "File attached"}</span>
                      <span>{formatFileSize(item.file_size)}</span>
                      <span>{formatActivityDate(item.created_at)}</span>
                    </div>

                    {editingId === item.id ? (
                      <form
                        className="discovery-concept-edit"
                        onSubmit={(event) => handleEditDeliverable(event, item.id)}
                      >
                        <label>
                          <span>Title</span>
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Description</span>
                          <textarea
                            value={editForm.description}
                            onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Replace file</span>
                          <input
                            type="file"
                            accept="application/pdf,image/*,.zip,.ai,.psd,.fig,.doc,.docx"
                            onChange={(event) => setEditForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                          />
                        </label>
                        <FileDetails file={editForm.file} />
                        <div className="discovery-concept-actions">
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="submit"
                            disabled={savingEditId === item.id}
                          >
                            {savingEditId === item.id ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            className="btn btn-secondary discovery-upload-btn"
                            type="button"
                            disabled={savingEditId === item.id}
                            onClick={cancelEditDeliverable}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <div className="discovery-concept-actions">
                      {item.status === "draft" ? (
                        <button
                          className="btn btn-secondary discovery-upload-btn"
                          type="button"
                          disabled={sharingId === item.id}
                          onClick={() => handleShare(item.id)}
                        >
                          {sharingId === item.id ? "Sharing..." : "Share with Client"}
                        </button>
                      ) : item.status === "shared" ? (
                        <span className="badge badge-green">Shared</span>
                      ) : null}
                      <button
                        className="btn btn-secondary discovery-upload-btn"
                        type="button"
                        disabled={editingId === item.id || savingEditId === item.id || deletingId === item.id}
                        onClick={() => startEditDeliverable(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary discovery-upload-btn"
                        type="button"
                        disabled={editingId === item.id || deletingId === item.id || savingEditId === item.id}
                        onClick={() => handleDeleteDeliverable(item)}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                      {item.file_url ? (
                        <button
                          type="button"
                          className="btn btn-secondary discovery-upload-btn"
                          onClick={() => downloadProtectedAsset(item.file_url, `deliverable-${item.id}`)}
                        >
                          View file
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AgreementPanel({ projectId, onProjectRefresh }) {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [requestingSignature, setRequestingSignature] = useState(false);
  const [retryingSignedEmail, setRetryingSignedEmail] = useState(false);
  const [error, setError] = useState("");

  const loadAgreement = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await getAgreement(projectId);
      setAgreement(data);
    } catch (loadError) {
      setAgreement(null);

      if (loadError?.detail !== "Agreement not found.") {
        setError(getApiErrorMessage(loadError, "Agreement is not ready yet."));
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  async function handleGenerateAgreement() {
    if (!projectId) {
      return;
    }

    setGenerating(true);
    setError("");

    try {
      const data = await generateAgreement(projectId);
      setAgreement(data);
      showSuccess("Basic agreement generated.");
      await onProjectRefresh?.();
    } catch (generateError) {
      const message = getApiErrorMessage(generateError, "Unable to generate agreement.");
      setError(message);
      showError(message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleShareAgreement() {
    if (!projectId || !agreement) {
      return;
    }

    setSharing(true);
    setError("");

    try {
      const data = await shareAgreement(projectId, { resend: Boolean(agreement.shared_at) });
      setAgreement(data);
      showSuccess(agreement.shared_at ? "Agreement resent to client." : "Agreement shared with client.");
      await onProjectRefresh?.();
    } catch (shareError) {
      const message = getApiErrorMessage(shareError, "Unable to share agreement.");
      setError(message);
      showError(message);
    } finally {
      setSharing(false);
    }
  }

  async function handleRequestSignature() {
    if (!projectId || !agreement) {
      return;
    }

    setRequestingSignature(true);
    setError("");

    try {
      const data = await requestAgreementSignature(projectId, {
        resend: Boolean(agreement.signature_requested_at),
      });
      setAgreement(data);
      showSuccess(
        data.email_error
          ? "Signature request saved, but email sending failed."
          : agreement.signature_requested_at
            ? "Signature request resent."
            : "Signature requested from client."
      );
      await onProjectRefresh?.();
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, "Unable to request signature.");
      setError(message);
      showError(message);
    } finally {
      setRequestingSignature(false);
    }
  }

  async function handleRetrySignedEmail() {
    if (!projectId || !agreement) {
      return;
    }

    setRetryingSignedEmail(true);
    setError("");

    try {
      const data = await retrySignedAgreementEmail(projectId);
      setAgreement(data);
      showSuccess("Signed agreement email sent.");
    } catch (retryError) {
      const message = getApiErrorMessage(retryError, "Unable to resend signed agreement email.");
      setError(message);
      showError(message);
    } finally {
      setRetryingSignedEmail(false);
    }
  }

  useEffect(() => {
    const load = async () => {
      await loadAgreement();
    };

    load();
  }, [loadAgreement]);

  const statusLabel = agreement
    ? getAgreementStatusLabel(agreement.status)
    : "Not generated yet";
  const agreementPdfUrl = agreement?.signed_pdf_url || agreement?.basic_pdf_url || "";
  const versionHistory = Array.isArray(agreement?.version_history) ? agreement.version_history : [];
  const canRequestSignature = Boolean(
    agreement?.basic_pdf_url
    && !agreement?.signed_at
  );
  const isSignedAgreement = Boolean(agreement?.signed_at);
  const signatureStatus = agreement
    ? isSignedAgreement
      ? `Signed ${formatActivityDate(agreement.signed_at) || ""}`.trim()
      : agreement.signature_requested_at
        ? `Requested ${formatActivityDate(agreement.signature_requested_at) || ""}`.trim()
        : "Not requested"
    : "Not available";
  const clientAccessStatus = agreement
    ? isSignedAgreement
      ? agreement.shared_at
        ? "Latest agreement shared"
        : "Signed"
      : agreement.signature_requested_at
        ? "Signature request sent"
        : "Not shared yet"
    : "Not available";

  return (
    <section className="discovery-card discovery-agreement-card">
      <h2 className="discovery-panel-title">Service Agreement</h2>
      <div className="discovery-agreement-icon">DOC</div>
      {loading ? (
        <div className="discovery-info-list">
          <div className="discovery-info-row">
            <span>Status</span>
            <strong>Loading agreement...</strong>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="discovery-info-list">
          {agreement ? (
            <>
              <div className="discovery-agreement-summary-grid">
                <div className="discovery-agreement-summary-item">
                  <span>Agreement Status</span>
                  <strong>{statusLabel}</strong>
                </div>
                <div className="discovery-agreement-summary-item">
                  <span>Current Version</span>
                  <strong>v{agreement.current_version || 1}</strong>
                </div>
                <div className="discovery-agreement-summary-item">
                  <span>Generated At</span>
                  <strong>{formatActivityDate(agreement.generated_at) || "Not available"}</strong>
                </div>
                <div className="discovery-agreement-summary-item">
                  <span>Last Updated</span>
                  <strong>{formatActivityDate(agreement.last_updated_at) || "Not available"}</strong>
                </div>
                <div className="discovery-agreement-summary-item">
                  <span>Signature Status</span>
                  <strong>{signatureStatus}</strong>
                </div>
                <div className="discovery-agreement-summary-item">
                  <span>Client Access Status</span>
                  <strong>{clientAccessStatus}</strong>
                </div>
              </div>
              {agreement.signature_request_email_failed_at ? (
                <div className="discovery-info-row">
                  <span>Request Email</span>
                  <strong>Failed - resend request</strong>
                </div>
              ) : null}
              {agreement.signed_email_failed_at ? (
                <div className="discovery-info-row">
                  <span>Signed Email</span>
                  <strong>Failed - retry available</strong>
                </div>
              ) : null}
              <div className="discovery-concept-actions">
                {agreementPdfUrl ? (
                  <a href={agreementPdfUrl} target="_blank" rel="noreferrer">
                    Preview PDF
                  </a>
                ) : null}
                {agreementPdfUrl ? (
                  <a href={agreementPdfUrl} download>
                    Download PDF
                  </a>
                ) : null}
                {isSignedAgreement ? (
                  <button
                    className="btn btn-secondary discovery-upload-btn"
                    type="button"
                    disabled={sharing || !agreementPdfUrl}
                    onClick={handleShareAgreement}
                  >
                    {sharing ? "Sharing..." : "Share Updated Agreement"}
                  </button>
                ) : canRequestSignature ? (
                  <button
                    className="btn btn-secondary discovery-upload-btn"
                    type="button"
                    disabled={requestingSignature}
                    onClick={handleRequestSignature}
                  >
                    {requestingSignature ? "Requesting..." : "Request Signature"}
                  </button>
                ) : null}
                {agreement.signed_email_failed_at ? (
                  <button
                    className="btn btn-secondary discovery-upload-btn"
                    type="button"
                    disabled={retryingSignedEmail}
                    onClick={handleRetrySignedEmail}
                  >
                    {retryingSignedEmail ? "Retrying..." : "Retry Signed Email"}
                  </button>
                ) : null}
              </div>
              {versionHistory.length ? (
                <div className="discovery-agreement-history">
                  <h3>Version History</h3>
                  <ul>
                    {versionHistory.map((item) => (
                      <li key={`${item.version}-${item.event_type}`}>
                        <span />
                        <strong>{formatAgreementHistoryLabel(item)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {!agreement ? (
            <button
              className="btn btn-primary discovery-agreement-btn"
              type="button"
              disabled={generating}
              onClick={handleGenerateAgreement}
            >
              {generating ? "Generating..." : "Generate Basic Agreement"}
            </button>
          ) : null}
          {error ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>{error}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PaymentsPanel({ project, onProjectRefresh }) {
  const projectId = project?.id;
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");
  const paymentItems = milestones.length
    ? getPaymentItemsFromMilestones(milestones)
    : getProjectPaymentItems(project);

  const loadPayments = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      let data = await getPaymentMilestones(projectId);

      if (Array.isArray(data) && data.length === 0) {
        data = await initializePaymentMilestones(projectId);
      }

      setMilestones(Array.isArray(data) ? data : []);
    } catch (loadError) {
      console.error("Failed to load payment milestones:", loadError);
      const message = getApiErrorMessage(loadError, "Unable to load payment milestones.");
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      await loadPayments();
    };

    load();
  }, [loadPayments]);

  async function handleRequestPayment(milestoneId) {
    if (!projectId || !milestoneId) {
      return;
    }

    setWorkingId(milestoneId);
    setError("");

    try {
      await requestPaymentMilestone(projectId, milestoneId);
      showSuccess("Payment requested.");
      await loadPayments();
      await onProjectRefresh?.();
    } catch (requestError) {
      console.error("Failed to request payment:", requestError);
      const message = getApiErrorMessage(requestError, "Unable to request payment.");
      setError(message);
      showError(message);
    } finally {
      setWorkingId(null);
    }
  }

  async function handleMarkPaid(milestoneId) {
    if (!projectId || !milestoneId) {
      return;
    }

    setWorkingId(milestoneId);
    setError("");

    try {
      await markPaymentMilestonePaid(projectId, milestoneId);
      showSuccess("Payment marked as paid.");
      await loadPayments();
      await onProjectRefresh?.();
    } catch (paidError) {
      console.error("Failed to mark payment paid:", paidError);
      const message = getApiErrorMessage(paidError, "Unable to mark payment as paid.");
      setError(message);
      showError(message);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="discovery-stack">
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Payment schedule</h2>
        {loading ? (
          <div className="discovery-info-list">
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>Loading payment milestones...</strong>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="discovery-info-list">
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>{error}</strong>
            </div>
          </div>
        ) : null}
        {paymentItems.length > 0 ? (
          <>
            <div
              className="discovery-payment-bar discovery-payment-bar-large"
              style={{ gridTemplateColumns: getPaymentGridColumns(paymentItems) }}
              aria-hidden="true"
            >
              <span className="advance" />
              <span className="mid" />
              <span className="final" />
            </div>
            <div className="discovery-payment-list">
              {paymentItems.map((item) => (
                <div className="discovery-payment-item discovery-payment-item-rich" key={item.id || item.label}>
                  <div className="discovery-payment-name">
                    {item.label} - {item.split}%
                  </div>
                  <div className="discovery-payment-meta">
                    <strong>{item.value}</strong>
                    <span className={`discovery-pill ${item.statusClass}`.trim()}>{item.statusLabel || item.status}</span>
                    {item.status === "ready" ? (
                      <button
                        className="discovery-request-btn"
                        type="button"
                        disabled={workingId === item.id}
                        onClick={() => handleRequestPayment(item.id)}
                      >
                        {workingId === item.id ? "Requesting..." : "Request"}
                      </button>
                    ) : null}
                    {item.status === "requested" ? (
                      <button
                        className="discovery-request-btn"
                        type="button"
                        disabled={workingId === item.id}
                        onClick={() => handleMarkPaid(item.id)}
                      >
                        {workingId === item.id ? "Saving..." : "Mark as Paid"}
                      </button>
                    ) : null}
                    {item.status === "locked" ? (
                      <button className="discovery-request-btn" type="button" disabled>
                        Locked
                      </button>
                    ) : null}
                    {item.status === "paid" ? <span className="discovery-pill paid">Paid</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="discovery-info-list">
            <div className="discovery-info-row">
              <span>Payment terms</span>
              <strong>No project selected</strong>
            </div>
          </div>
        )}
      </section>


      {/* <section className="discovery-card discovery-addon-card">
        <div>
          <div className="discovery-addon-title">AI Add-on</div>
          <div className="discovery-addon-copy">AI add-on pricing is unavailable.</div>
        </div>
        <button className="btn btn-primary discovery-addon-btn" type="button">Unlock</button>
      </section> */}
    </div>
  );
}

function ActivityPanel({ activities, loading }) {
  return (
    <section className="discovery-card discovery-activity-board">
      <div className="discovery-activity-group">
        <div className="discovery-activity-group-label">Activity</div>
        <div className="discovery-activity-list">
          {loading ? (
            <div className="discovery-activity-item">
              <div className="discovery-activity-avatar spark">--</div>
              <div className="discovery-activity-copy">
                <div className="discovery-activity-text">Loading activity</div>
                <div className="discovery-activity-time">Recent project actions are being fetched.</div>
              </div>
            </div>
          ) : null}
          {!loading && activities.length === 0 ? (
            <div className="discovery-activity-item">
              <div className="discovery-activity-avatar spark">--</div>
              <div className="discovery-activity-copy">
                <div className="discovery-activity-text">No activity yet.</div>
                <div className="discovery-activity-time">Activity will appear here when available.</div>
              </div>
            </div>
          ) : null}
          {!loading && activities.map((activity) => (
            <div className="discovery-activity-item" key={activity.id}>
              <div className="discovery-activity-avatar spark">{activity.actor_type?.slice(0, 2).toUpperCase() || "--"}</div>
              <div className="discovery-activity-copy">
                <div className="discovery-activity-text">{activity.description || activity.action}</div>
                <div className="discovery-activity-time">
                  {activity.actor_type || "system"} - {formatActivityDate(activity.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function createAssistantMessage(role, text, options = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    sources: options.sources || [],
    isError: Boolean(options.isError),
  };
}

function getAssistantErrorMessage(error) {
  switch (error?.status) {
    case 400:
      return "Please enter a valid question.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 404:
      return "This project is unavailable.";
    case 429:
      return "The AI request limit has been reached. Please try again later.";
    case 502:
    case 503:
      return "FLOXA Assistant is temporarily unavailable. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function AssistantMessageText({ text }) {
  const renderInlineText = (value) => {
    const parts = String(value || "").split(/(\*\*[^*]+\*\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  return (
    <div className="ai-chat-message-text">
      {String(text || "")
        .split("\n")
        .map((line, index) => {
          const trimmedLine = line.trim();
          const bulletMatch = trimmedLine.match(/^\*\s+(.*)$/);

          if (bulletMatch) {
            return (
              <div className="ai-chat-formatted-line bullet" key={`${line}-${index}`}>
                <span className="ai-chat-bullet-dot" aria-hidden="true" />
                <span>{renderInlineText(bulletMatch[1])}</span>
              </div>
            );
          }

          return (
            <div className="ai-chat-formatted-line" key={`${line}-${index}`}>
              {trimmedLine ? renderInlineText(line) : "\u00a0"}
            </div>
          );
        })}
    </div>
  );
}

function AIChatbotPanel({ project, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState("");
  const textareaRef = useRef(null);
  const chatEndRef = useRef(null);
  const projectId = project?.id;
  const projectName = project?.company_name || project?.title || project?.client_name || "Selected project";

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setIsSending(false);
    setLastFailedMessage("");
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
  }, [draft]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submitMessage = async (messageText = draft) => {
    const trimmedMessage = String(messageText || "").trim();

    if (!trimmedMessage || !projectId || isSending) {
      return;
    }

    setLastFailedMessage("");
    setDraft("");
    setMessages((current) => [...current, createAssistantMessage("user", trimmedMessage)]);
    setIsSending(true);

    try {
      const data = await askProjectAssistant(projectId, trimmedMessage);
      const responseText = data?.response || data?.answer || "FLOXA Assistant returned an empty response.";

      setMessages((current) => [
        ...current,
        createAssistantMessage("assistant", responseText, {
          sources: Array.isArray(data?.sources) ? data.sources : [],
        }),
      ]);
    } catch (error) {
      setLastFailedMessage(trimmedMessage);
      setMessages((current) => [
        ...current,
        createAssistantMessage("assistant", getAssistantErrorMessage(error), {
          isError: true,
        }),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitMessage();
  };

  const clearConversation = () => {
    setMessages([]);
    setDraft("");
    setLastFailedMessage("");
    textareaRef.current?.focus();
  };

  const canSend = Boolean(projectId) && Boolean(draft.trim()) && !isSending;

  return (
    <section className="discovery-card project-ai-chat-card">
      <div className="ai-chat-workspace project-ai-chat-workspace" aria-label="FLOXA Project Assistant chat">
        <div className="ai-chat-workspace-head">
          <div>
            <div className="ai-chat-eyebrow">Project-aware</div>
            <h2>FLOXA Project Assistant</h2>
            <p className="project-ai-chat-project-name">{projectName}</p>
          </div>
          <div className="project-ai-chat-header-actions">
            <button
              className="ai-chat-clear-btn"
              type="button"
              onClick={clearConversation}
              disabled={messages.length === 0 && !draft}
            >
              Clear conversation
            </button>
            {onClose ? (
              <button className="project-ai-chat-close-btn" type="button" onClick={onClose} aria-label="Close assistant">
                Close
              </button>
            ) : null}
          </div>
        </div>

        <div className="ai-chat-scroll-area project-ai-chat-scroll">
          {messages.length === 0 && !isSending ? (
            <div className="ai-chat-empty-state">
              <div className="ai-chat-empty-icon">AI</div>
              <h3>Ask about this project</h3>
              <p>
                Ask about Discovery, Brand DNA, moodboards, concepts, agreements, payments, deliverables, or the next
                consultant action.
              </p>
              <div className="ai-chat-suggestions" aria-label="Suggested questions">
                {assistantSuggestions.map((question) => (
                  <button
                    key={question}
                    className="ai-chat-suggestion-chip"
                    type="button"
                    onClick={() => submitMessage(question)}
                    disabled={!projectId || isSending}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-chat-messages">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`ai-chat-message ${message.role === "user" ? "user" : "assistant"} ${
                    message.isError ? "error" : ""
                  }`.trim()}
                >
                  <div className="ai-chat-bubble">
                    <AssistantMessageText text={message.text} />
                  </div>

                  {message.role === "assistant" && message.sources.length > 0 ? (
                    <div className="ai-chat-sources">
                      Based on:{" "}
                      {message.sources
                        .map((source) => assistantSourceLabels[source] || getStatusLabel(source))
                        .join(" · ")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {isSending ? (
            <div className="ai-chat-message assistant">
              <div className="ai-chat-bubble ai-chat-thinking">
                <span>FLOXA is thinking</span>
                <span className="ai-chat-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          ) : null}

          <div ref={chatEndRef} />
        </div>

        <div className="ai-chat-composer">
          {lastFailedMessage ? (
            <button
              className="ai-chat-retry-btn"
              type="button"
              onClick={() => submitMessage(lastFailedMessage)}
              disabled={isSending}
            >
              Retry last message
            </button>
          ) : null}

          <div className="ai-chat-input-shell">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 700))}
              onKeyDown={handleKeyDown}
              placeholder={projectId ? "Ask about this project..." : "Project is still loading..."}
              disabled={!projectId || isSending}
              rows={1}
              maxLength={700}
            />
            <button type="button" onClick={() => submitMessage()} disabled={!canSend}>
              Send
            </button>
          </div>
          <div className="ai-chat-composer-hint">Enter to send - Shift+Enter for a new line</div>
        </div>
      </div>
    </section>
  );
}

function renderTabPanel(
  activeTab,
  gateDeliverables,
  project,
  setGateDeliverables,
  discoverySummary,
  discoverySummaryLoading,
  brandDNA,
  generatingBrandDNA,
  brandDNAError,
  onGenerateBrandDNA,
  projectActivities,
  projectActivitiesLoading,
  paymentItems,
  consultantActivities,
  consultantActivitiesLoading,
  onProjectRefresh
) {
  switch (activeTab) {
    case "Overview":
      return (
        <OverviewPanel
          gateDeliverables={gateDeliverables}
          project={project}
          projectActivities={projectActivities}
          projectActivitiesLoading={projectActivitiesLoading}
          paymentItems={paymentItems}
          setGateDeliverables={setGateDeliverables}
        />
      );
    case "Brand DNA":
      return (
        <BrandDnaPanel
          summary={discoverySummary}
          brandDNA={brandDNA}
          generatingBrandDNA={generatingBrandDNA}
          brandDNAError={brandDNAError}
          onGenerateBrandDNA={onGenerateBrandDNA}
        />
      );
    case "Discovery":
      return <DiscoveryAnswersPanel summary={discoverySummary} loading={discoverySummaryLoading} />;
    case "Moodboards":
      return <MoodboardsPanel projectId={project?.id} onProjectRefresh={onProjectRefresh} />;
    case "Concepts":
      return <ConceptsPanel projectId={project?.id} onProjectRefresh={onProjectRefresh} />;
    case "Deliverables":
      return <DeliverablesPanel projectId={project?.id} onProjectRefresh={onProjectRefresh} />;
    case "Agreement":
      return <AgreementPanel projectId={project?.id} onProjectRefresh={onProjectRefresh} />;
    case "Payments":
      return <PaymentsPanel project={project} onProjectRefresh={onProjectRefresh} />;
    case "Activity":
      return <ActivityPanel activities={consultantActivities} loading={consultantActivitiesLoading} />;
    default:
      return null;
  }
}

export default function Discovery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") {
      return "Overview";
    }

    return getDiscoveryTabFromQuery(new URLSearchParams(window.location.search).get("tab"));
  });
  const [gateDeliverables, setGateDeliverables] = useState(true);
  const [project, setProject] = useState(null);
  const [discoverySummary, setDiscoverySummary] = useState(null);
  const [discoverySummaryLoading, setDiscoverySummaryLoading] = useState(false);
  const [brandDNA, setBrandDNA] = useState(null);
  const [generatingBrandDNA, setGeneratingBrandDNA] = useState(false);
  const [brandDNAError, setBrandDNAError] = useState("");
  const [projectActivities, setProjectActivities] = useState([]);
  const [projectActivitiesLoading, setProjectActivitiesLoading] = useState(false);
  const [paymentMilestones, setPaymentMilestones] = useState([]);
  const [consultantActivities, setConsultantActivities] = useState([]);
  const [consultantActivitiesLoading, setConsultantActivitiesLoading] = useState(false);
  const [readActivityIds, setReadActivityIds] = useState([]);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const refreshProject = useCallback(async () => {
    const projectId = new URLSearchParams(window.location.search).get("projectId");

    if (!projectId) {
      return;
    }

    const data = await getProject(projectId);
    setProject(data);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setActiveTab(getDiscoveryTabFromQuery(requestedTab));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [requestedTab]);

  useEffect(() => {
    async function loadProject() {
      try {
        await refreshProject();
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    }

    loadProject();
  }, [refreshProject]);

  useEffect(() => {
    if (!["Brand DNA", "Discovery"].includes(activeTab) || !project?.id) {
      return;
    }

    let isMounted = true;

    async function loadTabSummaryData() {
      setDiscoverySummaryLoading(true);

      const [summaryRes, brandDnaRes] = await Promise.allSettled([
        getDiscoverySummary(project.id),
        activeTab === "Brand DNA" ? getBrandDNA(project.id) : Promise.resolve(null),
      ]);

      if (!isMounted) {
        return;
      }

      if (summaryRes.status === "fulfilled") {
        setDiscoverySummary(summaryRes.value);
      } else {
        setDiscoverySummary(null);
      }

      if (activeTab === "Brand DNA") {
        if (brandDnaRes.status === "fulfilled") {
          setBrandDNA(brandDnaRes.value);
        } else {
          setBrandDNA(null);
        }
      }

      setDiscoverySummaryLoading(false);
    }

    loadTabSummaryData();

    return () => {
      isMounted = false;
    };
  }, [activeTab, project?.id]);

  useEffect(() => {
    if (!project?.id) {
      const timeoutId = window.setTimeout(() => {
        setPaymentMilestones([]);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let isMounted = true;

    async function loadPaymentMilestones() {
      try {
        const data = await getPaymentMilestones(project.id);

        if (isMounted) {
          setPaymentMilestones(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load overview payment milestones:", error);

        if (isMounted) {
          setPaymentMilestones([]);
        }
      }
    }

    loadPaymentMilestones();

    return () => {
      isMounted = false;
    };
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) {
      return;
    }

    async function loadProjectActivities() {
      setProjectActivitiesLoading(true);

      try {
        const data = await getProjectActivities(project.id);
        setProjectActivities(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load project activities:", error);
        setProjectActivities([]);
      } finally {
        setProjectActivitiesLoading(false);
      }
    }

    loadProjectActivities();
  }, [project?.id]);

  useEffect(() => {
    if (activeTab !== "Activity") {
      return;
    }

    let isMounted = true;

    async function loadConsultantActivities() {
      setConsultantActivitiesLoading(true);

      try {
        const data = await getConsultantActivities();

        if (isMounted) {
          setConsultantActivities(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load consultant activities:", error);

        if (isMounted) {
          setConsultantActivities([]);
        }
      } finally {
        if (isMounted) {
          setConsultantActivitiesLoading(false);
        }
      }
    }

    loadConsultantActivities();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  async function handleGenerateBrandDNA() {
    if (!project?.id || generatingBrandDNA) {
      return;
    }

    setGeneratingBrandDNA(true);
    setBrandDNAError("");

    try {
      const data = await generateBrandDNA(project.id);
      setBrandDNA(data);
      showSuccess("Brand DNA generated.");
      await refreshProject();
    } catch (error) {
      console.error("Failed to generate Brand DNA:", error);
      const message = getApiErrorMessage(error, "Unable to generate Brand DNA. Please try again.");
      setBrandDNAError(message);
      showError(message);
    } finally {
      setGeneratingBrandDNA(false);
    }
  }

  async function handleMarkActivitiesRead() {
    if (!project?.id) {
      return;
    }

    try {
      await markProjectActivitiesRead(project.id);
      const readAt = new Date().toISOString();
      setProjectActivities((currentActivities) =>
        currentActivities.map((activity) => ({
          ...activity,
          is_read: true,
          read_at: activity.read_at || readAt,
        }))
      );
    } catch (error) {
      console.error("Failed to mark activities as read:", error);
    }
  }

  const getUnreadActivitiesForTab = useCallback((tab) => {
    const actions = getTabActivityActions(tab);

    if (!actions.length) {
      return [];
    }

    return projectActivities.filter((activity) =>
      !activity.is_read && actions.includes(activity.action)
    );
  }, [projectActivities]);

  const handleMarkTabActivitiesRead = useCallback(async (tab) => {
    if (!project?.id) {
      return;
    }

    const actions = getTabActivityActions(tab);
    const unreadTabActivities = getUnreadActivitiesForTab(tab);

    if (!actions.length || !unreadTabActivities.length) {
      return;
    }

    try {
      await markProjectActivitiesRead(project.id, actions);
      const readAt = new Date().toISOString();
      const readIds = unreadTabActivities.map((activity) => activity.id);
      const readIdSet = new Set(readIds);

      setProjectActivities((currentActivities) =>
        currentActivities.map((activity) =>
          readIdSet.has(activity.id)
            ? {
                ...activity,
                is_read: true,
                read_at: activity.read_at || readAt,
              }
            : activity
        )
      );
      setConsultantActivities((currentActivities) =>
        currentActivities.map((activity) =>
          readIdSet.has(activity.id)
            ? {
                ...activity,
                is_read: true,
                read_at: activity.read_at || readAt,
              }
            : activity
        )
      );
      setReadActivityIds((currentIds) => [...new Set([...currentIds, ...readIds])]);
    } catch (error) {
      console.error("Failed to mark tab activities as read:", error);
    }
  }, [getUnreadActivitiesForTab, project?.id]);

  useEffect(() => {
    handleMarkTabActivitiesRead(activeTab);
  }, [activeTab, handleMarkTabActivitiesRead]);

  useEffect(() => {
    if (!isAssistantOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsAssistantOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAssistantOpen]);

  const unreadActivities = projectActivities.filter((activity) => !activity.is_read);
  const overviewPaymentItems = paymentMilestones.length ? getPaymentItemsFromMilestones(paymentMilestones) : [];

  return (
    <div className="shell">
      <Floxaheader
        title={project?.company_name || "Discovery"}
        activeNav="Discovery"
        notificationCount={unreadActivities.length}
        notifications={projectActivities.slice(0, 5)}
        notificationsLoading={projectActivitiesLoading}
        readActivityIds={readActivityIds}
        onNotificationsOpen={handleMarkActivitiesRead}
        onMarkNotificationsRead={handleMarkActivitiesRead}
        onNotificationClick={(notification) => {
          const activityProjectId = notification?.project_id || project?.id;

          if (activityProjectId) {
            router.push(`/discovery?projectId=${activityProjectId}&tab=activity`);
            setActiveTab("Activity");
          } else {
            setActiveTab("Activity");
          }
        }}
      >
        <div className="content">
          <div className="screen">
            <div className="discovery-shell">
              <SummaryHeader project={project} />

              <div className="discovery-tabs" role="tablist" aria-label="Discovery sections">
                {discoveryTabs.map((tab) => (
                  <button
                    key={tab}
                    className={`discovery-tab ${activeTab === tab ? "active" : ""}`.trim()}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => {
                      setActiveTab(tab);
                      handleMarkTabActivitiesRead(tab);
                    }}
                  >
                    {tab}
                    {getUnreadActivitiesForTab(tab).length ? (
                      <span className="discovery-tab-dot" aria-hidden="true" />
                    ) : null}
                  </button>
                ))}
              </div>

              {renderTabPanel(
                activeTab,
                gateDeliverables,
                project,
                setGateDeliverables,
                discoverySummary,
                discoverySummaryLoading,
                brandDNA,
                generatingBrandDNA,
                brandDNAError,
                handleGenerateBrandDNA,
                projectActivities,
                projectActivitiesLoading,
                overviewPaymentItems,
                consultantActivities,
                consultantActivitiesLoading,
                refreshProject
              )}
            </div>

            {project?.id ? (
              <>
                <button
                  className="project-ai-floating-launcher"
                  type="button"
                  onClick={() => setIsAssistantOpen(true)}
                  aria-label="Ask about this project"
                  aria-haspopup="dialog"
                  aria-expanded={isAssistantOpen}
                >
                  <span className="project-ai-floating-symbol" aria-hidden="true">
                    ✦
                  </span>
                  <span className="project-ai-floating-label">Ask about this project…</span>
                </button>

                {isAssistantOpen ? (
                  <div
                    className="project-ai-modal-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setIsAssistantOpen(false);
                      }
                    }}
                  >
                    <div
                      className="project-ai-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-label="FLOXA Project Assistant"
                    >
                      <AIChatbotPanel project={project} onClose={() => setIsAssistantOpen(false)} />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}
