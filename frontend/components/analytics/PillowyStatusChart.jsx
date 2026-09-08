"use client";

import React, { useState, useMemo, useRef } from "react";

const cx = 250;
const cy = 250;
const radius = 186; // Outer circle radius
const gapOffset = 9; // Perpendicular gap between slices
const cornerR = 14; // Rounded corners

function degToRad(deg) {
  return ((deg - 90) * Math.PI) / 180;
}

// Generates the smooth rounded-wedge path for each sector
function createRoundedWedge(cx, cy, r, startAngle, sweepAngle, cornerRadius) {
  if (sweepAngle <= 0) return "";
  const endAngle = startAngle + sweepAngle;
  const midAngle = startAngle + sweepAngle / 2;

  const radMid = degToRad(midAngle);
  const ox = cx + Math.cos(radMid) * gapOffset;
  const oy = cy + Math.sin(radMid) * gapOffset;

  const radStart = degToRad(startAngle);
  const radEnd = degToRad(endAngle);

  const R = r - gapOffset;

  const innerFilletDist = Math.min(cornerRadius * 1.5, 24);
  const pInnerStart = {
    x: ox + innerFilletDist * Math.cos(radStart),
    y: oy + innerFilletDist * Math.sin(radStart),
  };
  const pInnerEnd = {
    x: ox + innerFilletDist * Math.cos(radEnd),
    y: oy + innerFilletDist * Math.sin(radEnd),
  };

  const angleDelta = Math.min(cornerRadius / R, ((sweepAngle * Math.PI) / 180) / 3);
  const pOuterStartEdge = {
    x: ox + (R - cornerRadius) * Math.cos(radStart),
    y: oy + (R - cornerRadius) * Math.sin(radStart),
  };
  const pOuterStartCorner = {
    x: ox + R * Math.cos(radStart + angleDelta),
    y: oy + R * Math.sin(radStart + angleDelta),
  };

  const pOuterEndEdge = {
    x: ox + (R - cornerRadius) * Math.cos(radEnd),
    y: oy + (R - cornerRadius) * Math.sin(radEnd),
  };
  const pOuterEndCorner = {
    x: ox + R * Math.cos(radEnd - angleDelta),
    y: oy + R * Math.sin(radEnd - angleDelta),
  };

  const isLargeArc = sweepAngle > 180 ? 1 : 0;

  return `
    M ${pInnerStart.x.toFixed(2)} ${pInnerStart.y.toFixed(2)}
    L ${pOuterStartEdge.x.toFixed(2)} ${pOuterStartEdge.y.toFixed(2)}
    Q ${(ox + R * Math.cos(radStart)).toFixed(2)} ${(oy + R * Math.sin(radStart)).toFixed(2)} ${pOuterStartCorner.x.toFixed(2)} ${pOuterStartCorner.y.toFixed(2)}
    A ${R.toFixed(2)} ${R.toFixed(2)} 0 ${isLargeArc} 1 ${pOuterEndCorner.x.toFixed(2)} ${pOuterEndCorner.y.toFixed(2)}
    Q ${(ox + R * Math.cos(radEnd)).toFixed(2)} ${(oy + R * Math.sin(radEnd)).toFixed(2)} ${pOuterEndEdge.x.toFixed(2)} ${pOuterEndEdge.y.toFixed(2)}
    L ${pInnerEnd.x.toFixed(2)} ${pInnerEnd.y.toFixed(2)}
    Q ${ox.toFixed(2)} ${oy.toFixed(2)} ${pInnerStart.x.toFixed(2)} ${pInnerStart.y.toFixed(2)}
    Z
  `.trim();
}

function getMarkerPoints(angleDeg) {
  const rad = degToRad(angleDeg);
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);

  const tipDist = radius - 1;
  const tipX = cx + dirX * tipDist;
  const tipY = cy + dirY * tipDist;

  const length = 8.5;
  const halfW = 4.4;

  const perpX = -dirY;
  const perpY = dirX;

  const baseX = tipX + dirX * length;
  const baseY = tipY + dirY * length;

  const b1X = baseX + perpX * halfW;
  const b1Y = baseY + perpY * halfW;
  const b2X = baseX - perpX * halfW;
  const b2Y = baseY - perpY * halfW;

  return `${tipX.toFixed(1)},${tipY.toFixed(1)} ${b1X.toFixed(1)},${b1Y.toFixed(1)} ${b2X.toFixed(1)},${b2Y.toFixed(1)}`;
}

