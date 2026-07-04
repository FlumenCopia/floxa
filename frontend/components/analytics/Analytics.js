"use client";

import { useMemo, useState } from "react";

const timeframeOptions = ["Last 7 days", "Last 30 days", "This quarter"];

const metricCards = [
  { label: "Total revenue", value: "Rs8.4L", delta: "24% YoY", tone: "up" },
  { label: "Projects completed", value: "34", delta: "8 this quarter", tone: "up" },
  { label: "AI acceptance rate", value: "68%", delta: "12% vs Q1", tone: "up" },
  { label: "Avg project value", value: "Rs62K", delta: "Rs8K vs last year", tone: "up" },
];

const trendBars = [
  { label: "Jan", value: 18 },
  { label: "Feb", value: 65 },
  { label: "Mar", value: 38 },
  { label: "Apr", value: 92 },
  { label: "May", value: 72 },
  { label: "Jun", value: 100 },
];

const modulePerformance = [
  { name: "Copilot", value: "70%", width: 70 },
  { name: "Enhance", value: "66%", width: 66 },
  { name: "Voice", value: "73%", width: 73 },
  { name: "Moodboard", value: "80%", width: 80 },
  { name: "Concepts", value: "62%", width: 62 },
  { name: "Brief", value: "68%", width: 68 },
  { name: "Proposal", value: "56%", width: 56 },
];

const statusSegments = [
  { label: "Discovery", value: 25, color: "#f5bc2d" },
  { label: "Advance Paid", value: 20, color: "#48f39b" },
  { label: "Concepts", value: 12, color: "#4f95f1" },
  { label: "Delivered", value: 38, color: "#10cb79" },
  { label: "Cancelled", value: 5, color: "#ff6a73" },
];

const sectorRows = [
  { label: "Consumer Goods", value: 8, width: 68 },
  { label: "Technology & SaaS", value: 6, width: 50 },
  { label: "Health & Wellness", value: 5, width: 42 },
  { label: "Food & Beverage", value: 4, width: 33 },
  { label: "Fashion & Lifestyle", value: 3, width: 26 },
];

export default function Analytics() {
  const [selectedRange, setSelectedRange] = useState(timeframeOptions[1]);

  const summaryText = useMemo(() => {
    if (selectedRange === "Last 7 days") {
      return "Performance is steady this week with stronger AI acceptance and lower revision risk.";
    }

    if (selectedRange === "This quarter") {
      return "Quarterly performance shows stable revenue growth with AI adoption now embedded in the workflow.";
    }

    return "Monthly analytics show strong conversion from discovery to downstream AI-assisted deliverables.";
  }, [selectedRange]);

  const linePath = useMemo(() => {
    const maxHeight = 170;
    const stepX = 134;
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
  }, []);

  const donutGradient = useMemo(() => {
    let current = 0;
    return `conic-gradient(${statusSegments
      .map((item) => {
        const start = current;
        current += item.value;
        return `${item.color} ${start}% ${current}%`;
      })
      .join(", ")})`;
  }, []);

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
                <div className="analytics-line-plot">
                  <div className="analytics-line-grid" />
                  <svg viewBox="0 0 670 180" preserveAspectRatio="none" className="analytics-line-svg" aria-hidden="true">
                    <path className="analytics-line-path" d={linePath} />
                    {trendBars.map((bar, index) => {
                      const x = index * 134;
                      const y = 170 - (bar.value / 100) * 170;

                      return <circle key={bar.label} className="analytics-line-dot" cx={x} cy={y} r="4" />;
                    })}
                  </svg>
                  <div className="analytics-line-labels">
                    {trendBars.map((bar) => (
                      <span key={bar.label}>{bar.label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="analytics-card analytics-module-card">
              <div className="analytics-card-head">
                <h2>Projects by status</h2>
              </div>
              <div className="analytics-status-layout">
                <div className="analytics-donut-wrap">
                  <div className="analytics-donut-chart" style={{ background: donutGradient }}>
                    <div className="analytics-donut-hole" />
                  </div>
                </div>
                <div className="analytics-status-legend">
                  {statusSegments.map((item) => (
                    <div className="analytics-legend-row" key={item.label}>
                      <span className="analytics-legend-swatch" style={{ background: item.color }} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="analytics-bottom-grid">
            <section className="analytics-card analytics-table-card">
              <div className="analytics-card-head">
                <h2>AI module acceptance rates</h2>
              </div>
              <div className="analytics-acceptance-chart">
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
                      <div className="analytics-acceptance-col" key={item.name}>
                        <div className="analytics-acceptance-track">
                          <div className="analytics-acceptance-fill" style={{ height: `${item.width}%` }} />
                        </div>
                        <div className="analytics-acceptance-label">{item.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
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
