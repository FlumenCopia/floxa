"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const projects = ["Craft & Co", "Bloom Studio", "Helix Tech"];

const tools = [
  {
    id: "discovery-copilot",
    icon: "spark",
    name: "Discovery Co-Pilot",
    description: "Real-time field suggestions as client types. 1s debounce, silent fail, never blocks discovery.",
    meta: "30/hr - Always on",
    badge: "Core",
    badgeClass: "core",
    action: "Run",
    result: (project) => `Suggestions are now attached to active discovery fields for ${project}.`,
  },
  {
    id: "enhance-brand-dna",
    icon: "dna",
    name: "Enhance Brand DNA",
    description: "Claude refines positioning, taglines, and visual brief using full discovery context and cluster data.",
    meta: "Cached 24h - Add-on",
    badge: "Add-on",
    badgeClass: "addon",
    action: "Run",
    result: (project) => `Brand DNA for ${project} was enhanced with sharper positioning and 3 refined tagline routes.`,
  },
  {
    id: "voice-simulator",
    icon: "voice",
    name: "Voice Simulator",
    description: "Full brand voice guide - dos, don'ts, vocabulary, and 3 sample copy pieces.",
    meta: "6-field schema output",
    badge: "Add-on",
    badgeClass: "addon",
    action: "Run",
    result: (project) => `Voice simulator for ${project} produced a tone guide and three sample copy snippets.`,
  },
  {
    id: "moodboard-directions",
    icon: "palette",
    name: "Moodboard Directions",
    description: "3 visual directions with validated hex palettes, typography pairings, and mood descriptors.",
    meta: "Hex-validated - Re-calls",
    badge: "Add-on",
    badgeClass: "addon",
    action: "Run",
    result: (project) => `Three moodboard directions for ${project} were generated with validated palettes.`,
  },
  {
    id: "concept-strategies",
    icon: "idea",
    name: "Concept Strategies",
    description: "3 strategies with risk level, differentiation score, and rationale for each concept direction.",
    meta: "Risk + diff score",
    badge: "Add-on",
    badgeClass: "addon",
    action: "Run",
    result: (project) => `Three concept strategies for ${project} are ready with risk and differentiation scoring.`,
  },
  {
    id: "creative-brief",
    icon: "brief",
    name: "Creative Brief",
    description: "Template brief (free) or AI-enhanced (add-on). Uses full project brand context.",
    meta: "Template free - AI add-on",
    badge: "Core",
    badgeClass: "core",
    action: "Generate",
    result: (project) => `Creative brief for ${project} was generated and staged for export.`,
  },
  {
    id: "proposal-generator",
    icon: "doc",
    name: "Proposal Generator",
    description: "6-section proposal generated in parallel: summary, strategy, process, scope, investment, why us.",
    meta: "Export-ready",
    badge: "Add-on",
    badgeClass: "addon",
    action: "Run",
    result: (project) => `Proposal draft for ${project} was assembled with six structured sections.`,
  },
  {
    id: "project-health-ai",
    icon: "heart",
    name: "Project Health AI",
    description: "Daily health score, risk factors, and recommended actions. Uses Haiku model for cost efficiency.",
    meta: "Daily scorecard",
    badge: "Agency",
    badgeClass: "agency",
    action: "Run",
    result: (project) => `Project health for ${project} scored at 82 with two follow-up suggestions.`,
  },
  {
    id: "ai-usage-stats",
    icon: "chart",
    name: "AI Usage Stats",
    description: "Acceptance rates by module, cost breakdown in paise, and output quality metrics.",
    meta: "Ops dashboard",
    badge: "Core",
    badgeClass: "core",
    action: "Run",
    result: (project) => `Usage stats for ${project} were refreshed with the latest cost and acceptance metrics.`,
  },
];

function ToolIcon({ type }) {
  switch (type) {
    case "dna":
      return <span className="ai-suite-tool-glyph">DNA</span>;
    case "voice":
      return <span className="ai-suite-tool-glyph">MIC</span>;
    case "palette":
      return <span className="ai-suite-tool-glyph">ART</span>;
    case "idea":
      return <span className="ai-suite-tool-glyph">IDEA</span>;
    case "brief":
      return <span className="ai-suite-tool-glyph">BRF</span>;
    case "doc":
      return <span className="ai-suite-tool-glyph">DOC</span>;
    case "heart":
      return <span className="ai-suite-tool-glyph">AI</span>;
    case "chart":
      return <span className="ai-suite-tool-glyph">BAR</span>;
    default:
      return <span className="ai-suite-tool-glyph">AI</span>;
  }
}

