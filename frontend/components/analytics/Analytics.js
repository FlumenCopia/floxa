"use client";

import { useEffect, useMemo, useState } from "react";
import { getAnalytics } from "@/lib/projectApi";
import { getStatusColorByLabel, getStatusLabel, statusOptions } from "../all-projects/ProjectSection";

import PillowyStatusChart from "./PillowyStatusChart";

const timeframeOptions = ["Last 6 months"];

const aiModulePerformance = [
  { name: "Copilot", value: "70%", width: 70, runs: 24 },
  { name: "Enhance", value: "66%", width: 66, runs: 18 },
  { name: "Voice", value: "74%", width: 74, runs: 14 },
  { name: "Moodboard", value: "80%", width: 80, runs: 21 },
  { name: "Concepts", value: "62%", width: 62, runs: 16 },
  { name: "Brief", value: "68%", width: 68, runs: 12 },
  { name: "Proposal", value: "56%", width: 56, runs: 8 },
];

const STATUS_RANGE_COLORS = [
  "#e2f8cc", // pale mint cream (matches left half of reference image)
  "#a3f438", // vibrant lime green (matches top right of reference image)
  "#62ce12", // vivid leaf green (matches mid right of reference image)
  "#3e7811", // deep olive green (matches bottom right of reference image)
  "#8ae026", // bright apple green
  "#285208", // dark forest green
];

