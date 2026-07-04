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
  { label: "Advance", value: "Rs25,000", status: "Pending", statusClass: "pending" },
  { label: "Mid", value: "Rs12,500", status: "Locked", statusClass: "locked" },
  { label: "Final", value: "Rs12,500", status: "Locked", statusClass: "locked" },
];

const activityFeed = [
  { actor: "Anoop Krishna", event: "uploaded two moodboard routes for review", time: "Today, 11:20 AM" },
  { actor: "Craft & Co", event: "confirmed the discovery questionnaire", time: "Yesterday, 5:42 PM" },
  { actor: "System", event: "client portal invitation delivered successfully", time: "Jun 1, 9:15 AM" },
];

const tabPanels = {
  "Brand DNA": {
    title: "Brand DNA Snapshot",
    intro: "Core positioning captured from the discovery form and internal kickoff notes.",
    points: [
      "Brand personality: warm, refined, editorial, modern Indian craft.",
      "Audience: founder-led lifestyle customers looking for premium handmade products.",
      "Differentiator: boutique storytelling with a polished direct-to-consumer feel.",
    ],
  },
  Discovery: {
    title: "Discovery Responses",
    intro: "The client has completed the initial questionnaire and clarified the business direction.",
    points: [
      "Primary goal is to sharpen premium perception without losing handmade authenticity.",
      "Competitors referenced include artisanal consumer brands with clean packaging systems.",
      "The client prefers a visual language that feels elevated, human, and not overly corporate.",
    ],
  },
  Moodboards: {
    title: "Moodboard Review",
    intro: "Two routes are ready for selection and waiting on client feedback.",
    points: [
      "Route A leans earthy, tactile, and handcrafted with muted greens and paper textures.",
      "Route B leans polished, minimal, and premium with stronger contrast and tighter typography.",
      "Next step is to lock one route before concept exploration begins.",
    ],
  },
  Concepts: {
    title: "Concept Direction",
    intro: "Concept work has not started yet because moodboard approval is still pending.",
    points: [
      "Logo systems and symbol sketches will start once a visual route is selected.",
      "Naming exploration is not part of the current scope.",
      "Estimated concept turnaround after approval is 3 working days.",
    ],
  },
  Deliverables: {
    title: "Deliverables Scope",
    intro: "This project is structured as a compact identity package.",
    points: [
      "Primary logo, secondary lockup, favicon, and social profile mark.",
      "Color palette, type pairing, and basic usage guidance.",
      "Delivery is gated until payment milestones are cleared.",
    ],
  },
  Agreement: {
    title: "Agreement Summary",
    intro: "Commercial terms have been documented and shared with the client.",
    points: [
      "Project value: Rs50,000 with a 50/25/25 payment split.",
      "Three rounds of revisions are included in the package.",
      "Final files are released after the last payment is completed.",
    ],
  },
  Payments: {
    title: "Payment Notes",
    intro: "Advance is due before further design exploration begins.",
    points: [
      "Advance invoice is issued and currently marked pending.",
      "Mid and final installments remain locked until milestone progression.",
      "Client portal will show payment access automatically as milestones unlock.",
    ],
  },
  Activity: {
    title: "Recent Activity",
    intro: "A quick log of project actions across the team and client portal.",
    points: [
      "Portal access was created and delivered successfully.",
      "The client completed the questionnaire and uploaded references.",
      "Moodboards were shared and are awaiting selection.",
    ],
  },
};

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

function DetailPanel({ activeTab }) {
  const panel = tabPanels[activeTab];

  if (!panel) {
    return null;
  }

  return (
    <section className="discovery-card discovery-detail-card">
      <div className="discovery-detail-kicker">{activeTab}</div>
      <h2 className="discovery-panel-title">{panel.title}</h2>
      <p className="discovery-detail-intro">{panel.intro}</p>
      <div className="discovery-detail-list">
        {panel.points.map((point) => (
          <div className="discovery-detail-item" key={point}>
            <span className="discovery-detail-bullet" />
            <p>{point}</p>
          </div>
        ))}
      </div>
    </section>
  );
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
                      Link
                    </button>
                    <button className="btn btn-primary discovery-portal-btn" type="button">
                      {"Portal ->"}
                    </button>
                  </div>
                </div>
              </section>

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

              {activeTab === "Overview" ? (
                <OverviewPanel gateDeliverables={gateDeliverables} setGateDeliverables={setGateDeliverables} />
              ) : (
                <DetailPanel activeTab={activeTab} />
              )}

              {activeTab === "Activity" ? (
                <section className="discovery-card discovery-activity-card">
                  <h2 className="discovery-panel-title">Activity feed</h2>
                  <div className="discovery-activity-list">
                    {activityFeed.map((item) => (
                      <div className="discovery-activity-item" key={`${item.actor}-${item.time}`}>
                        <div className="discovery-activity-avatar">{item.actor.slice(0, 2).toUpperCase()}</div>
                        <div className="discovery-activity-copy">
                          <div className="discovery-activity-text">
                            <strong>{item.actor}</strong> {item.event}
                          </div>
                          <div className="discovery-activity-time">{item.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}
