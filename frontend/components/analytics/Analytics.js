"use client";

import { useMemo, useState } from "react";

const timeframeOptions = ["Last 7 days", "Last 30 days", "This quarter"];

const analyticsByRange = {
  "Last 7 days": {
    summary: "Analytics data unavailable.",
    metrics: [
      { label: "Total revenue", value: "Unavailable", delta: "Revenue data unavailable", tone: "" },
      { label: "Projects completed", value: "Unavailable", delta: "Project completion data unavailable", tone: "" },
      { label: "AI acceptance rate", value: "Unavailable", delta: "AI usage data unavailable", tone: "" },
      { label: "Avg project value", value: "Unavailable", delta: "Project value data unavailable", tone: "" },
    ],
    trend: [
      { label: "Mon", value: 0, amount: "Unavailable" },
      { label: "Tue", value: 0, amount: "Unavailable" },
      { label: "Wed", value: 0, amount: "Unavailable" },
      { label: "Thu", value: 0, amount: "Unavailable" },
      { label: "Fri", value: 0, amount: "Unavailable" },
      { label: "Sat", value: 0, amount: "Unavailable" },
      { label: "Sun", value: 0, amount: "Unavailable" },
    ],
    modules: [
      { name: "Copilot", value: "Unavailable", width: 0, runs: 0 },
      { name: "Enhance", value: "Unavailable", width: 0, runs: 0 },
      { name: "Voice", value: "Unavailable", width: 0, runs: 0 },
      { name: "Moodboard", value: "Unavailable", width: 0, runs: 0 },
      { name: "Concepts", value: "Unavailable", width: 0, runs: 0 },
      { name: "Brief", value: "Unavailable", width: 0, runs: 0 },
      { name: "Proposal", value: "Unavailable", width: 0, runs: 0 },
    ],
    status: [
      { label: "Discovery", value: 0, color: "#f5bc2d", count: 0 },
      { label: "Advance Paid", value: 0, color: "#48f39b", count: 0 },
      { label: "Concepts", value: 0, color: "#4f95f1", count: 0 },
      { label: "Delivered", value: 0, color: "#10cb79", count: 0 },
      { label: "Cancelled", value: 0, color: "#ff6a73", count: 0 },
    ],
  },
  "Last 30 days": {
    summary: "Analytics data unavailable.",
    metrics: [
      { label: "Total revenue", value: "Unavailable", delta: "Revenue data unavailable", tone: "" },
      { label: "Projects completed", value: "Unavailable", delta: "Project completion data unavailable", tone: "" },
      { label: "AI acceptance rate", value: "Unavailable", delta: "AI usage data unavailable", tone: "" },
      { label: "Avg project value", value: "Unavailable", delta: "Project value data unavailable", tone: "" },
    ],
    trend: [
      { label: "Jan", value: 0, amount: "Unavailable" },
      { label: "Feb", value: 0, amount: "Unavailable" },
      { label: "Mar", value: 0, amount: "Unavailable" },
      { label: "Apr", value: 0, amount: "Unavailable" },
      { label: "May", value: 0, amount: "Unavailable" },
      { label: "Jun", value: 0, amount: "Unavailable" },
    ],
    modules: [
      { name: "Copilot", value: "Unavailable", width: 0, runs: 0 },
      { name: "Enhance", value: "Unavailable", width: 0, runs: 0 },
      { name: "Voice", value: "Unavailable", width: 0, runs: 0 },
      { name: "Moodboard", value: "Unavailable", width: 0, runs: 0 },
      { name: "Concepts", value: "Unavailable", width: 0, runs: 0 },
      { name: "Brief", value: "Unavailable", width: 0, runs: 0 },
      { name: "Proposal", value: "Unavailable", width: 0, runs: 0 },
    ],
    status: [
      { label: "Discovery", value: 0, color: "#f5bc2d", count: 0 },
      { label: "Advance Paid", value: 0, color: "#48f39b", count: 0 },
      { label: "Concepts", value: 0, color: "#4f95f1", count: 0 },
      { label: "Delivered", value: 0, color: "#10cb79", count: 0 },
      { label: "Cancelled", value: 0, color: "#ff6a73", count: 0 },
    ],
  },
  "This quarter": {
    summary: "Analytics data unavailable.",
    metrics: [
      { label: "Total revenue", value: "Unavailable", delta: "Revenue data unavailable", tone: "" },
      { label: "Projects completed", value: "Unavailable", delta: "Project completion data unavailable", tone: "" },
      { label: "AI acceptance rate", value: "Unavailable", delta: "AI usage data unavailable", tone: "" },
      { label: "Avg project value", value: "Unavailable", delta: "Project value data unavailable", tone: "" },
    ],
    trend: [
      { label: "Q1", value: 0, amount: "Unavailable" },
      { label: "Q2", value: 0, amount: "Unavailable" },
      { label: "Q3", value: 0, amount: "Unavailable" },
      { label: "Q4", value: 0, amount: "Unavailable" },
    ],
    modules: [
      { name: "Copilot", value: "Unavailable", width: 0, runs: 0 },
      { name: "Enhance", value: "Unavailable", width: 0, runs: 0 },
      { name: "Voice", value: "Unavailable", width: 0, runs: 0 },
      { name: "Moodboard", value: "Unavailable", width: 0, runs: 0 },
      { name: "Concepts", value: "Unavailable", width: 0, runs: 0 },
      { name: "Brief", value: "Unavailable", width: 0, runs: 0 },
      { name: "Proposal", value: "Unavailable", width: 0, runs: 0 },
    ],
    status: [
      { label: "Discovery", value: 0, color: "#f5bc2d", count: 0 },
      { label: "Advance Paid", value: 0, color: "#48f39b", count: 0 },
      { label: "Concepts", value: 0, color: "#4f95f1", count: 0 },
      { label: "Delivered", value: 0, color: "#10cb79", count: 0 },
      { label: "Cancelled", value: 0, color: "#ff6a73", count: 0 },
    ],
  },
};

