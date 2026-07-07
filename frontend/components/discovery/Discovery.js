"use client";

import { useEffect, useState } from "react";
import Floxaheader from "../../commone/Floxaheader";
import { getProject } from "../../src/lib/projectApi";

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
          <button className="btn btn-secondary discovery-link-btn" type="button">
            <span className="discovery-btn-icon">[ ]</span>
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

function BrandDnaPanel() {
  return (
    <div className="discovery-stack">
      <section className="discovery-brand-hero">
        <div className="discovery-brand-kicker">Brand Personality Cluster</div>
        <h2 className="discovery-brand-title">Not generated yet</h2>
        <div className="discovery-brand-pill">Waiting for client discovery</div>
      </section>

      <div className="discovery-inline-actions">
        <button className="btn btn-secondary discovery-wide-btn" type="button">+ Enhance with AI</button>
        <button className="discovery-text-action" type="button">Export brief</button>
      </div>
    </div>
  );
}

function DiscoveryAnswersPanel() {
  return (
    <section className="discovery-card discovery-form-card">
      <div className="discovery-form-block">
        <div className="discovery-form-label">Discovery answers</div>
        <p className="discovery-form-value">Client discovery answers are not connected yet.</p>
      </div>
    </section>
  );
}

function MoodboardsPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">No moodboards uploaded</div>
        <button className="btn btn-secondary discovery-upload-btn" type="button">+ Upload</button>
      </div>
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Moodboards</h2>
        <div className="discovery-info-list">
          <div className="discovery-info-row">
            <span>Status</span>
            <strong>No moodboards found</strong>
          </div>
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

function ActivityPanel() {
  return (
    <section className="discovery-card discovery-activity-board">
      <div className="discovery-activity-group">
        <div className="discovery-activity-group-label">Activity</div>
        <div className="discovery-activity-list">
          <div className="discovery-activity-item">
            <div className="discovery-activity-avatar spark">--</div>
            <div className="discovery-activity-copy">
              <div className="discovery-activity-text">No recent activity</div>
              <div className="discovery-activity-time">Activity will appear here when available.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function renderTabPanel(activeTab, gateDeliverables, project, setGateDeliverables) {
  switch (activeTab) {
    case "Overview":
      return <OverviewPanel gateDeliverables={gateDeliverables} project={project} setGateDeliverables={setGateDeliverables} />;
    case "Brand DNA":
      return <BrandDnaPanel />;
    case "Discovery":
      return <DiscoveryAnswersPanel />;
    case "Moodboards":
      return <MoodboardsPanel />;
    case "Concepts":
      return <ConceptsPanel />;
    case "Deliverables":
      return <DeliverablesPanel />;
    case "Agreement":
      return <AgreementPanel />;
    case "Payments":
      return <PaymentsPanel project={project} />;
    case "Activity":
      return <ActivityPanel />;
    default:
      return null;
  }
}

export default function Discovery() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [gateDeliverables, setGateDeliverables] = useState(true);
  const [project, setProject] = useState(null);

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

  return (
    <div className="shell">
      <Floxaheader title={project?.company_name || "Discovery"} activeNav="Discovery">
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

              {renderTabPanel(activeTab, gateDeliverables, project, setGateDeliverables)}
            </div>
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}
