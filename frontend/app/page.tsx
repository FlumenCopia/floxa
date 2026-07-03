"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type Screen =
  | "dashboard"
  | "projects"
  | "new-project"
  | "project-detail"
  | "ai-suite"
  | "analytics"
  | "settings";

type StatusTone = "green" | "amber" | "blue" | "red" | "muted";

type Project = {
  name: string;
  category: string;
  email: string;
  status: string;
  tone: StatusTone;
  value: string;
  progress: number;
  started: string;
};

type AiModule = {
  key: keyof typeof AI_OUTPUTS;
  icon: string;
  name: string;
  tier: string;
  description: string;
  rate: string;
};

const projects: Project[] = [
  {
    name: "Craft & Co",
    category: "Consumer Goods",
    email: "craft@company.com",
    status: "Discovery",
    tone: "amber",
    value: "₹50,000",
    progress: 45,
    started: "Jun 1",
  },
  {
    name: "Bloom Studio",
    category: "Beauty & Wellness",
    email: "hello@bloom.in",
    status: "Advance Paid",
    tone: "green",
    value: "₹75,000",
    progress: 60,
    started: "May 28",
  },
  {
    name: "Helix Tech",
    category: "Technology",
    email: "brand@helixtech.io",
    status: "Concepts",
    tone: "blue",
    value: "₹1,20,000",
    progress: 80,
    started: "May 20",
  },
  {
    name: "Luna Spa",
    category: "Hospitality",
    email: "team@lunaspa.com",
    status: "Delivered",
    tone: "green",
    value: "₹90,000",
    progress: 100,
    started: "May 6",
  },
];

const notifications = [
  {
    title: "Brand DNA generated",
    body: "Craft & Co is ready for creative briefing.",
    time: "4 min ago",
  },
  {
    title: "Advance payment received",
    body: "Bloom Studio paid ₹25,000.",
    time: "1 hr ago",
  },
  {
    title: "Moodboard pending",
    body: "Helix Tech has not chosen a direction yet.",
    time: "Today",
  },
];

const aiModules: AiModule[] = [
  {
    key: "copilot",
    icon: "✦",
    name: "Discovery Co-Pilot",
    tier: "Core",
    description:
      "Real-time field suggestions as clients type through discovery.",
    rate: "30/hr · Always on",
  },
  {
    key: "enhance",
    icon: "🧬",
    name: "Enhance Brand DNA",
    tier: "Add-on",
    description:
      "Refines positioning, taglines, and visual brief using discovery data.",
    rate: "Cached 24h · Add-on",
  },
  {
    key: "voice",
    icon: "🎙",
    name: "Voice Simulator",
    tier: "Add-on",
    description: "Creates a brand voice guide with examples and vocabulary.",
    rate: "6-field schema output",
  },
  {
    key: "moodboard",
    icon: "🎨",
    name: "Moodboard Directions",
    tier: "Add-on",
    description:
      "Builds three visual directions with palettes and typography pairings.",
    rate: "Hex-validated · Re-calls",
  },
  {
    key: "concepts",
    icon: "💡",
    name: "Concept Strategies",
    tier: "Add-on",
    description:
      "Generates concept routes with risk scores and differentiation angles.",
    rate: "Risk + diff score",
  },
  {
    key: "brief",
    icon: "📋",
    name: "Creative Brief",
    tier: "Core",
    description:
      "Turns project context into a focused creative brief for execution.",
    rate: "Template free · AI add-on",
  },
  {
    key: "proposal",
    icon: "📄",
    name: "Proposal Generator",
    tier: "Add-on",
    description:
      "Drafts a six-part proposal covering strategy, process, and scope.",
    rate: "6 parallel calls · 25s",
  },
  {
    key: "health",
    icon: "❤",
    name: "Project Health AI",
    tier: "Agency",
    description:
      "Scores delivery risk daily and suggests the next best action.",
    rate: "Agency only · Daily",
  },
];

