"use client";

import { useMemo, useState } from "react";

const timeframeOptions = ["Last 7 days", "Last 30 days", "This quarter"];

const analyticsByRange = {
  "Last 7 days": {
    summary: "Performance is steady this week with stronger AI acceptance and lower revision risk.",
    metrics: [
      { label: "Total revenue", value: "Rs2.1L", delta: "8% WoW", tone: "up" },
      { label: "Projects completed", value: "7", delta: "2 this week", tone: "up" },
      { label: "AI acceptance rate", value: "71%", delta: "5% vs last week", tone: "up" },
      { label: "Avg project value", value: "Rs58K", delta: "Rs4K WoW", tone: "up" },
    ],
    trend: [
      { label: "Mon", value: 28, amount: "Rs1.3L" },
      { label: "Tue", value: 56, amount: "Rs1.7L" },
      { label: "Wed", value: 41, amount: "Rs1.5L" },
      { label: "Thu", value: 80, amount: "Rs2.0L" },
      { label: "Fri", value: 68, amount: "Rs1.9L" },
      { label: "Sat", value: 35, amount: "Rs1.4L" },
      { label: "Sun", value: 62, amount: "Rs1.8L" },
    ],
    modules: [
      { name: "Copilot", value: "74%", width: 74, runs: 34 },
      { name: "Enhance", value: "69%", width: 69, runs: 20 },
      { name: "Voice", value: "71%", width: 71, runs: 14 },
      { name: "Moodboard", value: "82%", width: 82, runs: 18 },
      { name: "Concepts", value: "65%", width: 65, runs: 11 },
      { name: "Brief", value: "73%", width: 73, runs: 16 },
      { name: "Proposal", value: "59%", width: 59, runs: 9 },
    ],
    status: [
      { label: "Discovery", value: 22, color: "#f5bc2d", count: 4 },
      { label: "Advance Paid", value: 24, color: "#48f39b", count: 5 },
      { label: "Concepts", value: 16, color: "#4f95f1", count: 3 },
      { label: "Delivered", value: 32, color: "#10cb79", count: 6 },
      { label: "Cancelled", value: 6, color: "#ff6a73", count: 1 },
    ],
  },
  "Last 30 days": {
    summary: "Monthly analytics show strong conversion from discovery to downstream AI-assisted deliverables.",
    metrics: [
      { label: "Total revenue", value: "Rs8.4L", delta: "24% YoY", tone: "up" },
      { label: "Projects completed", value: "34", delta: "8 this quarter", tone: "up" },
      { label: "AI acceptance rate", value: "68%", delta: "12% vs Q1", tone: "up" },
      { label: "Avg project value", value: "Rs62K", delta: "Rs8K vs last year", tone: "up" },
    ],
    trend: [
      { label: "Jan", value: 18, amount: "Rs1.2L" },
      { label: "Feb", value: 65, amount: "Rs1.85L" },
      { label: "Mar", value: 38, amount: "Rs1.4L" },
      { label: "Apr", value: 92, amount: "Rs2.2L" },
      { label: "May", value: 72, amount: "Rs1.9L" },
      { label: "Jun", value: 100, amount: "Rs2.4L" },
    ],
    modules: [
      { name: "Copilot", value: "70%", width: 70, runs: 92 },
      { name: "Enhance", value: "66%", width: 66, runs: 44 },
      { name: "Voice", value: "73%", width: 73, runs: 29 },
      { name: "Moodboard", value: "80%", width: 80, runs: 37 },
      { name: "Concepts", value: "62%", width: 62, runs: 21 },
      { name: "Brief", value: "68%", width: 68, runs: 32 },
      { name: "Proposal", value: "56%", width: 56, runs: 18 },
    ],
    status: [
      { label: "Discovery", value: 25, color: "#f5bc2d", count: 8 },
      { label: "Advance Paid", value: 20, color: "#48f39b", count: 6 },
      { label: "Concepts", value: 12, color: "#4f95f1", count: 4 },
      { label: "Delivered", value: 38, color: "#10cb79", count: 12 },
      { label: "Cancelled", value: 5, color: "#ff6a73", count: 2 },
    ],
  },
  "This quarter": {
    summary: "Quarterly performance shows stable revenue growth with AI adoption now embedded in the workflow.",
    metrics: [
      { label: "Total revenue", value: "Rs21.7L", delta: "31% YoY", tone: "up" },
      { label: "Projects completed", value: "91", delta: "21 this quarter", tone: "up" },
      { label: "AI acceptance rate", value: "72%", delta: "15% vs Q1", tone: "up" },
      { label: "Avg project value", value: "Rs66K", delta: "Rs10K vs last year", tone: "up" },
    ],
    trend: [
      { label: "Q1", value: 40, amount: "Rs5.8L" },
      { label: "Q2", value: 57, amount: "Rs7.6L" },
      { label: "Q3", value: 74, amount: "Rs9.1L" },
      { label: "Q4", value: 94, amount: "Rs10.8L" },
    ],
    modules: [
      { name: "Copilot", value: "78%", width: 78, runs: 230 },
      { name: "Enhance", value: "71%", width: 71, runs: 116 },
      { name: "Voice", value: "76%", width: 76, runs: 77 },
      { name: "Moodboard", value: "84%", width: 84, runs: 93 },
      { name: "Concepts", value: "67%", width: 67, runs: 58 },
      { name: "Brief", value: "74%", width: 74, runs: 82 },
      { name: "Proposal", value: "61%", width: 61, runs: 49 },
    ],
    status: [
      { label: "Discovery", value: 21, color: "#f5bc2d", count: 17 },
      { label: "Advance Paid", value: 23, color: "#48f39b", count: 18 },
      { label: "Concepts", value: 14, color: "#4f95f1", count: 11 },
      { label: "Delivered", value: 36, color: "#10cb79", count: 29 },
      { label: "Cancelled", value: 6, color: "#ff6a73", count: 5 },
    ],
  },
};

