"use client";

import { useEffect, useState } from "react";

const primaryNavItems = [
  { label: "Dashboard", icon: "grid", active: true, badge: "3", badgeClass: "g" },
  { label: "Projects", icon: "mail" },
  { label: "Discovery", icon: "search", badge: "1" },
  { label: "AI Suite", icon: "star" },
  { label: "Analytics", icon: "chart" },
];

const mobileTabItems = [
  { label: "Home", icon: "grid", active: true },
  { label: "Projects", icon: "mail" },
  { label: "AI", icon: "star" },
  { label: "Portal", icon: "portal" },
  { label: "Settings", icon: "settings" },
];

function Icon({ type }) {
  const commonProps = {
    className: "nav-icon",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    viewBox: "0 0 24 24",
  };

  switch (type) {
    case "mail":
      return (
        <svg {...commonProps}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      );
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...commonProps}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "portal":
      return (
        <svg {...commonProps}>
          <path d="M14 3h7v7" />
          <path d="M10 14 21 3" />
          <path d="M21 14v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4" />
        </svg>
      );
    case "bell":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
  }
}

function NavItem({ item, onClick }) {
  return (
    <button className={`nav-item ${item.active ? "active" : ""}`.trim()} type="button" onClick={onClick}>
      <Icon type={item.icon} />
      {item.label}
      {item.badge ? <span className={`nav-badge ${item.badgeClass || ""}`.trim()}>{item.badge}</span> : null}
    </button>
  );
}

function MobileTabItem({ item }) {
  return (
    <button className={`mobile-tab-item ${item.active ? "active" : ""}`.trim()} type="button">
      <Icon type={item.icon} />
      <span>{item.label}</span>
    </button>
  );
}

export default function Floxaheader({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => document.body.style.removeProperty("overflow");
  }, [isSidebarOpen]);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <>
      <div
        className={`sidebar-overlay ${isSidebarOpen ? "open" : ""}`.trim()}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <nav className={`sidebar ${isSidebarOpen ? "open" : ""}`.trim()}>
        <div className="logo-area">
          <div className="logo">FLOXA</div>
          <div className="logo-tag">Brand Discovery Platform</div>
        </div>

        <div className="nav-section">
          <div className="nav-lbl">Workspace</div>
          {primaryNavItems.map((item) => (
            <NavItem key={item.label} item={item} onClick={closeSidebar} />
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-lbl">Account</div>
          <NavItem item={{ label: "Settings", icon: "settings" }} onClick={closeSidebar} />
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">AK</div>
            <div>
              <div className="user-name">Akhil</div>
              <div className="user-plan">Dashboard admin</div>
            </div>
          </div>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <button
            className="menu-btn"
            type="button"
            aria-label="Open navigation"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18" />
              <path d="M3 12h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <div className="topbar-title">Dashboard</div>
          <div className="spacer" />
          <div className="search-wrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input type="text" placeholder="Search projects..." />
          </div>
          <button className="icon-btn" type="button" aria-label="Notifications">
            <Icon type="bell" />
            <div className="notif-dot" />
          </button>
        </div>
        {children}
      </div>

      <div className="mobile-tabbar">
        {mobileTabItems.map((item) => (
          <MobileTabItem key={item.label} item={item} />
        ))}
      </div>
    </>
  );
}