const AI_OUTPUTS = {
  copilot:
    'Co-Pilot suggestion: "Lead with your sustainability commitment here. It is a strong trust signal for this audience."',
  enhance:
    'Positioning: FLOXA helps ambitious studios turn raw client input into strategic clarity before design begins.\n\nTaglines:\n• Own the conversation.\n• Brands that lead.\n• Identity, elevated.',
  voice:
    'Brand Voice Guide\n\nDo: be direct, confident, and forward-looking.\nAvoid: passive language, filler, and uncertainty.\nVocabulary: Define, Lead, Claim, Build, Own.',
  moodboard:
    "Direction 1: Dark Premium\nDirection 2: Warm Editorial\nDirection 3: Bold Geometry",
  concepts:
    "Strategy A: Bold but considered.\nStrategy B: Disruptive minimalism.\nStrategy C: Category authority.",
  brief:
    'Creative Brief\n\nAudience: premium-seeking urban professionals.\nCore message: "We define what the category becomes."',
  proposal:
    "Proposal Summary\n\n8-week identity engagement with positioning, moodboards, concept development, and system rollout.",
  health:
    "Project Health Score: 7.4 / 10\n\nRisks: moodboard choice pending, mid-payment not initiated.\nRecommendation: follow up within 24 hours.",
};

const topbarLabels: Record<Screen, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  "new-project": "New Project",
  "project-detail": "Craft & Co",
  "ai-suite": "AI Suite",
  analytics: "Analytics",
  settings: "Settings",
};

const chartBars = [
  { label: "Jan", value: 50 },
  { label: "Feb", value: 77 },
  { label: "Mar", value: 58 },
  { label: "Apr", value: 92 },
  { label: "May", value: 79 },
  { label: "Jun", value: 100 },
];

const acceptanceBars = [
  { label: "Co-Pilot", value: 72 },
  { label: "DNA", value: 68 },
  { label: "Voice", value: 75 },
  { label: "Mood", value: 81 },
  { label: "Concepts", value: 64 },
  { label: "Brief", value: 70 },
];