const sectorRows = [
  { label: "Consumer Goods", value: 8, width: 68 },
  { label: "Technology & SaaS", value: 6, width: 50 },
  { label: "Health & Wellness", value: 5, width: 42 },
  { label: "Food & Beverage", value: 4, width: 33 },
  { label: "Fashion & Lifestyle", value: 3, width: 26 },
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
    let current = 0;
    return `conic-gradient(${statusSegments
      .map((item) => {
        const start = current;
        current += item.value;
        return `${item.color} ${start}% ${current}%`;
      })
      .join(", ")})`;
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
                <div className={`analytics-metric-delta ${item.tone}`.trim()}>&uarr; {item.delta}</div>
              </section>
            ))}
          </div>

          <div className="analytics-main-grid">
            <section className="analytics-card analytics-chart-card">
              <div className="analytics-card-head">
                <h2>Revenue - last 6 months</h2>
                <span>{selectedTrendPoint.amount}</span>
              </div>
              <div className="analytics-line-chart">
                <div className="analytics-line-yaxis">
                  <span>Rs2.4L</span>
                  <span>Rs2.2L</span>
                  <span>Rs2.0L</span>
                  <span>Rs1.8L</span>
                  <span>Rs1.6L</span>
                  <span>Rs1.4L</span>
                  <span>Rs1.2L</span>
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
                <span>{(hoveredStatus || selectedStatus).count} projects</span>
              </div>
              <div className="analytics-status-layout">
                <div
                  className="analytics-donut-wrap"
                  onMouseLeave={() => setHoveredStatusLabel(null)}
                >
                  <div className="analytics-donut-chart" style={{ background: donutGradient }}>
                    <div className="analytics-donut-hole">
                      <strong>{(hoveredStatus || selectedStatus).value}%</strong>
                      <span>{(hoveredStatus || selectedStatus).label}</span>
                    </div>
                  </div>
                  {hoveredStatus ? (
                    <div className="analytics-status-tooltip">
                      <strong>{hoveredStatus.label}</strong>
                      <span>{hoveredStatus.count} projects</span>
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
                      <span>{hoveredModule.value} acceptance</span>
                      <span>{hoveredModule.runs} runs</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="analytics-module-summary">
                <strong>{selectedModule.name}</strong>
                <span>{selectedModule.value} acceptance</span>
                <span>{selectedModule.runs} runs in {selectedRange.toLowerCase()}</span>
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