const sectorRows = [
  { label: "No sector data", value: 0, width: 0 },
];

export default function Analytics() {
  const [selectedRange, setSelectedRange] = useState(timeframeOptions[1]);
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(0);
  const [selectedStatusLabel, setSelectedStatusLabel] = useState("Delivered");
  const [selectedModuleName, setSelectedModuleName] = useState("Moodboard");
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState(null);
  const [hoveredStatusLabel, setHoveredStatusLabel] = useState(null);
  const [hoveredModuleName, setHoveredModuleName] = useState(null);

  const analyticsData = analyticsByRange[selectedRange];
  const metricCards = analyticsData.metrics;
  const trendBars = analyticsData.trend;
  const modulePerformance = analyticsData.modules;
  const statusSegments = analyticsData.status;

  const summaryText = useMemo(() => {
    return analyticsData.summary;
  }, [analyticsData]);

  const selectedTrendPoint = trendBars[selectedTrendIndex] || trendBars[0];
  const selectedStatus = statusSegments.find((item) => item.label === selectedStatusLabel) || statusSegments[0];
  const selectedModule = modulePerformance.find((item) => item.name === selectedModuleName) || modulePerformance[0];
    const hoveredTrendPoint = hoveredTrendIndex === null ? null : trendBars[hoveredTrendIndex];
    const hoveredStatus = hoveredStatusLabel ? statusSegments.find((item) => item.label === hoveredStatusLabel) : null;
    const hoveredModule = hoveredModuleName ? modulePerformance.find((item) => item.name === hoveredModuleName) : null;
    const activeStatus = hoveredStatus || selectedStatus;

    const getStatusFromPointer = (event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const outerRadius = bounds.width / 2;
      const innerRadius = outerRadius * 0.51;

      if (radius < innerRadius || radius > outerRadius) {
        return null;
      }

      const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
      const normalized = (degrees + 450) % 360;
      const percent = (normalized / 360) * 100;

      let current = 0;
      for (const item of statusSegments) {
        current += item.value;
        if (percent <= current) {
          return item;
        }
      }

      return statusSegments[statusSegments.length - 1] || null;
    };

    const activeStatusTooltipStyle = useMemo(() => {
      if (!activeStatus) {
        return undefined;
      }

      let current = 0;
      let start = 0;
      let end = 0;

      for (const item of statusSegments) {
        start = current;
        current += item.value;
        end = current;

        if (item.label === activeStatus.label) {
          break;
        }
      }

      const midAngle = (((start + end) / 2) / 100) * 360;
      const radians = ((midAngle - 90) * Math.PI) / 180;
      const distance = 50;

      return {
        left: `${50 + Math.cos(radians) * distance}%`,
        top: `${50 + Math.sin(radians) * distance}%`,
      };
    }, [activeStatus, statusSegments]);

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

  const donutGradient = useMemo(() => {
    const segments = statusSegments.reduce(
      (result, item) => {
        const start = result.current;
        const end = result.current + item.value;

        return {
          current: end,
          parts: [...result.parts, `${item.color} ${start}% ${end}%`],
        };
      },
      { current: 0, parts: [] }
    );

    return `conic-gradient(${segments.parts.join(", ")})`;
  }, [statusSegments]);

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
              <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>
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
                <h2>Revenue</h2>
                <span>{selectedTrendPoint.amount}</span>
              </div>
              <div className="analytics-line-chart">
                <div className="analytics-line-yaxis">
                  <span>Unavailable</span>
                  <span>Unavailable</span>
                  <span>Unavailable</span>
                  <span>Unavailable</span>
                  <span>Unavailable</span>
                  <span>Unavailable</span>
                  <span>Unavailable</span>
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
                  <span>{activeStatus.value}% share</span>
                </div>
                <div className="analytics-status-layout">
                  <div
                    className="analytics-donut-wrap"
                    onMouseLeave={() => setHoveredStatusLabel(null)}
                  >
                    <button
                      className="analytics-donut-chart"
                      type="button"
                      style={{ background: donutGradient }}
                      onMouseMove={(event) => {
                        const hoveredItem = getStatusFromPointer(event);
                        setHoveredStatusLabel(hoveredItem ? hoveredItem.label : null);
                      }}
                      onClick={(event) => {
                        const clickedItem = getStatusFromPointer(event);
                        if (clickedItem) {
                          setSelectedStatusLabel(clickedItem.label);
                        }
                      }}
                    >
                      <div className="analytics-donut-hole">
                        <strong>{activeStatus.value}%</strong>
                        <span>{activeStatus.label}</span>
                      </div>
                    </button>
                    {activeStatus ? (
                      <div className="analytics-status-tooltip" style={activeStatusTooltipStyle}>
                        <div className="analytics-status-tooltip-chip">
                          <span
                            className="analytics-status-tooltip-swatch"
                            style={{ background: activeStatus.color }}
                          />
                          <strong>{activeStatus.label}</strong>
                        </div>
                        <span>{activeStatus.value}%</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="analytics-status-legend">
                  {statusSegments.map((item) => (
                    <button
                      className={`analytics-legend-row ${selectedStatusLabel === item.label ? "active" : ""} ${hoveredStatusLabel === item.label ? "hovered" : ""}`.trim()}
                        key={item.label}
                        type="button"
                        onClick={() => setSelectedStatusLabel(item.label)}
                        onMouseEnter={() => setHoveredStatusLabel(item.label)}
                        onMouseLeave={() => setHoveredStatusLabel(null)}
                      >
                        <span className="analytics-legend-swatch" style={{ background: item.color }} />
                        <span>{item.label}</span>
                      </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="analytics-bottom-grid">
            <section className="analytics-card analytics-table-card">
              <div className="analytics-card-head">
                <h2>AI module acceptance rates</h2>
                <span>{(hoveredModule || selectedModule).name} - {(hoveredModule || selectedModule).value}</span>
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
                  <div className="analytics-sector-row" key={item.label}>
                    <div className="analytics-sector-copy">
                      <span>{item.label}</span>
                      <strong>{item.value} projects</strong>
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
