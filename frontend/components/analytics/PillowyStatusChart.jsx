"use client";

import React, { useState, useMemo, useRef } from "react";

const cx = 250;
const cy = 250;
const radius = 188; // Outer circle radius
const gapOffset = 5.5; // Refined tight gap offset for authentic cushion seam
const cornerR = 14; // Smooth rounded corners

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

  const innerFilletDist = Math.min(cornerRadius * 1.5, 22);
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
  // Green: Top-Left (In Progress 18%)
  // Blue: Top-Right (Deliverables 22%)
  // Pink: Bottom-Right (Created 12% or 24%)
  // Yellow: Bottom-Left (Delivered 48% or 36%)
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
    const pink = findPct("Created", 12, 3);
    const yellow = findPct("Delivered", 48, 12);
    const green = findPct("In Progress", 18, 4);

    return {
      blue: { ...blue, id: "blue", title: "Deliverables", color: "#0ea5e9" },
      pink: { ...pink, id: "pink", title: "Created", color: "#ec4899" },
      yellow: { ...yellow, id: "yellow", title: "Delivered", color: "#f59e0b" },
      green: { ...green, id: "green", title: "In Progress", color: "#22c55e" },
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
        badgeSub: "DELIVERABLES",
      },
      {
        id: "pink",
        info: segmentsData.pink,
        start: sweepBlue,
        sweep: sweepPink,
        pct: segmentsData.pink.pct,
        count: segmentsData.pink.count,
        badgeClass: "badge-br",
        badgeSub: "CREATED",
      },
      {
        id: "yellow",
        info: segmentsData.yellow,
        start: sweepBlue + sweepPink,
        sweep: sweepYellow,
        pct: segmentsData.yellow.pct,
        count: segmentsData.yellow.count,
        badgeClass: "badge-bl",
        badgeSub: "DELIVERED",
      },
      {
        id: "green",
        info: segmentsData.green,
        start: sweepBlue + sweepPink + sweepYellow,
        sweep: sweepGreen,
        pct: segmentsData.green.pct,
        count: segmentsData.green.count,
        badgeClass: "badge-tl",
        badgeSub: "IN PROGRESS",
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
        {/* Corner Stat Badges with exact labels and values */}
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
          className={`airbrush-tooltip-card airbrush-tooltip-popover ${tooltipPos.show ? "show" : ""}`}
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            backgroundColor: "#ffffff",
            background: "#ffffff",
            border: "1px solid rgba(255, 255, 255, 0.95)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)",
            borderRadius: "10px",
          }}
        >
          <span
            className="airbrush-tt-label"
            style={{ color: activeSector?.info.color || "#111827" }}
          >
            {activeSector ? activeSector.badgeSub : "Status"}
          </span>
          <span className="airbrush-tt-val" style={{ color: "#1f2937" }}>
            {activeSector
              ? `${Math.round(activeSector.pct)}% • ${activeSector.count} projects`
              : "Share"}
          </span>
        </div>

        {/* Central Graphic Container */}
        <div className="airbrush-svg-container" ref={svgWrapRef}>
          <svg viewBox="0 0 500 500" id="pieSvg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* Feathered Airbrush Blur Filters */}
              <filter id="glow-ambient" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="22" result="ambient" />
              </filter>

              {/* 1. Top-Right Blue Wedge (Deliverables 22%) */}
              <radialGradient id="grad-blue" cx="55%" cy="45%" r="65%" fx="42%" fy="35%">
                <stop offset="0%" stopColor="#0284c7" />
                <stop offset="42%" stopColor="#0284c7" />
                <stop offset="76%" stopColor="#0284c7" />
                <stop offset="92%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#0284c7" />
              </radialGradient>

              <linearGradient id="wash-blue" x1="0%" y1="0%" x2="70%" y2="80%">
                <stop offset="0%" stopColor="#0284c7"  />
                <stop offset="30%" stopColor="#0284c7"  />
                <stop offset="65%" stopColor="#0284c7"  />
              </linearGradient>

              {/* 2. Bottom-Right Pink Wedge (Created 12%) */}
              <radialGradient id="grad-pink" cx="48%" cy="48%" r="65%" fx="42%" fy="42%">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="46%" stopColor="#f472b6" />
                <stop offset="80%" stopColor="#f472b6" />
                <stop offset="94%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#f472b6"  />
              </radialGradient>

              <linearGradient id="wash-pink" x1="0%" y1="0%" x2="80%" y2="80%">
                <stop offset="0%" stopColor="#f472b6"  />
                <stop offset="28%" stopColor="#f472b6"  />
                <stop offset="65%" stopColor="#f472b6" />
              </linearGradient>

              {/* 3. Bottom-Left Yellow Wedge (Delivered 48%) */}
              <radialGradient id="grad-yellow" cx="46%" cy="46%" r="65%" fx="40%" fy="40%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="44%" stopColor="#fbbf24" />
                <stop offset="78%" stopColor="#fbbf24" />
                <stop offset="92%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#fbbf24"  />
              </radialGradient>

              <linearGradient id="wash-yellow" x1="30%" y1="0%" x2="70%" y2="90%">
                <stop offset="0%" stopColor="#fbbf24"  />
                <stop offset="30%" stopColor="#fbbf24"  />
                <stop offset="70%" stopColor="#fbbf24" />
              </linearGradient>

              {/* 4. Top-Left Green Wedge (In Progress 18%) */}
              <radialGradient id="grad-green" cx="50%" cy="48%" r="65%" fx="44%" fy="40%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="44%" stopColor="#22c55e" />
                <stop offset="78%" stopColor="#22c55e" />
                <stop offset="92%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#22c55e"  />
              </radialGradient>

              <linearGradient id="wash-green" x1="100%" y1="0%" x2="30%" y2="80%">
                <stop offset="0%" stopColor="#22c55e"  />
                <stop offset="30%" stopColor="#22c55e"/>
                <stop offset="65%" stopColor="#22c55e"  />
              </linearGradient>
            </defs>

            {/* Outer Diffuse Airbrush Ambient Bleed removed */}

            {/* Main Crisp + Feathered Petals */}
            <g id="petals">
              {sectors.map((sec) => {
                const isActive = activeId === sec.id;
                const midRad = degToRad(sec.start + sec.sweep / 2);
                const transform = isActive
                  ? `translate(${Math.cos(midRad) * 6}px, ${Math.sin(midRad) * 6}px) scale(1.028)`
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
                      opacity: activeId && !isActive ? 0.75 : 1,
                      transformOrigin: "250px 250px",
                      transition:
                        "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
                    }}
                    onMouseEnter={() => handleActivate(sec.id)}
                    onMouseLeave={handleDeactivate}
                    onClick={() => handleActivate(sec.id)}
                  >
                    {/* Sector Base with subtle frosted rim stroke */}
                    <path
                      id={`shape-${sec.id}`}
                      d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                      fill={`url(#grad-${sec.id})`}
                      stroke="rgba(255, 255, 255, 0.22)"
                      strokeWidth="1.2"
                    />

                    {/* Specular 3D Wash Overlays */}
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
                    {sec.id === "pink" && (
                      <path
                        id="wash-pink-el"
                        d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                        fill="url(#wash-pink)"
                        pointerEvents="none"
                      />
                    )}
                    {sec.id === "yellow" && (
                      <path
                        id="wash-yellow-el"
                        d={createRoundedWedge(cx, cy, radius, sec.start, sec.sweep, cornerR)}
                        fill="url(#wash-yellow)"
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
                fill="#07130c"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="0.5"
              />
              <polygon
                id="marker-right"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue)}
                fill="#07130c"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="0.5"
              />
              <polygon
                id="marker-bottom"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue + sweepPink)}
                fill="#07130c"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="0.5"
              />
              <polygon
                id="marker-left"
                className="airbrush-marker-arrow"
                points={getMarkerPoints(sweepBlue + sweepPink + sweepYellow)}
                fill="#07130c"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="0.5"
              />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
