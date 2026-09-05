"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBrandDNA, getDiscoverySummary, getProject, getProjects } from "../../src/lib/projectApi";
import {
  Sparkles,
  Dna,
  Mic,
  Palette,
  Lightbulb,
  FileText,
  FileCheck,
  HeartHandshake,
  BarChart2,
  Bot,
} from "lucide-react";

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
    result: () => "Suggestions are unavailable until project data is connected.",
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
    result: () => "Brand DNA enhancement is unavailable until project data is connected.",
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
    result: () => "Voice simulation is unavailable until project data is connected.",
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
    result: () => "Moodboard directions are unavailable until project data is connected.",
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
    result: () => "Concept strategies are unavailable until project data is connected.",
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
    result: () => "Creative brief generation is unavailable until project data is connected.",
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
    result: () => "Proposal generation is unavailable until project data is connected.",
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
    result: () => "Project health scoring is unavailable until project data is connected.",
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
    result: () => "Usage stats are unavailable until project data is connected.",
  },
];

function ToolIcon({ type }) {
  switch (type) {
    case "spark":
      return <Sparkles size={18} strokeWidth={1.8} />;
    case "dna":
      return <Dna size={18} strokeWidth={1.8} />;
    case "voice":
      return <Mic size={18} strokeWidth={1.8} />;
    case "palette":
      return <Palette size={18} strokeWidth={1.8} />;
    case "idea":
      return <Lightbulb size={18} strokeWidth={1.8} />;
    case "brief":
      return <FileText size={18} strokeWidth={1.8} />;
    case "doc":
      return <FileCheck size={18} strokeWidth={1.8} />;
    case "heart":
      return <HeartHandshake size={18} strokeWidth={1.8} />;
    case "chart":
      return <BarChart2 size={18} strokeWidth={1.8} />;
    default:
      return <Sparkles size={18} strokeWidth={1.8} />;
  }
}

function formatList(items, fallback = "Not available") {
  if (!Array.isArray(items) || items.length === 0) {
    return fallback;
  }

  return items.filter(Boolean).join(", ") || fallback;
}

function getCompetitorNames(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "generic category references";
  }

  return items.map((item) => item?.name).filter(Boolean).slice(0, 3).join(", ") || "generic category references";
}

function getSectorPalette(sector = "") {
  const value = sector.toLowerCase();

  if (value.includes("tech") || value.includes("saas")) {
    return ["#102A43", "#2F80ED", "#56CCF2", "#F6FAFF"];
  }

  if (value.includes("beauty") || value.includes("wellness") || value.includes("health")) {
    return ["#173B2F", "#7BC6A4", "#F7D6D0", "#FFF7EF"];
  }

  if (value.includes("food") || value.includes("beverage")) {
    return ["#3A1F12", "#D9822B", "#F7C948", "#FFF8E8"];
  }

  if (value.includes("consumer") || value.includes("goods")) {
    return ["#123C33", "#35B779", "#F4B942", "#F8F5EF"];
  }

  return ["#102D1D", "#4DFFA0", "#7EA092", "#F4F8F2"];
}

function buildMoodboardDirections({ project, discovery, brandDNA }) {
  const companyName = discovery?.company_name || project?.company_name || project?.title || "Selected project";
  const sector = discovery?.industry || project?.sector || "brand";
  const audience = discovery?.target_customer || brandDNA?.target_audience_summary || "the target audience";
  const emotions = formatList(discovery?.emotions, "clarity, trust, confidence");
  const visualStyles = formatList(discovery?.visual_styles, "clean, focused, modern");
  const competitors = getCompetitorNames(discovery?.top_competitors);
  const palette = getSectorPalette(sector);
  const positioningSignal = brandDNA?.positioning_summary || discovery?.why_choose_us || "the brand's core differentiation";
  const brandFeeling = brandDNA?.brand_feeling_summary || discovery?.brand_feeling || "make the audience feel confident and understood";

  const directions = [
    {
      name: "Direction 1: Signal Clarity",
      theme: `A precise, trustworthy system that makes ${companyName} feel easy to understand and credible in ${sector}, designed to ${brandFeeling}.`,
      palette: `${palette[0]} / ${palette[1]} / ${palette[3]} with small high-contrast accent usage.`,
      typography: "Structured sans-serif headings, open humanist body text, generous line spacing.",
      photography: "Clean product/service moments, confident client-facing scenes, minimal background noise.",
      texture: "Soft grid systems, thin rule lines, matte surfaces, restrained interface-like layering.",
      avoid: `Avoid overdecorated layouts and anything too close to ${competitors}.`,
      reasoning: `Uses the audience need for clarity plus ${positioningSignal} to create a practical trust-first moodboard.`,
    },
    {
      name: "Direction 2: Human Warmth",
      theme: `A warmer, more relational direction built around ${emotions} without losing professional structure.`,
      palette: `${palette[3]} / #F2C9A0 / #C97A4B / ${palette[0]} for approachability with depth.`,
      typography: "Soft serif or rounded display accents paired with a highly readable sans-serif.",
      photography: "Close human detail, hands, workspace/process images, natural light, candid confidence.",
      texture: "Paper grain, soft shadows, organic crops, subtle tactile overlays.",
      avoid: "Avoid cold corporate imagery, harsh neon dominance, and stock-photo smiles.",
      reasoning: `Transforms the submitted emotional cues into a moodboard that can make ${audience} feel welcomed and reassured.`,
    },
    {
      name: "Direction 3: Distinctive Edge",
      theme: `A bolder editorial route that gives ${companyName} stronger recall while staying grounded in ${visualStyles}.`,
      palette: `${palette[0]} / #111111 / ${palette[1]} / #FFFFFF with one unexpected accent from ${palette[2]}.`,
      typography: "Condensed headline type or confident geometric display, balanced by simple body text.",
      photography: "Sharper crops, directional lighting, striking compositions, selective color blocking.",
      texture: "Layered panels, oversized type moments, cropped shapes, contrast between polished and raw details.",
      avoid: "Avoid copying competitor category tropes, muted sameness, or overly safe template layouts.",
      reasoning: `Uses the visual style inputs to push differentiation, giving the consultant a stronger option for moodboard exploration.`,
    },
  ];

  return [
    `Moodboard Directions - ${companyName}`,
    `Context used: ${sector}; audience: ${audience}; emotions: ${emotions}; styles: ${visualStyles}.`,
    "",
    ...directions.flatMap((direction) => [
      direction.name,
      `Concept / visual theme: ${direction.theme}`,
      `Color palette: ${direction.palette}`,
      `Typography direction: ${direction.typography}`,
      `Photography / image style: ${direction.photography}`,
      `Texture / material direction: ${direction.texture}`,
      `What to avoid: ${direction.avoid}`,
      `Reasoning: ${direction.reasoning}`,
      "",
    ]),
  ].join("\n");
}