export default function Aisute() {
  const [selectedProject, setSelectedProject] = useState(projects[0]);
  const [activeToolId, setActiveToolId] = useState("");
  const [runningToolId, setRunningToolId] = useState("");
  const [isCopilotLive, setIsCopilotLive] = useState(true);
  const [toolRuns, setToolRuns] = useState({});
  const [latestOutput, setLatestOutput] = useState(null);
  const runTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
      }
    };
  }, []);

  const activeResult = useMemo(() => {
    if (!latestOutput) {
      return `${selectedProject} is ready. Choose a tool to run brand workflows.`;
    }

    return `${latestOutput.message} Updated ${latestOutput.time}.`;
  }, [latestOutput, selectedProject]);

  const handleProjectChange = (event) => {
    setSelectedProject(event.target.value);
    setActiveToolId("");
    setRunningToolId("");
  };

  const handleToolAction = (tool) => {
    if (runningToolId) {
      return;
    }

    setActiveToolId(tool.id);
    setRunningToolId(tool.id);

    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }

    runTimerRef.current = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      setToolRuns((current) => ({
        ...current,
        [tool.id]: (current[tool.id] || 0) + 1,
      }));

      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: tool.result(selectedProject),
        time: timestamp,
      });

      setRunningToolId("");
    }, 550);
  };

  return (
    <div className="content">
      <div className="screen">
        <div className="ai-suite-shell">
          <div className="ai-suite-head">
            <div>
              <div className="ai-suite-kicker">AI Suite</div>
              <h1 className="ai-suite-title">9 intelligent brand tools</h1>
            </div>

            <label className="ai-suite-project-picker">
              <span className="ai-suite-project-label">Project</span>
              <select value={selectedProject} onChange={handleProjectChange}>
                {projects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="ai-suite-card ai-suite-live-card">
            <div className="ai-suite-live-main">
              <div className="ai-suite-live-icon">+</div>
              <div>
                <div className="ai-suite-live-title">AI Co-Pilot is {isCopilotLive ? "active" : "paused"}</div>
                <div className="ai-suite-live-copy">
                  {isCopilotLive
                    ? "Real-time suggestions appear as clients type in discovery frames"
                    : "Co-Pilot is paused. Resume it to re-enable live discovery suggestions."}
                </div>
              </div>
            </div>
            <button
              className={`ai-suite-live-pill ${isCopilotLive ? "" : "paused"}`.trim()}
              type="button"
              onClick={() => setIsCopilotLive((current) => !current)}
            >
              {isCopilotLive ? "Live" : "Paused"}
            </button>
          </section>

          <div className="ai-suite-grid">
            {tools.map((tool) => (
              <section className="ai-suite-card ai-suite-tool-card" key={tool.id}>
                <div className="ai-suite-tool-top">
                  <div className="ai-suite-tool-icon">
                    <ToolIcon type={tool.icon} />
                  </div>
                  <span className={`ai-suite-badge ${tool.badgeClass}`.trim()}>{tool.badge}</span>
                </div>

                <h2 className="ai-suite-tool-title">{tool.name}</h2>
                <p className="ai-suite-tool-description">{tool.description}</p>

                <div className="ai-suite-tool-bottom">
                  <div className="ai-suite-tool-meta">
                    {tool.meta}
                    <span className="ai-suite-tool-runs">Runs: {toolRuns[tool.id] || 0}</span>
                  </div>
                  <button
                    className="btn btn-secondary ai-suite-run-btn"
                    type="button"
                    onClick={() => handleToolAction(tool)}
                    disabled={Boolean(runningToolId)}
                  >
                    {runningToolId === tool.id ? "Running..." : tool.action}
                  </button>
                </div>
              </section>
            ))}
          </div>

          <section className="ai-suite-card ai-suite-result-card">
            <div className="ai-suite-result-label">Latest output</div>
            <div className="ai-suite-result-tool">
              {activeToolId ? tools.find((item) => item.id === activeToolId)?.name || "AI Suite" : "AI Suite"}
            </div>
            <div className="ai-suite-result-text">{activeResult}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
