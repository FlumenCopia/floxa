"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getProjects, getAiSuiteUsage, runAiSuiteTool } from "@/lib/projectApi";
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
  ChevronDown,
  Check,
  Copy,
  Zap,
  X,
  Lock,
} from "lucide-react";

const tools = [
  {
    id: "proposal-generator",
    icon: "doc",
    name: "Proposal Generator",
    description: "6-section commercial proposal: executive summary, strategic approach, scope, timeline, investment & why us.",
    meta: "3 Free Runs • Export-ready",
    badge: "Active Suite",
    badgeClass: "core",
    isActive: true,
    action: "Generate Proposal",
  },
  {
    id: "enhance-brand-dna",
    icon: "dna",
    name: "Enhance Brand DNA",
    description: "AI refines positioning, archetypes, UVP, and 5 distinct tagline options using discovery context.",
    meta: "3 Free Runs • Strategy Core",
    badge: "Active Suite",
    badgeClass: "core",
    isActive: true,
    action: "Enhance DNA",
  },
  {
    id: "moodboard-directions",
    icon: "palette",
    name: "Moodboard Directions",
    description: "3 visual directions with validated HEX palettes, typography pairings, imagery style & texture cues.",
    meta: "3 Free Runs • Hex-validated",
    badge: "Active Suite",
    badgeClass: "core",
    isActive: true,
    action: "Generate Directions",
  },
  {
    id: "creative-brief",
    icon: "brief",
    name: "Creative Brief",
    description: "Template brief or AI-enhanced. Uses full project brand context.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `Creative Brief Suite Preview (${projectName || "Project"})\n\nThis suite will automatically construct a complete 1-page Creative Brief (Objective, Target Audience, Problem Statement, Brand Tone, Key Deliverables, and Constraints) aligned with your studio brand identity.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
  },
  {
    id: "discovery-copilot",
    icon: "spark",
    name: "Discovery Co-Pilot",
    description: "Real-time field suggestions as client types. 1s debounce, silent fail, never blocks discovery.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `Discovery Co-Pilot Preview (${projectName || "Project"})\n\nThis background agent provides real-time intelligent autocomplete prompts as your clients type answers in the Client Portal discovery intake form.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
  },
  {
    id: "voice-simulator",
    icon: "voice",
    name: "Voice Simulator",
    description: "Full brand voice guide - dos, don'ts, vocabulary, and 3 sample copy pieces.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `Voice Simulator Preview (${projectName || "Project"})\n\nThis suite generates your client's complete Brand Tone of Voice guide: Dos & Don'ts, vocabulary banks, and 3 copywriting samples across social and web.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
  },
  {
    id: "concept-strategies",
    icon: "idea",
    name: "Concept Strategies",
    description: "3 strategies with risk level, differentiation score, and rationale for each concept direction.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `Concept Strategies Preview (${projectName || "Project"})\n\nGenerates 3 strategic concept angles with risk levels and differentiation scores before you pitch brand identity concepts.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
  },
  {
    id: "project-health-ai",
    icon: "heart",
    name: "Project Health AI",
    description: "Daily health score, risk factors, and recommended actions for studio delivery.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `Project Health AI Preview (${projectName || "Project"})\n\nMonitors milestone velocity, communication lag, and deliverable sign-offs to alert you before projects go overdue.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
  },
  {
    id: "ai-usage-stats",
    icon: "chart",
    name: "AI Usage Stats",
    description: "Acceptance rates by module, cost breakdown in paise, and output quality metrics.",
    meta: "Pro Suite • Upcoming",
    badge: "Coming Soon",
    badgeClass: "agency",
    isActive: false,
    action: "Preview",
    result: (projectName) =>
      `AI Usage Stats Preview (${projectName || "Project"})\n\nTracks agency acceptance rates, token costs in paise, and model latency across all client workspaces.\n\nStatus: Coming in the upcoming Floxa Pro release.`,
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

export default function AiSuite() {
  const [selectedProject, setSelectedProject] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeToolId, setActiveToolId] = useState("");
  const [runningToolId, setRunningToolId] = useState("");
  const [isCopilotLive, setIsCopilotLive] = useState(true);
  const [toolRuns, setToolRuns] = useState({});
  const [userPlan, setUserPlan] = useState("free");
  const [freeLimit, setFreeLimit] = useState(3);
  const [latestOutput, setLatestOutput] = useState(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalTool, setUpgradeModalTool] = useState(null);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef(null);

  const scrollToResults = () => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [projectsRes, usageRes] = await Promise.allSettled([
          getProjects(),
          getAiSuiteUsage(),
        ]);

        if (projectsRes.status === "fulfilled") {
          const data = projectsRes.value;
          const projectRows = Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data)
            ? data
            : [];
          setProjects(projectRows);
          if (projectRows.length > 0) {
            setSelectedProject(String(projectRows[0].id));
          }
        }

        if (usageRes.status === "fulfilled" && usageRes.value) {
          if (usageRes.value.toolRuns) setToolRuns(usageRes.value.toolRuns);
          if (usageRes.value.plan) setUserPlan(usageRes.value.plan);
          if (usageRes.value.freeLimit) setFreeLimit(usageRes.value.freeLimit);
        }
      } catch (error) {
        console.error("Failed to load AI Suite data:", error);
      } finally {
        setProjectsLoading(false);
      }
    }

    loadData();
  }, []);

  const selectedProjectData = useMemo(() => {
    return projects.find((project) => String(project.id) === selectedProject) || null;
  }, [projects, selectedProject]);

  const activeResult = useMemo(() => {
    if (!latestOutput) {
      if (projectsLoading) {
        return "Loading consultant projects...";
      }

      return selectedProjectData
        ? `${selectedProjectData.company_name || selectedProjectData.title || "Selected project"} is ready. Choose an active tool above (Proposal Generator, Enhance Brand DNA, or Moodboard Directions) to generate live outputs.`
        : "No projects available. Create a project to test the AI Suite.";
    }

    return `${latestOutput.message}\n\nGenerated at ${latestOutput.time}.`;
  }, [latestOutput, projectsLoading, selectedProjectData]);

  const handleProjectChange = (event) => {
    setSelectedProject(event.target.value);
    setActiveToolId("");
    setRunningToolId("");
    setLatestOutput(null);
  };

  const handleToolAction = async (tool) => {
    if (runningToolId) {
      return;
    }

    setActiveToolId(tool.id);

    // If it's a preview/upcoming tool
    if (!tool.isActive) {
      const projectName = selectedProjectData?.company_name || selectedProjectData?.title;
      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: tool.result(projectName),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    // It is an active tool
    if (!selectedProjectData?.id) {
      setLatestOutput({
        toolId: tool.id,
        toolName: tool.name,
        message: "Please select a client project from the top dropdown first.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      return;
    }

    const runsUsed = Number(toolRuns[tool.id] || 0);
    const isPro = userPlan === "pro";

    if (!isPro && runsUsed >= freeLimit) {
      setUpgradeModalTool(tool);
      setUpgradeModalOpen(true);
      return;
    }

    setRunningToolId(tool.id);

    try {
      const res = await runAiSuiteTool(selectedProjectData.id, tool.id);
      if (res?.success) {
        setToolRuns((prev) => ({
          ...prev,
          [tool.id]: res.runsUsed,
        }));
        setLatestOutput({
          toolId: tool.id,
          toolName: tool.name,
          message: res.output,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        scrollToResults();
      } else {
        throw new Error(res?.detail || "Execution failed");
      }
    } catch (error) {
      console.error("AI Suite tool execution error:", error);
      if (error?.code === "TRIAL_LIMIT_REACHED" || error?.detail?.includes("free runs")) {
        setUpgradeModalTool(tool);
        setUpgradeModalOpen(true);
      } else if (error?.code === "API_KEY_REQUIRED" || error?.detail?.includes("Gemini API Key")) {
        setLatestOutput({
          toolId: tool.id,
          toolName: tool.name,
          message:
            "Google Gemini API Key Required\n\nPlease navigate to Settings > Integrations & API Keys to configure your Gemini API Key. Once saved, you can run AI generations immediately.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        scrollToResults();
      } else {
        setLatestOutput({
          toolId: tool.id,
          toolName: tool.name,
          message:
            error?.detail ||
            error?.message ||
            "Generation could not be completed. Please ensure project discovery data is entered and try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        scrollToResults();
      }
    } finally {
      setRunningToolId("");
    }
  };

  const handleCopyOutput = () => {
    if (!activeResult) return;
    navigator.clipboard.writeText(activeResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="content">
      <div className="screen">
        <div className="ai-suite-shell">
          {/* Header */}
          <div className="ai-suite-head">
            <div className="ai-suite-head-titles">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div className="ai-suite-kicker">AI Suite</div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 10px",
                    borderRadius: "100px",
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    color: "#38bdf8",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                  }}
                >
                  <Sparkles size={12} />
                  <span>STARTER TRIAL: 3 FREE RUNS PER SUITE</span>
                </div>
              </div>
              <h1 className="ai-suite-title">9 intelligent brand tools</h1>
            </div>

            <label className="ai-suite-project-picker">
              <span className="ai-suite-project-label">Project</span>
              <div className="ai-suite-select-wrap">
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
                <ChevronDown size={14} className="ai-suite-select-chevron" />
              </div>
            </label>
          </div>

          {/* Discovery Co-pilot Banner */}
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

          {/* Grid of Tools */}
          <div className="ai-suite-grid">
            {tools.map((tool) => {
              const runsUsed = Number(toolRuns[tool.id] || 0);
              const isLocked = tool.isActive && userPlan !== "pro" && runsUsed >= freeLimit;
              const remaining = Math.max(0, freeLimit - runsUsed);

              return (
                <section
                  className="ai-suite-card ai-suite-tool-card"
                  key={tool.id}
                  style={
                    tool.isActive
                      ? {
                          borderColor: isLocked
                            ? "rgba(248, 113, 113, 0.35)"
                            : "rgba(56, 189, 248, 0.35)",
                          boxShadow: tool.isActive ? "0 4px 20px rgba(0, 0, 0, 0.2)" : undefined,
                        }
                      : { opacity: 0.85 }
                  }
                >
                  <div className="ai-suite-tool-top">
                    <div className="ai-suite-tool-icon">
                      <ToolIcon type={tool.icon} />
                    </div>
                    <span
                      className={`ai-suite-badge ${tool.badgeClass}`.trim()}
                      style={
                        tool.isActive
                          ? {
                              background: "rgba(56, 189, 248, 0.15)",
                              color: "#38bdf8",
                              border: "1px solid rgba(56, 189, 248, 0.3)",
                            }
                          : undefined
                      }
                    >
                      {tool.badge}
                    </span>
                  </div>

                  <h2 className="ai-suite-tool-title">{tool.name}</h2>
                  <p className="ai-suite-tool-description">{tool.description}</p>

                  <div className="ai-suite-tool-bottom">
                    <div className="ai-suite-tool-meta">
                      {tool.meta}
                      {tool.isActive ? (
                        <span
                          className="ai-suite-tool-runs"
                          style={{
                            color: isLocked ? "#f87171" : "#34d399",
                            fontWeight: 600,
                          }}
                        >
                          {userPlan === "pro"
                            ? `Runs: ${runsUsed} (Pro)`
                            : `Runs: ${runsUsed}/${freeLimit} (${remaining} free left)`}
                        </span>
                      ) : (
                        <span className="ai-suite-tool-runs">Preview</span>
                      )}
                    </div>

                    {isLocked ? (
                      <button
                        className="btn btn-secondary ai-suite-run-btn"
                        type="button"
                        onClick={() => {
                          setUpgradeModalTool(tool);
                          setUpgradeModalOpen(true);
                        }}
                        style={{
                          borderColor: "rgba(245, 158, 11, 0.5)",
                          color: "#fbbf24",
                          background: "rgba(245, 158, 11, 0.1)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Lock size={13} />
                        Upgrade
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary ai-suite-run-btn"
                        type="button"
                        onClick={() => handleToolAction(tool)}
                        disabled={Boolean(runningToolId)}
                      >
                        {runningToolId === tool.id ? "Generating..." : tool.action}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Results Output Section */}
          <section className="ai-suite-card ai-suite-result-card" ref={resultsRef} style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div className="ai-suite-result-label">Latest Output</div>
                <div className="ai-suite-result-tool">
                  {activeToolId ? tools.find((item) => item.id === activeToolId)?.name || "AI Suite" : "AI Suite"}
                </div>
              </div>

              {latestOutput && (
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    color: copied ? "#34d399" : "#cbd5e1",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copied to clipboard" : "Copy Output"}</span>
                </button>
              )}
            </div>

            <div
              className="ai-suite-result-text"
              style={{
                marginTop: "16px",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                lineHeight: "1.65",
              }}
            >
              {activeResult.split("\n").map((line, index) => (
                <div key={`${line}-${index}`}>{line || "\u00a0"}</div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Upgrade to Pro Modal */}
      {upgradeModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(8px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setUpgradeModalOpen(false)}
        >
          <div
            style={{
              background: "linear-gradient(145deg, #131b26 0%, #0c1017 100%)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "20px",
              padding: "32px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.12)",
              color: "#ffffff",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(false)}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                color: "#94a3b8",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                borderRadius: "100px",
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#38bdf8",
                marginBottom: "16px",
              }}
            >
              <Sparkles size={13} />
              <span>FLOXA PRO SUITE</span>
            </div>

            <h3 style={{ fontSize: "21px", fontWeight: 700, margin: "0 0 8px 0", color: "#ffffff" }}>
              You've completed your 3 free runs!
            </h3>

            <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: 1.5, margin: "0 0 20px 0" }}>
              You've unlocked the full potential of{" "}
              <strong style={{ color: "#ffffff" }}>{upgradeModalTool?.name || "this AI tool"}</strong>. Upgrade to
              Floxa Pro for unlimited generations across all 9 studio suites.
            </p>

            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "24px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  fontSize: "13px",
                  color: "#e2e8f0",
                }}
              >
                <Zap size={15} style={{ color: "#38bdf8", flexShrink: 0 }} />
                <span>Unlimited generations across all 9 AI brand suites</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  fontSize: "13px",
                  color: "#e2e8f0",
                }}
              >
                <Zap size={15} style={{ color: "#38bdf8", flexShrink: 0 }} />
                <span>High-fidelity Google Gemini strategic models</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "13px",
                  color: "#e2e8f0",
                }}
              >
                <Zap size={15} style={{ color: "#38bdf8", flexShrink: 0 }} />
                <span>Export-ready proposals, briefs & palettes</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "20px" }}>
              <span style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff" }}>₹999</span>
              <span style={{ fontSize: "14px", color: "#64748b" }}>/ month</span>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
                onClick={() => {
                  alert(
                    "Floxa Pro subscriptions will be available in the upcoming billing release. Your free trial demonstrates full AI functionality!"
                  );
                  setUpgradeModalOpen(false);
                }}
              >
                <Sparkles size={16} />
                Upgrade to Pro
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "12px 18px", fontSize: "14px", cursor: "pointer" }}
                onClick={() => setUpgradeModalOpen(false)}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
