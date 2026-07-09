"use client";

import { useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";

const phaseLabels = [
  "Profile",
  "Discovery",
  "Visual",
  "Agreement",
  "Moodboard",
  "Concepts",
  "Delivery",
  "Sign Off",
];

export function ClientDashboard({ project, onNext, onSignOut, onProjectRefresh }) {
  const pct = project.completionPct;
  const activePhaseIndex = Math.min(phaseLabels.length - 1, Math.floor(pct / 12.5));
  const [panel, setPanel] = useState(null);
  const [working, setWorking] = useState("");
  const [brandDNAReport, setBrandDNAReport] = useState(null);
  const [brandDNAReportLoading, setBrandDNAReportLoading] = useState(false);
  const [moodboards, setMoodboards] = useState(project.moodboards || []);
  const [moodboardsLoading, setMoodboardsLoading] = useState(false);
  const [moodboardsError, setMoodboardsError] = useState("");

  async function selectMoodboard(id) {
    setWorking(id);
    setMoodboardsError("");

    try {
      const response = await clientPortalService.selectMoodboard(id);
      const selectedId = response.data?.id ?? id;

      setMoodboards((currentMoodboards) =>
        currentMoodboards.map((item) => ({
          ...item,
          clientSelected: item.id === selectedId,
          is_selected: item.id === selectedId,
        }))
      );
      await onProjectRefresh?.();
    } catch (error) {
      setMoodboardsError(error?.detail || "Unable to select moodboard. Please try again.");
    } finally {
      setWorking("");
    }
  }

  async function decideConcept(id, decision) {
    const comment =
      decision === "REJECTED"
        ? window.prompt("Tell your consultant what should change:", "") ?? ""
        : "";

    setWorking(id);

    try {
      await clientPortalService.decideConcept(id, decision, comment);
      await onProjectRefresh?.();
    } finally {
      setWorking("");
    }
  }

  async function downloadDeliverable(id) {
    setWorking(id);

    try {
      const response = await clientPortalService.downloadDeliverable(id);

      if (response.success && response.data?.fileUrl) {
        window.open(response.data.fileUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to download this file.");
    } finally {
      setWorking("");
    }
  }

  async function openPanel(nextPanel) {
    setPanel(nextPanel);

    if (nextPanel === "moodboards") {
      setMoodboardsLoading(true);
      setMoodboardsError("");

      try {
        const response = await clientPortalService.getMoodboards();
        setMoodboards(response.success ? response.data : []);
        setMoodboardsError(response.success ? "" : response.error || "Moodboards are not ready yet.");
      } finally {
        setMoodboardsLoading(false);
      }

      return;
    }

    if (nextPanel !== "discovery") {
      return;
    }

    setBrandDNAReportLoading(true);

    try {
      const response = await clientPortalService.getBrandDNAReport();
      setBrandDNAReport(response.success ? response.data : null);
    } finally {
      setBrandDNAReportLoading(false);
    }
  }

  const cards = [
    {
      symbol: "01",
      title: "Discovery Report",
      sub: "View your Brand DNA",
      active: pct >= 30,
      panel: "discovery",
    },
    {
      symbol: "02",
      title: "Moodboards",
      sub: `${moodboards.length} directions ready`,
      active: true,
      panel: "moodboards",
    },
    {
      symbol: "03",
      title: "Concepts",
      sub: `${project.concepts?.length ?? 0} concepts ready`,
      active: (project.concepts?.length ?? 0) > 0,
      panel: "concepts",
    },
    {
      symbol: "04",
      title: "Delivery",
      sub: `${project.deliverables?.length ?? 0} files ready`,
      active: (project.deliverables?.length ?? 0) > 0,
      panel: "delivery",
    },
  ];

  return (
    <div className="client-dashboard-screen">
      <header className="client-dashboard-header">
        <div>
          <div className="client-dashboard-wordmark">FLOXA</div>
          <p>Welcome back, {project.brandDNA?.clientName ?? "Client"}.</p>
        </div>
        <div className="client-dashboard-actions">
          <button type="button" onClick={() => onNext?.("profile")}>
            Edit profile
          </button>
          <button type="button" onClick={() => onProjectRefresh?.()}>
            Refresh
          </button>
          <button type="button" onClick={() => onSignOut?.()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="client-dashboard-hero">
        <div className="client-dashboard-orb" style={{ "--client-progress": `${pct * 3.6}deg` }}>
          <div>
            <strong>{pct}%</strong>
            <span>complete</span>
          </div>
        </div>

        <div className="client-dashboard-project">
          <span className="client-dashboard-kicker">Your brand journey</span>
          <h1>{project.name}</h1>
          <p>
            Phase {activePhaseIndex + 1} of {phaseLabels.length} -{" "}
            {phaseLabels[activePhaseIndex]}
          </p>
          <div className="client-dashboard-progress">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="client-dashboard-stage-list">
          {phaseLabels.map((label, index) => (
            <div
              key={label}
              className={
                index < activePhaseIndex ? "complete" : index === activePhaseIndex ? "active" : ""
              }
            >
              <span />
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="client-dashboard-grid">
        {cards.map((card) => (
          <button
            key={card.panel}
            type="button"
            disabled={!card.active}
            className={`client-journey-card ${card.active ? "available" : ""}`}
            onClick={() => card.active && openPanel(card.panel)}
          >
            <span className="client-card-number">{card.symbol}</span>
            <span className="client-card-arrow">^</span>
            <strong>{card.title}</strong>
            <small>{card.sub}</small>
          </button>
        ))}
      </section>

      {panel ? (
        <section className="client-dashboard-panel client-design-enter">
          <div className="client-panel-heading">
            <div>
              <span>Project workspace</span>
              <h2>{panel}</h2>
            </div>
            <button type="button" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>

          {panel === "discovery" ? (
            <div className="client-brand-summary">
              <span>Personality cluster</span>
              {brandDNAReportLoading ? (
                <>
                  <h3>Loading discovery report...</h3>
                  <p>Your consultant&apos;s Brand DNA report is being fetched.</p>
                </>
              ) : brandDNAReport ? (
                <>
                  <h3>{brandDNAReport.brand_personality_cluster || "Brand discovery complete"}</h3>
                  <p>{brandDNAReport.positioning_summary}</p>
                  <p>{brandDNAReport.business_summary}</p>
                  <p>{brandDNAReport.target_audience_summary}</p>
                  <p>{brandDNAReport.brand_feeling_summary}</p>
                  <p>{brandDNAReport.visual_direction_summary}</p>
                  <p>{brandDNAReport.competitor_summary}</p>
                  {brandDNAReport.updated_at ? (
                    <small>Updated {new Date(brandDNAReport.updated_at).toLocaleDateString()}</small>
                  ) : null}
                </>
              ) : (
                <>
                  <h3>{project.brandDNA?.personalityCluster || "Brand discovery complete"}</h3>
                  <p>
                    {project.brandDNA?.positioningStatement ||
                      "Your consultant is preparing the next stage."}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {panel === "moodboards" ? (
            <div className="client-panel-grid">
              {moodboardsLoading ? (
                <article>
                  <h3>Loading moodboards...</h3>
                  <p>Your consultant&apos;s visual directions are being fetched.</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboards.length === 0 ? (
                <article>
                  <h3>No moodboards yet</h3>
                  <p>{moodboardsError || "Your consultant is preparing visual directions."}</p>
                </article>
              ) : null}
              {!moodboardsLoading && moodboards.map((item) => (
                <article key={item.id} className={item.clientSelected || item.is_selected ? "selected" : ""}>
                  <div
                    className="client-panel-image"
                    style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                  />
                  <h3>{item.name || item.title}</h3>
                  {item.description ? <p>{item.description}</p> : null}
                  <button
                    type="button"
                    disabled={item.clientSelected || item.is_selected || working === item.id}
                    onClick={() => selectMoodboard(item.id)}
                    className="client-panel-action"
                  >
                    {item.clientSelected || item.is_selected
                      ? "Selected"
                      : working === item.id
                        ? "Saving..."
                        : "Select direction"}
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {panel === "concepts" ? (
            <div className="client-panel-stack">
              {project.concepts?.map((item) => (
                <article key={item.id}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div>
                    <button
                      type="button"
                      disabled={working === item.id || item.clientStatus === "SELECTED"}
                      onClick={() => decideConcept(item.id, "SELECTED")}
                      className="client-panel-action"
                    >
                      {item.clientStatus === "SELECTED" ? "Approved" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={working === item.id}
                      onClick={() => decideConcept(item.id, "REJECTED")}
                      className="client-panel-action secondary"
                    >
                      Request changes
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {panel === "delivery" ? (
            <div className="client-panel-stack">
              {project.deliverables?.map((item) => (
                <article key={item.id} className="client-delivery-row">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.fileFormat || item.category}</p>
                  </div>
                  <button
                    type="button"
                    disabled={working === item.id}
                    onClick={() => downloadDeliverable(item.id)}
                    className="client-panel-action"
                  >
                    Download
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
