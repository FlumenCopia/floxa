"use client";

import { useState } from "react";
import Floxaheader from "../../commone/Floxaheader";

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

const paymentItems = [
  { label: "Advance", split: "50%", value: "Rs25,000", status: "Pending", statusClass: "pending" },
  { label: "Mid", split: "25%", value: "Rs12,500", status: "Locked", statusClass: "locked" },
  { label: "Final", split: "25%", value: "Rs12,500", status: "Locked", statusClass: "locked" },
];

const brandDnaCards = [
  { label: "Tone archetype", value: "Confident & Authoritative" },
  { label: "Tone descriptors", value: "Direct - Innovative - Precise" },
  { label: "Audience", value: "Premium Seeker" },
  { label: "Positioning", value: "For brands that refuse to follow - we build identities that lead." },
  { label: "Taglines", value: "Define the future - Lead the change - Built different" },
  { label: "Visual brief", value: "High contrast, geometric, bold type, limited palette" },
];

const discoveryAnswers = [
  {
    label: "What do you do?",
    value: "We create next-generation consumer goods that challenge conventional categories and set new industry standards.",
  },
  {
    label: "Target customer",
    value: "Aspirational millennials who value quality and aesthetics over price, aged 25-40.",
  },
  {
    label: "Brand feeling",
    value: "Bold, trustworthy, creative, modern, confident",
  },
];

const personalitySliders = [
  { left: "Playful", right: "Serious", value: 65 },
  { left: "Friendly", right: "Premium", value: 80 },
  { left: "Bold", right: "Minimal", value: 15 },
];

const moodboards = [
  {
    name: "Dark Premium",
    colors: ["#1d1e36", "#1f2b4e", "#1d4372", "#e94161"],
    tags: ["bold", "luxury", "modern"],
    selected: true,
  },
  {
    name: "Warm Earth",
    colors: ["#eadcc4", "#e2cdaa", "#c89a69", "#996b43"],
    tags: ["natural", "organic", "warm"],
    selected: false,
  },
  {
    name: "Clean Tech",
    colors: ["#cedbe3", "#a8c2d9", "#558dcc", "#264a72"],
    tags: ["minimal", "clean", "tech"],
    selected: false,
  },
];

const concepts = [
  {
    round: "Round 1, Concept A",
    name: "The Bold Mark",
    canvasClass: "navy",
    wordmark: "CRAFT",
    wordmarkClass: "pink",
    status: "Approved",
  },
  {
    round: "Round 1, Concept B",
    name: "The Serif Signature",
    canvasClass: "sand",
    wordmark: "craft & co",
    wordmarkClass: "brown script",
    status: "Rejected",
  },
  {
    round: "Round 1, Concept C",
    name: "The Minimal Wordmark",
    canvasClass: "white",
    wordmark: "CRAFT",
    wordmarkClass: "blue spaced",
    status: "Review",
  },
];

const deliverables = [
  { file: "Brand Identity Guidelines.pdf", type: "PDF", size: "4.2 MB", access: "Locked - Final payment", accessClass: "locked" },
  { file: "Logo Files (All Formats).zip", type: "ZIP", size: "18.6 MB", access: "Locked - Final payment", accessClass: "locked" },
  { file: "Brand Poster Preview.jpg", type: "Image", size: "2.1 MB", access: "Free preview", accessClass: "free" },
];

const activityGroups = [
  {
    label: "Today",
    items: [
      { avatar: "NB", avatarClass: "blue", title: "Client selected Moodboard 1 - Dark Premium", time: "2 min ago" },
      { avatar: "AK", avatarClass: "green", title: "You uploaded 3 moodboards", time: "3 hrs ago" },
    ],
  },
  {
    label: "Yesterday",
    items: [
      { avatar: "NB", avatarClass: "blue", title: "Client completed all 9 discovery frames", time: "Jun 2, 3:45 PM" },
      {
        avatar: "+",
        avatarClass: "spark",
        title: "Brand DNA generated - ",
        strong: "Bold Visionary",
        suffix: " cluster identified",
        time: "Jun 2, 3:46 PM",
      },
      { avatar: "AK", avatarClass: "green", title: "Project created - portal link sent to craft@company.com", time: "Jun 1, 11:00 AM" },
    ],
  },
];