function statusClass(tone: StatusTone) {
  return styles[`badge${tone[0].toUpperCase()}${tone.slice(1)}`];
}

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<Screen>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedProject] = useState<Project>(projects[0]);
  const [activeProjectTab, setActiveProjectTab] = useState<
    "overview" | "brand-dna" | "brief" | "activity"
  >("overview");
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalStep, setPortalStep] = useState(1);
  const [portalEmail, setPortalEmail] = useState("");
  const [brandName, setBrandName] = useState("FLOXA");
  const [brandHeading, setBrandHeading] = useState("Clarity Before Creation");
  const [brandColor, setBrandColor] = useState("#4dffa0");

  const acceptanceAverage = useMemo(() => {
    return Math.round(
      acceptanceBars.reduce((sum, item) => sum + item.value, 0) /
        acceptanceBars.length,
    );
  }, []);

  function openScreen(screen: Screen) {
    setActiveScreen(screen);
    setSidebarOpen(false);
    setNotifOpen(false);
  }

  function runAi(module: keyof typeof AI_OUTPUTS) {
    setAiLoading(module);
    setAiResult("");
    window.setTimeout(() => {
      setAiLoading(null);
      setAiResult(AI_OUTPUTS[module]);
    }, 900);
  }

  return (
    <main className={styles.page}>
      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayOpen : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className={styles.shell}>
        <aside
          className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        >
          <div className={styles.logoArea}>
            <div className={styles.logo}>FLOXA</div>
            <div className={styles.logoTag}>Clarity Before Creation</div>
          </div>

          <div className={styles.navSection}>
            <div className={styles.navLabel}>Workspace</div>
            <NavButton
              active={activeScreen === "dashboard"}
              label="Dashboard"
              onClick={() => openScreen("dashboard")}
            />
            <NavButton
              active={activeScreen === "projects"}
              label="Projects"
              onClick={() => openScreen("projects")}
            />
            <NavButton
              active={activeScreen === "new-project"}
              label="New Project"
              onClick={() => openScreen("new-project")}
            />
            <NavButton
              active={activeScreen === "project-detail"}
              label="Project Detail"
              onClick={() => openScreen("project-detail")}
            />
          </div>

          <div className={styles.navSection}>
            <div className={styles.navLabel}>Tools</div>
            <NavButton
              active={activeScreen === "ai-suite"}
              label="AI Suite"
              badge="9"
              onClick={() => openScreen("ai-suite")}
            />
            <NavButton
              active={activeScreen === "analytics"}
              label="Analytics"
              onClick={() => openScreen("analytics")}
            />
            <NavButton
              active={activeScreen === "settings"}
              label="Settings"
              onClick={() => openScreen("settings")}
            />
          </div>

          <button className={styles.userChip} type="button">
            <div className={styles.avatar}>AK</div>
            <div>
              <div className={styles.userName}>Akhil</div>
              <div className={styles.userPlan}>Studio plan</div>
            </div>
          </button>
        </aside>

        <section className={styles.main}>
          <header className={styles.topbar}>
            <button
              className={styles.menuButton}
              type="button"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className={styles.topbarTitle}>{topbarLabels[activeScreen]}</div>
            <div className={styles.spacer} />
            <div className={styles.searchWrap}>
              <span>⌕</span>
              <input placeholder="Search projects" />
            </div>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setNotifOpen((value) => !value)}
            >
              ⌁
              <span className={styles.notifDot} />
            </button>

            {notifOpen ? (
              <div className={styles.notifDrop}>
                <div className={styles.notifHead}>
                  <span>Notifications</span>
                </div>
                {notifications.map((item) => (
                  <button
                    key={item.title}
                    className={styles.notifItem}
                    type="button"
                    onClick={() => openScreen("project-detail")}
                  >
                    <div className={styles.notifTitle}>{item.title}</div>
                    <div className={styles.notifBody}>{item.body}</div>
                    <div className={styles.notifTime}>{item.time}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          <div className={styles.content}>
            {activeScreen === "dashboard" ? (
              <section className={styles.screen}>
                <div className={styles.kpiGrid}>
                  <KpiCard label="Active Projects" value="14" delta="+2 this week" />
                  <KpiCard label="Revenue Pipeline" value="₹3.4L" delta="+18% vs last month" />
                  <KpiCard label="AI Adoption Rate" value={`${acceptanceAverage}%`} delta="Healthy usage" />
                  <KpiCard label="Avg Delivery Score" value="8.9" delta="Across 28 projects" />
                </div>

                <div className={styles.twoCol}>
                  <div className={styles.card}>
                    <div className={styles.sectionHead}>
                      <div>
                        <div className={styles.sectionTitle}>Projects in motion</div>
                        <div className={styles.sectionSub}>
                          Recent work across your studio pipeline.
                        </div>
                      </div>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => openScreen("projects")}
                      >
                        View all
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Client</th>
                            <th>Status</th>
                            <th>Progress</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.slice(0, 3).map((project) => (
                            <tr
                              key={project.name}
                              onClick={() => openScreen("project-detail")}
                            >
                              <td>
                                <div className={styles.primaryText}>{project.name}</div>
                                <div className={styles.secondaryText}>
                                  {project.category}
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`${styles.badge} ${statusClass(project.tone)}`}
                                >
                                  {project.status}
                                </span>
                              </td>
                              <td>
                                <div className={styles.progressRow}>
                                  <div className={styles.progress}>
                                    <div
                                      className={styles.progressFill}
                                      style={{ width: `${project.progress}%` }}
                                    />
                                  </div>
                                  <span>{project.progress}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Recent activity</div>
                    <div className={styles.activityList}>
                      <ActivityItem
                        title="₹25,000 advance payment received from Bloom Studio"
                        time="1 hr ago"
                      />
                      <ActivityItem
                        title="Luna Spa completed discovery and Brand DNA was generated"
                        time="Today, 4:22 PM"
                      />
                      <ActivityItem
                        title="Craft & Co brief approved for concept development"
                        time="Yesterday"
                      />
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => setPortalOpen(true)}
                      >
                        Open Client Portal
                      </button>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => openScreen("ai-suite")}
                      >
                        AI Suite
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeScreen === "projects" ? (
              <section className={styles.screen}>
                <div className={styles.card}>
                  <div className={styles.sectionHead}>
                    <div>
                      <div className={styles.sectionTitle}>All projects</div>
                      <div className={styles.sectionSub}>
                        Studio pipeline with status, value, and progress.
                      </div>
                    </div>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={() => openScreen("new-project")}
                    >
                      New project
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th>Value</th>
                          <th>Progress</th>
                          <th>Started</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map((project) => (
                          <tr
                            key={project.name}
                            onClick={() => openScreen("project-detail")}
                          >
                            <td>
                              <div className={styles.primaryText}>{project.name}</div>
                              <div className={styles.secondaryText}>
                                {project.email}
                              </div>
                            </td>
                            <td>{project.category}</td>
                            <td>
                              <span
                                className={`${styles.badge} ${statusClass(project.tone)}`}
                              >
                                {project.status}
                              </span>
                            </td>
                            <td>{project.value}</td>
                            <td>
                              <div className={styles.progress}>
                                <div
                                  className={styles.progressFill}
                                  style={{ width: `${project.progress}%` }}
                                />
                              </div>
                            </td>
                            <td>{project.started}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {activeScreen === "new-project" ? (
              <section className={styles.screen}>
                <div className={styles.formGrid}>
                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Create a new project</div>
                    <div className={styles.fieldGrid}>
                      <Field label="Client name" placeholder="Craft & Co" />
                      <Field label="Client email" placeholder="priya@studio.in" />
                      <Field label="Industry" placeholder="Consumer Goods" />
                      <Field label="Project value" placeholder="₹50,000" />
                    </div>
                    <Field
                      label="Project scope"
                      placeholder="Brand strategy, identity system, and rollout assets"
                      textarea
                    />
                  </div>
                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Preview</div>
                    <div className={styles.previewCard}>
                      <div className={styles.previewBrand}>{brandName}</div>
                      <div className={styles.previewHeading}>{brandHeading}</div>
                      <div className={styles.previewOrb} style={{ background: brandColor }} />
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => openScreen("project-detail")}
                      >
                        Create project
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeScreen === "project-detail" ? (
              <section className={styles.screen}>
                <div className={styles.projectHero}>
                  <div>
                    <div className={styles.eyebrow}>Project detail</div>
                    <h1 className={styles.projectTitle}>{selectedProject.name}</h1>
                    <p className={styles.sectionSub}>
                      Discovery-driven brand engagement for a fast-growing consumer
                      company.
                    </p>
                  </div>
                  <div className={styles.inlineActions}>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={() => openScreen("ai-suite")}
                    >
                      Enhance with AI
                    </button>
                    <button className={styles.secondaryButton} type="button">
                      Export brief
                    </button>
                  </div>
                </div>

                <div className={styles.projectLayout}>
                  <div className={styles.card}>
                    <div className={styles.tabRow}>
                      {["overview", "brand-dna", "brief", "activity"].map((tab) => (
                        <button
                          key={tab}
                          className={`${styles.tab} ${
                            activeProjectTab === tab ? styles.tabActive : ""
                          }`}
                          type="button"
                          onClick={() =>
                            setActiveProjectTab(
                              tab as "overview" | "brand-dna" | "brief" | "activity",
                            )
                          }
                        >
                          {tab.replace("-", " ")}
                        </button>
                      ))}
                    </div>

                    {activeProjectTab === "overview" ? (
                      <div className={styles.colStack}>
                        <InfoRow label="Status" value={selectedProject.status} />
                        <InfoRow label="Value" value={selectedProject.value} />
                        <InfoRow label="Client" value={selectedProject.email} />
                        <InfoRow label="Progress" value={`${selectedProject.progress}%`} />
                      </div>
                    ) : null}

                    {activeProjectTab === "brand-dna" ? (
                      <div className={styles.colStack}>
                        <InfoRow label="Cluster" value="Bold Visionary" />
                        <InfoRow label="Archetype" value="The Pioneer" />
                        <InfoRow
                          label="Positioning"
                          value="A strategic operating system for studios that want clarity before design."
                        />
                        <InfoRow label="Tagline" value="Own the conversation." />
                      </div>
                    ) : null}

                    {activeProjectTab === "brief" ? (
                      <div className={styles.briefBox}>
                        Audience: premium-seeking urban professionals.
                        <br />
                        Message: this is not just branding, it is category position
                        made visible.
                      </div>
                    ) : null}

                    {activeProjectTab === "activity" ? (
                      <div className={styles.activityList}>
                        <ActivityItem
                          title="Discovery submitted and cluster identified"
                          time="Jun 2, 3:46 PM"
                        />
                        <ActivityItem
                          title="Advance payment requested"
                          time="Jun 2, 2:10 PM"
                        />
                        <ActivityItem
                          title="Portal link delivered to client"
                          time="Jun 1, 11:05 AM"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.sideStack}>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>Timeline</div>
                      <div className={styles.timelineItem}>Discovery completed</div>
                      <div className={styles.timelineItem}>Advance payment pending</div>
                      <div className={styles.timelineItem}>Concepts waiting</div>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.sectionTitle}>AI Add-on</div>
                      <div className={styles.sectionSub}>
                        Unlock all 9 AI modules for this project with a one-time add-on.
                      </div>
                      <button className={styles.primaryButton} type="button">
                        Unlock ₹250
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeScreen === "ai-suite" ? (
              <section className={styles.screen}>
                <div className={styles.card}>
                  <div className={styles.sectionHead}>
                    <div>
                      <div className={styles.eyebrow}>AI Suite</div>
                      <div className={styles.sectionTitle}>Studio intelligence modules</div>
                    </div>
                    <div className={styles.badgeMuted}>AI Co-Pilot active</div>
                  </div>

                  <div className={styles.aiGrid}>
                    {aiModules.map((module) => (
                      <button
                        key={module.key}
                        className={styles.aiCard}
                        type="button"
                        onClick={() => runAi(module.key)}
                      >
                        <div className={styles.aiCardHead}>
                          <div className={styles.aiIcon}>{module.icon}</div>
                          <span className={styles.aiTier}>{module.tier}</span>
                        </div>
                        <div className={styles.aiName}>{module.name}</div>
                        <div className={styles.aiDesc}>{module.description}</div>
                        <div className={styles.aiFoot}>
                          <span>{module.rate}</span>
                          <span className={styles.secondaryButton}>
                            {aiLoading === module.key ? "Running..." : "Run"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {aiResult ? (
                    <div className={styles.aiResult}>
                      <div className={styles.aiResultLabel}>AI Output</div>
                      <pre className={styles.aiResultText}>{aiResult}</pre>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeScreen === "analytics" ? (
              <section className={styles.screen}>
                <div className={styles.kpiGrid}>
                  <KpiCard label="Revenue this month" value="₹2.4L" delta="+11% vs May" />
                  <KpiCard label="Projects delivered" value="6" delta="On track" />
                  <KpiCard label="AI acceptance" value={`${acceptanceAverage}%`} delta="+12% vs Q1" />
                  <KpiCard label="Health score" value="7.4" delta="2 projects need follow-up" />
                </div>

                <div className={styles.analyticsGrid}>
                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Revenue trend</div>
                    <div className={styles.chartBars}>
                      {chartBars.map((item) => (
                        <div key={item.label} className={styles.chartCol}>
                          <div
                            className={styles.chartBar}
                            style={{ height: `${item.value}%` }}
                          />
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Project status split</div>
                    <div className={styles.donutLegend}>
                      <LegendRow label="Discovery" value="4" tone="amber" />
                      <LegendRow label="Advance Paid" value="3" tone="green" />
                      <LegendRow label="Concepts" value="2" tone="blue" />
                      <LegendRow label="Delivered" value="6" tone="green" />
                      <LegendRow label="Cancelled" value="1" tone="red" />
                    </div>
                  </div>

                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>AI module acceptance rates</div>
                    <div className={styles.acceptanceList}>
                      {acceptanceBars.map((item) => (
                        <div key={item.label} className={styles.acceptanceRow}>
                          <span>{item.label}</span>
                          <div className={styles.acceptanceTrack}>
                            <div
                              className={styles.acceptanceFill}
                              style={{ width: `${item.value}%` }}
                            />
                          </div>
                          <span>{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeScreen === "settings" ? (
              <section className={styles.screen}>
                <div className={styles.formGrid}>
                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Account details</div>
                    <div className={styles.fieldGrid}>
                      <Field label="Studio name" value={brandName} onChange={setBrandName} />
                      <Field
                        label="Email"
                        value="anoop@flumenx.com"
                        readOnly
                      />
                    </div>
                    <Field
                      label="Portal headline"
                      value={brandHeading}
                      onChange={setBrandHeading}
                    />
                  </div>

                  <div className={styles.card}>
                    <div className={styles.sectionTitle}>Brand styling</div>
                    <label className={styles.fieldLabel}>Accent color</label>
                    <input
                      className={styles.colorInput}
                      type="color"
                      value={brandColor}
                      onChange={(event) => setBrandColor(event.target.value)}
                    />
                    <div className={styles.previewCard}>
                      <div className={styles.previewBrand}>{brandName}</div>
                      <div className={styles.previewHeading}>{brandHeading}</div>
                      <div className={styles.previewOrb} style={{ background: brandColor }} />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>

      {portalOpen ? (
        <div className={styles.portalOverlay} onClick={() => setPortalOpen(false)}>
          <div
            className={styles.portal}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.portalHead}>
              <div>
                <div className={styles.eyebrow}>Client portal</div>
                <div className={styles.sectionTitle}>Discovery flow</div>
              </div>
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => setPortalOpen(false)}
              >
                ×
              </button>
            </div>

            {portalStep === 1 ? (
              <div className={styles.colStack}>
                <Field
                  label="Your email address"
                  value={portalEmail}
                  onChange={setPortalEmail}
                  placeholder="you@company.com"
                />
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => setPortalStep(2)}
                >
                  Continue
                </button>
              </div>
            ) : null}

            {portalStep === 2 ? (
              <div className={styles.colStack}>
                <div className={styles.sectionSub}>
                  Pick the direction that best fits your current ambition.
                </div>
                <div className={styles.choiceGrid}>
                  <ChoiceCard title="Bold & Graphic" text="High contrast, geometric, commanding" />
                  <ChoiceCard title="Clean & Minimal" text="Whitespace, typography-led, precise" />
                  <ChoiceCard title="Dark & Premium" text="Deep backgrounds with luxe accents" />
                </div>
                <div className={styles.inlineActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setPortalStep(1)}
                  >
                    Back
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => setPortalStep(3)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {portalStep === 3 ? (
              <div className={styles.colStack}>
                <div className={styles.sectionTitle}>Brand DNA preview</div>
                <div className={styles.briefBox}>
                  Cluster: Bold Visionary
                  <br />
                  Archetype: The Pioneer
                  <br />
                  Promise: We define what the category becomes.
                </div>
                <div className={styles.inlineActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setPortalStep(2)}
                  >
                    Back
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => {
                      setPortalOpen(false);
                      setPortalStep(1);
                      openScreen("project-detail");
                    }}
                  >
                    Submit discovery
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function NavButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
      type="button"
      onClick={onClick}
    >
      <span>{label}</span>
      {badge ? <span className={styles.navBadge}>{badge}</span> : null}
    </button>
  );
}

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiDelta}>{delta}</div>
    </div>
  );
}

function ActivityItem({ title, time }: { title: string; time: string }) {
  return (
    <div className={styles.activityItem}>
      <div className={styles.activityDot} />
      <div>
        <div className={styles.primaryText}>{title}</div>
        <div className={styles.secondaryText}>{time}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  textarea,
}: {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  textarea?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {textarea ? (
        <textarea
          className={styles.input}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
        />
      )}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LegendRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <div className={styles.legendRow}>
      <div className={styles.legendLabel}>
        <span className={`${styles.legendSwatch} ${statusClass(tone)}`} />
        <span>{label}</span>
      </div>
      <span>{value}</span>
    </div>
  );
}

function ChoiceCard({ title, text }: { title: string; text: string }) {
  return (
    <button className={styles.choiceCard} type="button">
      <div className={styles.primaryText}>{title}</div>
      <div className={styles.secondaryText}>{text}</div>
    </button>
  );
}