export default function Aisute() {
  const [selectedProject, setSelectedProject] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeToolId, setActiveToolId] = useState("");
  const [runningToolId, setRunningToolId] = useState("");
  const [isCopilotLive, setIsCopilotLive] = useState(true);
  const [toolRuns, setToolRuns] = useState({});
  const [latestOutput, setLatestOutput] = useState(null);
  const runTimerRef = useRef(null);

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjects();
        const projectRows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

        setProjects(projectRows);

        if (projectRows.length > 0) {
          setSelectedProject(String(projectRows[0].id));
        }
      } catch (error) {
        console.error("Failed to load AI Suite projects:", error);
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    }

    loadProjects();
  }, []);

  useEffect(() => {
    return () => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
      }
    };
  }, []);

  const selectedProjectData = useMemo(() => {
    return projects.find((project) => String(project.id) === selectedProject) || null;
  }, [projects, selectedProject]);

  const activeResult = useMemo(() => {
    if (!latestOutput) {
      if (projectsLoading) {
        return "Loading consultant projects.";
      }

      return selectedProjectData
        ? `${selectedProjectData.company_name || selectedProjectData.title || "Selected project"} is ready. Choose a tool to run brand workflows.`
        : "No projects available.";
    }

    return `${latestOutput.message} Updated ${latestOutput.time}.`;
  }, [latestOutput, projectsLoading, selectedProjectData]);

  const handleProjectChange = (event) => {
    setSelectedProject(event.target.value);
    setActiveToolId("");
    setRunningToolId("");
    setLatestOutput(null);
  };

  const handleMoodboardDirections = async (tool) => {
    if (!selectedProjectData?.id) {
      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: "Select a project before generating moodboard directions.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    try {
      const [project, discovery] = await Promise.all([
        getProject(selectedProjectData.id),
        getDiscoverySummary(selectedProjectData.id),
      ]);
      let brandDNA = null;

      try {
        brandDNA = await getBrandDNA(selectedProjectData.id);
      } catch {
        brandDNA = null;
      }

      setToolRuns((current) => ({
        ...current,
        [tool.id]: (current[tool.id] || 0) + 1,
      }));

      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: buildMoodboardDirections({ project: project || selectedProjectData, discovery, brandDNA }),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } catch (error) {
      console.error("Failed to generate moodboard directions:", error);
      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: error?.detail || "Moodboard directions could not be generated. Complete client discovery and try again.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
  };

  const handleToolAction = async (tool) => {
    if (runningToolId) {
      return;
    }

    setActiveToolId(tool.id);
    setRunningToolId(tool.id);

    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }

    if (tool.id === "moodboard-directions") {
      await handleMoodboardDirections(tool);
      setRunningToolId("");
      return;
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
                {projectsLoading ? (
                  <option value="">Loading projects...</option>
                ) : projects.length > 0 ? (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.company_name || project.title || project.client_name || `Project ${project.id}`}
                    </option>
                  ))
                ) : (
                  <option value="">No projects available</option>
                )}
              </select>
            </label>
          </div>

          <section className="ai-suite-card ai-suite-live-card">
            <div className="ai-suite-live-main">
              <div className="ai-suite-live-icon">
                <Bot size={18} strokeWidth={1.8} />
              </div>
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
            <div className="ai-suite-result-text">
              {activeResult.split("\n").map((line, index) => (
                <div key={`${line}-${index}`}>{line || "\u00a0"}</div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