function SummaryHeader() {
  return (
    <section className="discovery-card discovery-summary">
      <div className="discovery-summary-main">
        <div className="discovery-summary-copy">
          <div className="discovery-summary-head">
            <h1 className="discovery-summary-title">Craft & Co</h1>
            <span className="badge badge-amber">Discovery</span>
          </div>
          <div className="discovery-summary-meta">craft@company.com - Consumer Goods - Rs50,000</div>
        </div>

        <div className="discovery-summary-actions">
          <div className="discovery-progress-ring" style={{ "--progress": "45%" }}>
            <span>45%</span>
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

function OverviewPanel({ gateDeliverables, setGateDeliverables }) {
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
        <div className="discovery-payment-bar" aria-hidden="true">
          <span className="advance" />
          <span className="mid" />
          <span className="final" />
        </div>
        <div className="discovery-payment-legend">
          <span><i className="advance" /> Advance 50%</span>
          <span><i className="mid" /> Mid 25%</span>
          <span><i className="final" /> Final 25%</span>
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
      </section>

      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Client info</h2>
        <div className="discovery-info-list">
          <div className="discovery-info-row">
            <span>Name</span>
            <strong>Nova Brands</strong>
          </div>
          <div className="discovery-info-row">
            <span>Email</span>
            <strong>craft@company.com</strong>
          </div>
          <div className="discovery-info-row">
            <span>Sector</span>
            <strong>Consumer Goods</strong>
          </div>
          <div className="discovery-info-row">
            <span>Value</span>
            <strong className="discovery-value">Rs50,000</strong>
          </div>
        </div>
      </section>

      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Settings</h2>
        <div className="discovery-setting-row">
          <span>Revision limit</span>
          <strong>3 revisions</strong>
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
        <h2 className="discovery-brand-title">Bold Visionary</h2>
        <div className="discovery-brand-pill">+ The Pioneer Archetype</div>
        <p className="discovery-brand-copy">
          A brand that challenges conventions and redefines categories. Built for leaders who see around corners.
        </p>
      </section>

      <div className="discovery-info-grid">
        {brandDnaCards.map((item) => (
          <section className="discovery-card discovery-mini-card" key={item.label}>
            <div className="discovery-mini-label">{item.label}</div>
            <div className="discovery-mini-value">{item.value}</div>
          </section>
        ))}
      </div>

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
      <div className="discovery-form-date">Discovery submitted Jun 2, 2026 at 3:45 PM</div>
      <div className="discovery-form-divider" />

      {discoveryAnswers.map((item) => (
        <div className="discovery-form-block" key={item.label}>
          <div className="discovery-form-label">{item.label}</div>
          <p className="discovery-form-value">{item.value}</p>
        </div>
      ))}

      <div className="discovery-form-block">
        <div className="discovery-form-label">Personality sliders</div>
        <div className="discovery-slider-list">
          {personalitySliders.map((item) => (
            <div className="discovery-slider-row" key={item.left}>
              <span>{item.left}</span>
              <div className="discovery-slider-track">
                <div className="discovery-slider-fill" style={{ width: `${item.value}%` }} />
              </div>
              <span>{item.right}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MoodboardsPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">3 of 3 uploaded - 1 selected</div>
        <button className="btn btn-secondary discovery-upload-btn" type="button">+ Upload</button>
      </div>
      <div className="discovery-moodboard-grid">
        {moodboards.map((item) => (
          <section className={`discovery-moodboard-card ${item.selected ? "selected" : ""}`.trim()} key={item.name}>
            <div className="discovery-palette-row">
              {item.colors.map((color) => (
                <span className="discovery-palette-swatch" key={color} style={{ background: color }} />
              ))}
            </div>
            {item.selected ? <div className="discovery-selected-badge">Selected</div> : null}
            <div className="discovery-moodboard-body">
              <h3>{item.name}</h3>
              <div className="discovery-tag-row">
                {item.tags.map((tag) => (
                  <span className="discovery-tag" key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ConceptsPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">Round 1 - 3 concepts</div>
        <button className="btn btn-secondary discovery-upload-btn" type="button">+ Upload</button>
      </div>
      <div className="discovery-concepts-grid">
        {concepts.map((item) => (
          <section className={`discovery-concept-card ${item.status.toLowerCase()}`.trim()} key={item.name}>
            <div className={`discovery-concept-canvas ${item.canvasClass}`.trim()}>
              <div className={`discovery-concept-wordmark ${item.wordmarkClass}`.trim()}>{item.wordmark}</div>
            </div>
            <div className="discovery-concept-body">
              <div className="discovery-concept-round">{item.round}</div>
              <h3>{item.name}</h3>
              {item.status === "Approved" ? <button className="discovery-status-btn approved" type="button">Approved</button> : null}
              {item.status === "Rejected" ? <button className="discovery-status-btn rejected" type="button">Rejected</button> : null}
              {item.status === "Review" ? (
                <div className="discovery-dual-actions">
                  <button className="discovery-status-btn approved" type="button">Approve</button>
                  <button className="discovery-status-btn rejected" type="button">Reject</button>
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DeliverablesPanel() {
  return (
    <div className="discovery-stack">
      <div className="discovery-section-bar">
        <div className="discovery-section-copy">Final files - Payment gated</div>
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
            {deliverables.map((item) => (
              <tr key={item.file}>
                <td className="discovery-file-name">{item.file}</td>
                <td>{item.type}</td>
                <td>{item.size}</td>
                <td>
                  <span className={`discovery-access-pill ${item.accessClass}`.trim()}>{item.access}</span>
                </td>
                <td className="discovery-download-cell">download</td>
              </tr>
            ))}
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

function PaymentsPanel() {
  return (
    <div className="discovery-stack">
      <section className="discovery-card discovery-panel">
        <h2 className="discovery-panel-title">Payment schedule</h2>
        <div className="discovery-payment-bar discovery-payment-bar-large" aria-hidden="true">
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
      </section>

      <section className="discovery-card discovery-addon-card">
        <div>
          <div className="discovery-addon-title">AI Add-on</div>
          <div className="discovery-addon-copy">Unlock all 9 AI modules for this project - Rs250 one-time</div>
        </div>
        <button className="btn btn-primary discovery-addon-btn" type="button">Unlock - Rs250</button>
      </section>
    </div>
  );
}

function ActivityPanel() {
  return (
    <section className="discovery-card discovery-activity-board">
      {activityGroups.map((group) => (
        <div className="discovery-activity-group" key={group.label}>
          <div className="discovery-activity-group-label">{group.label}</div>
          <div className="discovery-activity-list">
            {group.items.map((item) => (
              <div className="discovery-activity-item" key={`${group.label}-${item.title}`}>
                <div className={`discovery-activity-avatar ${item.avatarClass}`.trim()}>{item.avatar}</div>
                <div className="discovery-activity-copy">
                  <div className="discovery-activity-text">
                    {item.title}
                    {item.strong ? <strong>{item.strong}</strong> : null}
                    {item.suffix || ""}
                  </div>
                  <div className="discovery-activity-time">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function renderTabPanel(activeTab, gateDeliverables, setGateDeliverables) {
  switch (activeTab) {
    case "Overview":
      return <OverviewPanel gateDeliverables={gateDeliverables} setGateDeliverables={setGateDeliverables} />;
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
      return <PaymentsPanel />;
    case "Activity":
      return <ActivityPanel />;
    default:
      return null;
  }
}

export default function Discovery() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [gateDeliverables, setGateDeliverables] = useState(true);

  return (
    <div className="shell">
      <Floxaheader title="Craft & Co" activeNav="Discovery">
        <div className="content">
          <div className="screen">
            <div className="discovery-shell">
              <SummaryHeader />

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

              {renderTabPanel(activeTab, gateDeliverables, setGateDeliverables)}
            </div>
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}
