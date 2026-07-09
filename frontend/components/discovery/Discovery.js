"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Floxaheader from "../../commone/Floxaheader";
import { showError, showSuccess } from "../../src/lib/toast";
import {
  generateBrandDNA,
  getBrandDNA,
  getDiscoverySummary,
  getMoodboards,
  getProject,
  getProjectActivities,
  markProjectActivitiesRead,
  uploadMoodboard,
} from "../../src/lib/projectApi";

const discoveryTabs = [
  "Overview",
  "Brand DNA",
  "Discovery",
  "Moodboards",
  "Concepts",
  "Deliverables",
  "Agreement",
  "Payments",
  "Activity",
];

const timelineItems = [
  { title: "Project created - portal sent to client", date: "Jun 1", tone: "done" },
  { title: "Client completed discovery", date: "Jun 2", tone: "done" },
  { title: "Moodboards uploaded - pending selection", date: "Jun 3", tone: "pending" },
  { title: "Concepts - waiting", date: "--", tone: "idle" },
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

  return labels[status] || status || "Discovery";
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

  return classes[status] || "badge-amber";
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
  const status = project?.status || "discovery";

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
          <button className="btn btn-primary discovery-portal-btn" type="button">
            {"Portal ->"}
          </button>
        </div>
      </div>
    </section>
  );
}