export default function PillowyStatusChart({
  statusSegments = [],
  totalProjects = 25,
  onSelectStatus,
  selectedStatusLabel,
}) {
  const chartStageRef = useRef(null);
  const svgWrapRef = useRef(null);

  // Exact 4-sector configuration from user reference:
  // Green: Top-Left (Secondary 18%)
  // Blue: Top-Right (Secondary 22%)
  // Pink: Bottom-Right (Secondary 24%)
  // Yellow: Bottom-Left (Primary 36%)
  const segmentsData = useMemo(() => {
    const findPct = (label, defaultPct, defaultCount) => {
      const match = statusSegments.find(
        (s) => s.label?.toLowerCase() === label.toLowerCase()
      );
      return {
        pct: match ? match.value : defaultPct,
        count: match ? match.count : defaultCount,
        label: match?.label || label,
      };
    };

    const blue = findPct("Deliverables", 22, 6);
    const pink = findPct("Created", 24, 6);
    const yellow = findPct("Delivered", 36, 9);
    const green = findPct("In Progress", 18, 4);

    return {
      blue: { ...blue, id: "blue", name: "Deliverables", title: "Deliverables", color: "#0284c7" },
      pink: { ...pink, id: "pink", name: "Created", title: "Created", color: "#ec4899" },
      yellow: { ...yellow, id: "yellow", name: "Delivered", title: "Delivered", color: "#eab308" },
      green: { ...green, id: "green", name: "In Progress", title: "In Progress", color: "#16a34a" },
    };
  }, [statusSegments]);

  const total =
    segmentsData.blue.pct +
    segmentsData.pink.pct +
    segmentsData.yellow.pct +
    segmentsData.green.pct;
  const factor = 360 / (total > 0 ? total : 1);

  const sweepBlue = segmentsData.blue.pct * factor;
  const sweepPink = segmentsData.pink.pct * factor;
  const sweepYellow = segmentsData.yellow.pct * factor;
  const sweepGreen = segmentsData.green.pct * factor;

  const sectors = useMemo(
    () => [
      {
        id: "blue",
        info: segmentsData.blue,
        start: 0,
        sweep: sweepBlue,
        pct: segmentsData.blue.pct,
        count: segmentsData.blue.count,
        badgeClass: "badge-tr",
        badgeSub: (segmentsData.blue.title || "Deliverables").toUpperCase(),
      },
      {
        id: "pink",
        info: segmentsData.pink,
        start: sweepBlue,
        sweep: sweepPink,
        pct: segmentsData.pink.pct,
        count: segmentsData.pink.count,
        badgeClass: "badge-br",
        badgeSub: (segmentsData.pink.title || "Created").toUpperCase(),
      },
      {
        id: "yellow",
        info: segmentsData.yellow,
        start: sweepBlue + sweepPink,
        sweep: sweepYellow,
        pct: segmentsData.yellow.pct,
        count: segmentsData.yellow.count,
        badgeClass: "badge-bl",
        badgeSub: (segmentsData.yellow.title || "Delivered").toUpperCase(),
      },
      {
        id: "green",
        info: segmentsData.green,
        start: sweepBlue + sweepPink + sweepYellow,
        sweep: sweepGreen,
        pct: segmentsData.green.pct,
        count: segmentsData.green.count,
        badgeClass: "badge-tl",
        badgeSub: (segmentsData.green.title || "In Progress").toUpperCase(),
      },
    ],
    [segmentsData, sweepBlue, sweepPink, sweepYellow, sweepGreen]
  );

  const [activeId, setActiveId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, show: false });

  const activeSector = sectors.find((s) => s.id === activeId);

  const handleActivate = (id) => {
    setActiveId(id);
    const sec = sectors.find((s) => s.id === id);
    if (!sec) return;

    if (onSelectStatus) {
      onSelectStatus(sec.info.title);
    }

    if (chartStageRef.current && svgWrapRef.current) {
      const stageRect = chartStageRef.current.getBoundingClientRect();
      const svgWrapRect = svgWrapRef.current.getBoundingClientRect();
      const midRad = degToRad(sec.start + sec.sweep / 2);
      const ttRadius = radius * 0.58;
      const scale = svgWrapRect.width / 500;

      const posX =
        svgWrapRect.left -
        stageRect.left +
        (cx + Math.cos(midRad) * ttRadius) * scale;
      const posY =
        svgWrapRect.top -
        stageRect.top +
        (cy + Math.sin(midRad) * ttRadius) * scale;

      setTooltipPos({ x: posX, y: posY, show: true });
    }
  };

  const handleDeactivate = () => {
    setActiveId(null);
    setTooltipPos((prev) => ({ ...prev, show: false }));
  };

  return (
    <div className="airbrush-chart-wrapper">
      <div className="airbrush-chart-stage" id="chartStage" ref={chartStageRef}>
        {/* Stat Labels in the 4 corners matching reference */}
        {sectors.map((sec) => {
          const isActive = activeId === sec.id;
          return (
            <div
              key={`badge-${sec.id}`}
              className={`airbrush-stat-badge ${sec.badgeClass} ${isActive ? "active" : ""}`}
              onMouseEnter={() => handleActivate(sec.id)}
              onMouseLeave={handleDeactivate}
              onClick={() => handleActivate(sec.id)}
              title={`${sec.info.title}: ${Math.round(sec.pct)}%`}
            >
              <span className="airbrush-stat-sub">{sec.badgeSub}</span>
              <span className="airbrush-stat-num" id={`val-${sec.id}`}>
                {Math.round(sec.pct)}%
              </span>
            </div>
          );
        })}

        {/* Hover Tooltip matching reference */}
        <div
          className={`airbrush-tooltip-card ${tooltipPos.show ? "show" : ""}`}
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <span
            className="airbrush-tt-label"
            style={{ color: activeSector?.info.color || "inherit" }}
          >
            {activeSector ? `${activeSector.info.name} Segment` : "Segment"}
          </span>
          <span className="airbrush-tt-val">
            {activeSector
              ? `${activeSector.info.title}: ${Math.round(activeSector.pct)}%`
              : "Share"}
          </span>
        </div>

        {/* SVG Graphic */}
        <div className="airbrush-svg-container" ref={svgWrapRef}>
          <svg viewBox="0 0 500 500" id="pieSvg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* Feathered Airbrush Blur Filters */}
              <filter id="glow-ambient" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="24" result="ambient" />
              </filter>

              {/* 1. Top-Right Blue Wedge (Secondary 22%) */}
              <radialGradient id="grad-blue" cx="55%" cy="45%" r="65%" fx="42%" fy="35%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="45%" stopColor="#0284c7" />
                <stop offset="78%" stopColor="#0369a1" />
                <stop offset="94%" stopColor="#38bdf8" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.2" />
              </radialGradient>

              <linearGradient id="wash-blue" x1="0%" y1="0%" x2="70%" y2="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="30%" stopColor="#e0f2fe" stopOpacity="0.45" />
                <stop offset="65%" stopColor="#0284c7" stopOpacity="0" />
              </linearGradient>

              {/* 2. Bottom-Right Pink Wedge (Secondary 24%) */}
              <radialGradient id="grad-pink" cx="48%" cy="48%" r="65%" fx="42%" fy="42%">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="48%" stopColor="#ec4899" />
                <stop offset="82%" stopColor="#f43f5e" />
                <stop offset="94%" stopColor="#fb7185" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ffe4e6" stopOpacity="0.2" />
              </radialGradient>

              {/* 3. Bottom-Left Yellow Wedge (Primary 36%) */}
              <radialGradient id="grad-yellow" cx="46%" cy="46%" r="65%" fx="40%" fy="40%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="45%" stopColor="#f59e0b" />
                <stop offset="78%" stopColor="#eab308" />
                <stop offset="94%" stopColor="#fde047" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0.2" />
              </radialGradient>

              {/* 4. Top-Left Green Wedge (Secondary 18%) */}
              <radialGradient id="grad-green" cx="50%" cy="48%" r="65%" fx="44%" fy="40%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="46%" stopColor="#16a34a" />
                <stop offset="80%" stopColor="#15803d" />
                <stop offset="94%" stopColor="#4ade80" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#86efac" stopOpacity="0.2" />
              </radialGradient>

              <linearGradient id="wash-green" x1="100%" y1="0%" x2="30%" y2="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                <stop offset="30%" stopColor="#dcfce7" stopOpacity="0.45" />
                <stop offset="65%" stopColor="#16a34a" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Outer Diffuse Airbrush Ambient Bleed */}
            <g id="ambientGlow" filter="url(#glow-ambient)" opacity="0.65">
              {sectors.map((sec) => (
                <path
                  key={`glow-${sec.id}`}
                  id={`glow-${sec.id}`}
                  d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                  fill={`url(#grad-${sec.id})`}
                />
              ))}
            </g>

            {/* Main Crisp + Feathered Petals */}
            <g id="petals">
              {sectors.map((sec) => {
                const isActive = activeId === sec.id;
                const midRad = degToRad(sec.start + sec.sweep / 2);
                const transform = isActive
                  ? `translate(${Math.cos(midRad) * 6}px, ${Math.sin(midRad) * 6}px) scale(1.025)`
                  : "none";

                return (
                  <g
                    key={`petal-${sec.id}`}
                    className={`airbrush-petal-group ${isActive ? "active" : ""}`}
                    id={`petal-${sec.id}`}
                    data-id={sec.id}
                    style={{
                      cursor: "pointer",
                      transform,
                      opacity: activeId && !isActive ? 0.72 : 1,
                      transformOrigin: "250px 250px",
                      transition:
                        "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
                    }}
                    onMouseEnter={() => handleActivate(sec.id)}
                    onMouseLeave={handleDeactivate}
                    onClick={() => handleActivate(sec.id)}
                  >
                    <path
                      id={`shape-${sec.id}`}
                      d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                      fill={`url(#grad-${sec.id})`}
                    />
                    {sec.id === "blue" && (
                      <path
                        id="wash-blue-el"
                        d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                        fill="url(#wash-blue)"
                        pointerEvents="none"
                      />
                    )}
                    {sec.id === "green" && (
                      <path
                        id="wash-green-el"
                        d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                        fill="url(#wash-green)"
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* 4 Perimeter Boundary Pointer Markers (Dark Triangles from Reference) */}
            <g id="markersGroup">
              <polygon
                id="marker-top"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(0)}
                fill="#0a0a0a"
              />
              <polygon
                id="marker-right"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue)}
                fill="#0a0a0a"
              />
              <polygon
                id="marker-bottom"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue + sweepPink)}
                fill="#0a0a0a"
              />
              <polygon
                id="marker-left"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue + sweepPink + sweepYellow)}
                fill="#0a0a0a"
              />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