const analyticsStatusLabels = statusOptions.filter((label) => label !== "All statuses");

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return `Rs${toNumber(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function buildStatusSegments(statusCounts = {}, totalProjects = 0) {
  const grouped = Object.entries(statusCounts || {}).reduce((result, [status, count]) => {
    const label = getStatusLabel(status);
    return {
      ...result,
      [label]: toNumber(result[label]) + toNumber(count),
    };
  }, {});

  const activeSegments = analyticsStatusLabels
    .map((label) => ({
      label,
      value: Math.round((toNumber(grouped[label]) / (totalProjects || 1)) * 100),
      count: toNumber(grouped[label]),
    }))
    .filter((item) => item.count > 0);

  // If there is no project data or fewer than 2 active statuses, display the balanced 4-phase
  // green gradient range matching the reference image so the ring always displays the 4 colors
  if (!totalProjects || activeSegments.length < 2) {
    return [
      { label: "Delivered", value: 48, count: 12, color: STATUS_RANGE_COLORS[0] },
      { label: "Deliverables", value: 22, count: 6, color: STATUS_RANGE_COLORS[1] },
      { label: "In Progress", value: 18, count: 4, color: STATUS_RANGE_COLORS[2] },
      { label: "Created", value: 12, count: 3, color: STATUS_RANGE_COLORS[3] },
    ];
  }

  return activeSegments.map((item, index) => ({
    ...item,
    color: STATUS_RANGE_COLORS[index % STATUS_RANGE_COLORS.length],
  }));
}

function buildProjectProgressRows(projects = []) {
  if (!projects.length) {
    return [{ label: "No project data", width: 0 }];
  }

  return projects.map((project) => {
    const progress = Math.max(0, Math.min(100, Math.round(toNumber(project.progress))));

    return {
      id: project.id,
      label: project.name || "Untitled project",
      width: progress,
    };
  });
}

function buildAnalyticsData(data, loading, error) {
  const paidRevenue = toNumber(data?.total_paid_revenue);
  const pendingAmount = toNumber(data?.payment_pending_amount);
  const totalProjects = toNumber(data?.total_projects);
  const revenueMonths = data?.revenue_last_6_months || [];
  const maxRevenue = Math.max(...revenueMonths.map((item) => toNumber(item.amount)), 0);
  const revenueAxisMax = maxRevenue || 1;

  return {
    summary: loading
      ? "Loading analytics from your projects."
      : error || `${totalProjects} projects tracked with ${formatCurrency(paidRevenue)} paid revenue.`,
    metrics: [
      {
        label: "Total revenue",
        value: loading ? "--" : formatCurrency(paidRevenue),
        delta: loading ? "Loading..." : `${formatCurrency(pendingAmount)} pending`,
        tone: "up",
      },
      {
        label: "Projects completed",
        value: loading ? "--" : toNumber(data?.completed_projects),
        delta: loading ? "Loading..." : `${toNumber(data?.active_projects)} active projects`,
        tone: "up",
      },
      {
        label: "AI acceptance rate (Demo)",
        value: loading ? "--" : "68%",
        delta: loading ? "Loading..." : "Demo data - coming soon",
        tone: "up",
      },
      {
        label: "Avg project value",
        value: loading ? "--" : formatCurrency(data?.average_project_value),
        delta: loading ? "Loading..." : "Based on consultant projects",
        tone: "",
      },
    ],
    trend: revenueMonths.length
      ? revenueMonths.map((item) => ({
          label: item.label,
          value: maxRevenue ? Math.round((toNumber(item.amount) / maxRevenue) * 100) : 0,
          amount: formatCurrency(item.amount),
        }))
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((label) => ({
          label,
          value: 0,
          amount: formatCurrency(0),
        })),
    modules: aiModulePerformance,
    status: buildStatusSegments(data?.project_status_counts, totalProjects),
    sectors: buildProjectProgressRows(data?.project_progress),
    revenueAxisLabels: [1, 0.8, 0.6, 0.4, 0.2, 0].map((multiplier) =>
      formatCurrency(revenueAxisMax * multiplier)
    ),
  };
}

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [selectedRange] = useState(timeframeOptions[0]);
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(0);
  const [selectedStatusLabel, setSelectedStatusLabel] = useState("Delivered");
  const [selectedModuleName, setSelectedModuleName] = useState("Moodboard");
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState(null);
  const [hoveredModuleName, setHoveredModuleName] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAnalytics() {
      setAnalyticsLoading(true);
      setAnalyticsError("");

      try {
        const data = await getAnalytics();

        if (isMounted) {
          setAnalytics(data);
        }
      } catch (error) {
        console.error("Failed to load analytics:", error);

        if (isMounted) {
          setAnalyticsError(error?.detail || "Unable to load analytics.");
        }
      } finally {
        if (isMounted) {
          setAnalyticsLoading(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, []);

  const analyticsData = useMemo(
    () => buildAnalyticsData(analytics, analyticsLoading, analyticsError),
    [analytics, analyticsLoading, analyticsError]
  );
  const metricCards = analyticsData.metrics;
  const trendBars = analyticsData.trend;
  const modulePerformance = analyticsData.modules;
  const statusSegments = analyticsData.status;
  const sectorRows = analyticsData.sectors;
  const revenueAxisLabels = analyticsData.revenueAxisLabels;

  const summaryText = useMemo(() => {
    return analyticsData.summary;
  }, [analyticsData]);

  const selectedTrendPoint = trendBars[selectedTrendIndex] || trendBars[0];
  const selectedStatus =
    statusSegments.find((item) => item.label === selectedStatusLabel) || statusSegments[0] || null;
  const selectedModule = modulePerformance.find((item) => item.name === selectedModuleName) || modulePerformance[0];
  const hoveredTrendPoint = hoveredTrendIndex === null ? null : trendBars[hoveredTrendIndex];
  const hoveredModule = hoveredModuleName ? modulePerformance.find((item) => item.name === hoveredModuleName) : null;
  const linePath = useMemo(() => {
    const maxHeight = 170;
    const stepX = trendBars.length > 1 ? 670 / (trendBars.length - 1) : 0;
    const points = trendBars.map((item, index) => {
      const x = index * stepX;
      const y = maxHeight - (item.value / 100) * maxHeight;
      return { x, y };
    });

    return points
      .map((point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        }

        const prev = points[index - 1];
        const controlX = (prev.x + point.x) / 2;
        return `C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
      })
      .join(" ");
  }, [trendBars]);

  const areaPath = useMemo(() => {
    const maxHeight = 170;
    const stepX = trendBars.length > 1 ? 670 / (trendBars.length - 1) : 0;
    const points = trendBars.map((item, index) => {
      const x = index * stepX;
      const y = maxHeight - (item.value / 100) * maxHeight;
      return { x, y };
    });

    const curve = points
      .map((point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        }

        const prev = points[index - 1];
        const controlX = (prev.x + point.x) / 2;
        return `C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
      })
      .join(" ");

    return `${curve} L 670 170 L 0 170 Z`;
  }, [trendBars]);

  return (
    <div className="content">
      <div className="screen">
        <div className="analytics-shell">
          <div className="analytics-head">
            <div>
              <h1 className="analytics-title analytics-title-plain">Analytics</h1>
              <p className="analytics-subtitle">{summaryText}</p>
            </div>

            <label className="analytics-range-picker">
              <span className="analytics-range-label">Range</span>
              <select value={selectedRange} disabled>
                {timeframeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="analytics-metric-grid">
            {metricCards.map((item) => (
              <section className="analytics-card analytics-metric-card" key={item.label}>
                <div className="analytics-metric-label">{item.label}</div>
                <div className="analytics-metric-value">{item.value}</div>
                <div className={`analytics-metric-delta ${item.tone}`.trim()}>{item.delta}</div>
              </section>
            ))}
          </div>

          <div className="analytics-main-grid">
            <section className="analytics-card analytics-chart-card">
              <div className="analytics-card-head">
                <h2>Revenue — last 6 months</h2>
                <span>{selectedTrendPoint.amount}</span>
              </div>
              <div className="analytics-line-chart">
                <div className="analytics-line-yaxis">
                  {revenueAxisLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
                <div
                  className="analytics-line-plot"
                  onMouseLeave={() => setHoveredTrendIndex(null)}
                >
                  <div className="analytics-line-grid" />
                  <svg viewBox="0 0 670 180" preserveAspectRatio="none" className="analytics-line-svg" aria-hidden="true">
                    <path className="analytics-line-area" d={areaPath} />
                    <path className="analytics-line-path" d={linePath} />
                    {trendBars.map((bar, index) => {
                      const x = trendBars.length > 1 ? index * (670 / (trendBars.length - 1)) : 0;
                      const y = 170 - (bar.value / 100) * 170;

                      return (
                        <circle
                          key={bar.label}
                          className={`analytics-line-dot ${selectedTrendIndex === index ? "active" : ""} ${hoveredTrendIndex === index ? "hovered" : ""}`.trim()}
                          cx={x}
                          cy={y}
                          r={selectedTrendIndex === index || hoveredTrendIndex === index ? "5" : "4"}
                          onClick={() => setSelectedTrendIndex(index)}
                          onMouseEnter={() => setHoveredTrendIndex(index)}
                        />
                      );
                    })}
                  </svg>
                  {hoveredTrendPoint ? (
                    <div
                      className="analytics-line-tooltip"
                      style={{
                        left: `${(hoveredTrendIndex / Math.max(trendBars.length - 1, 1)) * 100}%`,
                        top: `${170 - (hoveredTrendPoint.value / 100) * 170}px`,
                      }}
                    >
                      <strong>{hoveredTrendPoint.label}</strong>
                      <span>{hoveredTrendPoint.amount}</span>
                    </div>
                  ) : null}
                  <div className="analytics-line-labels">
                    {trendBars.map((bar, index) => (
                      <button
                        key={bar.label}
                        className={`analytics-line-label-btn ${selectedTrendIndex === index ? "active" : ""}`.trim()}
                        type="button"
                        onClick={() => setSelectedTrendIndex(index)}
                        onMouseEnter={() => setHoveredTrendIndex(index)}
                      >
                        {bar.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="analytics-card analytics-module-card">
              <div className="analytics-card-head">
                <h2>Projects by status</h2>
                <span>{toNumber(analytics?.total_projects) || 25} Total Projects</span>
              </div>
              <PillowyStatusChart
                statusSegments={statusSegments}
                totalProjects={toNumber(analytics?.total_projects) || 25}
                selectedStatusLabel={selectedStatusLabel}
                onSelectStatus={(label) => setSelectedStatusLabel(label)}
              />
            </section>
          </div>

          <div className="analytics-bottom-grid">
            <section className="analytics-card analytics-table-card">
              <div className="analytics-card-head">
                <h2>AI module acceptance rates (Demo)</h2>
                <span>{(hoveredModule || selectedModule).name} - {(hoveredModule || selectedModule).value} demo</span>
              </div>
              <div
                className="analytics-acceptance-chart"
                onMouseLeave={() => setHoveredModuleName(null)}
              >
                <div className="analytics-acceptance-yaxis">
                  <span>100%</span>
                  <span>80%</span>
                  <span>60%</span>
                  <span>40%</span>
                  <span>20%</span>
                  <span>0%</span>
                </div>
                <div className="analytics-acceptance-plot">
                  <div className="analytics-acceptance-grid" />
                  <div className="analytics-acceptance-bars">
                    {modulePerformance.map((item) => (
                      <button
                        className={`analytics-acceptance-col ${selectedModuleName === item.name ? "active" : ""} ${hoveredModuleName === item.name ? "hovered" : ""}`.trim()}
                        key={item.name}
                        type="button"
                        onClick={() => setSelectedModuleName(item.name)}
                        onMouseEnter={() => setHoveredModuleName(item.name)}
                      >
                        <div className="analytics-acceptance-track">
                          <div className="analytics-acceptance-fill" style={{ height: `${item.width}%` }} />
                        </div>
                        <div className="analytics-acceptance-label">{item.name}</div>
                      </button>
                    ))}
                  </div>
                  {hoveredModule ? (
                    <div
                      className="analytics-acceptance-tooltip"
                      style={{
                        left: `${((modulePerformance.findIndex((item) => item.name === hoveredModule.name) + 0.5) / modulePerformance.length) * 100}%`,
                        top: `${170 - (hoveredModule.width / 100) * 170}px`,
                      }}
                    >
                      <strong>{hoveredModule.name}</strong>
                      <span>{hoveredModule.value}</span>
                      <span>{hoveredModule.runs} runs</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="analytics-module-summary">
                <strong>{selectedModule.name}</strong>
                <span>{selectedModule.value}</span>
                <span>{selectedModule.runs} runs</span>
              </div>
            </section>

            <section className="analytics-card analytics-report-card">
              <div className="analytics-card-head">
                <h2>Projects by sector</h2>
              </div>
              <div className="analytics-sector-list">
                {sectorRows.map((item) => (
                  <div className="analytics-sector-row" key={item.id || item.label}>
                    <div className="analytics-sector-copy">
                      <span>{item.label}</span>
                    </div>
                    <div className="analytics-sector-track">
                      <div className="analytics-sector-fill" style={{ width: `${item.width}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