function OverviewPanel({ gateDeliverables, project, setGateDeliverables }) {
  const clientName = project?.client_name || "No project selected";
  const clientEmail = project?.client_email || "No email available";
  const sector = project?.sector || "No sector available";
  const value = project ? formatProjectValue(project.project_value) : "No value available";
  const paymentItems = getProjectPaymentItems(project);
  const revisions = project ? formatRevisionLimit(project.revision_limit) : "No revision limit set";

  return (
    <div className="discovery-overview-grid">
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Timeline</h2>
        <div className="discovery-timeline">
          {timelineItems.map((item) => (
            <div className={`discovery-timeline-item ${item.tone}`.trim()} key={item.title}>
              <div className="discovery-timeline-dot" />
              <div className="discovery-timeline-copy">
                <div className="discovery-timeline-text">{item.title}</div>
                <div className="discovery-timeline-date">{item.date}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="discovery-card discovery-panel">
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
                    <span className={`discovery-pill ${item.statusClass}`.trim()}>{item.status}</span>
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

      <section className="discovery-card discovery-panel">
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

      <section className="discovery-card discovery-panel">
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
    .map((competitor) => `${competitor.name || "Unnamed competitor"} (${competitor.rating || "neutral"})`)
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
  const competitors = formatBriefCompetitors(summary.top_competitors);

  return {
    business: `${company} should be framed as a refined ${industry} brand with a clear, confident explanation of its work: ${business}. The designer should make the offer feel immediate, credible, and easy to understand at first glance.`,
    targetAudience: `The visual and verbal direction should speak directly to ${audience}. Every touchpoint should feel relevant to this audience's expectations, decision-making style, and level of trust needed before they engage.`,
    brandGoal: `The brand should clearly communicate why clients should choose ${company}: ${reason}. This should come through as a strong positioning idea, not only as supporting copy.`,
    brandFeeling: `The desired emotional impression is ${feeling}. The identity should feel intentional, polished, and memorable while avoiding anything generic or overly decorative.`,
    audienceArchetype: `Primary audience archetype: ${archetype}. Design choices should respect this mindset through tone, pacing, hierarchy, and visual confidence.`,
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

function BrandDnaPanel({ summary, brandDNA, generatingBrandDNA, brandDNAError, onGenerateBrandDNA }) {
  const hasSummary = hasDiscoverySummary(summary);
  const hasBrandDNA = Boolean(brandDNA);
  const [showEnhancedBrief, setShowEnhancedBrief] = useState(false);
  const enhancedBrief = hasSummary ? buildEnhancedBrief(summary) : {};
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
          <span>{competitor.name || "Unnamed competitor"}</span>
          <strong>{competitor.rating || "neutral"}</strong>
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

function MoodboardsPanel({ projectId }) {
  const [moodboards, setMoodboards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
      setError("Please add a title and image before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("title", form.title.trim());
    formData.append("description", form.description.trim());
    formData.append("image", form.image);

    setSaving(true);
    setError("");

    try {
      await uploadMoodboard(projectId, formData);
      setForm({ title: "", description: "", image: null });
      uploadForm.reset();
      await loadMoodboards();
    } catch (uploadError) {
      console.error("Failed to upload moodboard:", uploadError);
      setError(uploadError?.detail || "Unable to upload moodboard. Please try again.");
    } finally {
      setSaving(false);
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
        <h2 className="discovery-panel-title">Moodboards</h2>
        <form className="discovery-info-list" onSubmit={handleUpload}>
          <label className="discovery-info-row">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Moodboard title"
            />
          </label>
          <label className="discovery-info-row">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Short direction note"
            />
          </label>
          <label className="discovery-info-row">
            <span>Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setForm((current) => ({ ...current, image: event.target.files?.[0] || null }))}
            />
          </label>
          {error ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>{error}</strong>
            </div>
          ) : null}
          <button className="btn btn-secondary discovery-upload-btn" type="submit" disabled={saving}>
            {saving ? "Uploading..." : "+ Upload"}
          </button>
        </form>
      </section>
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Uploaded moodboards</h2>
        <div className="discovery-info-list">
          {loading ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>Loading moodboards...</strong>
            </div>
          ) : null}
          {!loading && moodboards.length === 0 ? (
            <div className="discovery-info-row">
              <span>Status</span>
              <strong>No moodboards found</strong>
            </div>
          ) : null}
          {moodboards.map((item) => (
            <div className="discovery-info-row" key={item.id}>
              <span>{item.is_selected ? `${item.title} - Selected` : item.title}</span>
              <strong>{item.description || "No description"}</strong>
              {item.image_url ? (
                <a href={item.image_url} target="_blank" rel="noreferrer">
                  View image
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConceptsPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">No concepts uploaded</div>
        <button className="btn btn-secondary discovery-upload-btn" type="button">+ Upload</button>
      </div>
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Concepts</h2>
        <div className="discovery-info-list">
          <div className="discovery-info-row">
            <span>Status</span>
            <strong>No concepts found</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeliverablesPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">No deliverables uploaded</div>
        <button className="btn btn-secondary discovery-upload-btn" type="button">+ Upload</button>
      </div>
      <section className="discovery-card discovery-table-card">
        <table className="discovery-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="discovery-file-name" colSpan="5">No deliverables found.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function AgreementPanel() {
  return (
    <section className="discovery-card discovery-agreement-card">
      <h2 className="discovery-panel-title">Service Agreement</h2>
      <div className="discovery-agreement-icon">DOC</div>
      <div className="discovery-agreement-title">No agreement uploaded</div>
      <p className="discovery-agreement-copy">Upload a signed service agreement PDF to proceed with deliverables.</p>
      <button className="btn btn-primary discovery-agreement-btn" type="button">Upload agreement PDF</button>
    </section>
  );
}

function PaymentsPanel({ project }) {
  const paymentItems = getProjectPaymentItems(project);

  return (
    <div className="discovery-stack">
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Payment schedule</h2>
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
                <div className="discovery-payment-item discovery-payment-item-rich" key={item.label}>
                  <div className="discovery-payment-name">
                    {item.label} - {item.split}
                  </div>
                  <div className="discovery-payment-meta">
                    <strong>{item.value}</strong>
                    <span className={`discovery-pill ${item.statusClass}`.trim()}>{item.status}</span>
                    {item.label === "Advance" ? <button className="discovery-request-btn" type="button">Request</button> : null}
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

      <section className="discovery-card discovery-addon-card">
        <div>
          <div className="discovery-addon-title">AI Add-on</div>
          <div className="discovery-addon-copy">AI add-on pricing is unavailable.</div>
        </div>
        <button className="btn btn-primary discovery-addon-btn" type="button">Unlock</button>
      </section>
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
  projectActivitiesLoading
) {
  switch (activeTab) {
    case "Overview":
      return <OverviewPanel gateDeliverables={gateDeliverables} project={project} setGateDeliverables={setGateDeliverables} />;
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
      return <MoodboardsPanel projectId={project?.id} />;
    case "Concepts":
      return <ConceptsPanel />;
    case "Deliverables":
      return <DeliverablesPanel />;
    case "Agreement":
      return <AgreementPanel />;
    case "Payments":
      return <PaymentsPanel project={project} />;
    case "Activity":
      return <ActivityPanel activities={projectActivities} loading={projectActivitiesLoading} />;
    default:
      return null;
  }
}

export default function Discovery() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") {
      return "Overview";
    }

    return new URLSearchParams(window.location.search).get("tab") === "activity"
      ? "Activity"
      : "Overview";
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

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("projectId");

    if (!projectId) {
      return;
    }

    async function loadProject() {
      try {
        const data = await getProject(projectId);
        setProject(data);
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    }

    loadProject();
  }, []);

  useEffect(() => {
    if (!["Brand DNA", "Discovery"].includes(activeTab) || !project?.id) {
      return;
    }

    async function loadDiscoverySummary() {
      setDiscoverySummaryLoading(true);

      try {
        const data = await getDiscoverySummary(project.id);
        setDiscoverySummary(data);
      } catch {
        setDiscoverySummary(null);
      } finally {
        setDiscoverySummaryLoading(false);
      }
    }

    loadDiscoverySummary();
  }, [activeTab, project?.id]);

  useEffect(() => {
    if (activeTab !== "Brand DNA" || !project?.id) {
      return;
    }

    async function loadBrandDNA() {
      try {
        const data = await getBrandDNA(project.id);
        setBrandDNA(data);
      } catch {
        setBrandDNA(null);
      }
    }

    loadBrandDNA();
  }, [activeTab, project?.id]);

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

  async function handleGenerateBrandDNA() {
    if (!project?.id || generatingBrandDNA) {
      return;
    }

    setGeneratingBrandDNA(true);
    setBrandDNAError("");

    try {
      const data = await generateBrandDNA(project.id);
      setBrandDNA(data);
    } catch (error) {
      console.error("Failed to generate Brand DNA:", error);
      setBrandDNAError(error?.detail || "Unable to generate Brand DNA. Please try again.");
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

  const unreadActivities = projectActivities.filter((activity) => !activity.is_read);

  return (
    <div className="shell">
      <Floxaheader
        title={project?.company_name || "Discovery"}
        activeNav="Discovery"
        notificationCount={unreadActivities.length}
        notifications={projectActivities.slice(0, 5)}
        notificationsLoading={projectActivitiesLoading}
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
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
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
                projectActivitiesLoading
              )}
            </div>
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}
