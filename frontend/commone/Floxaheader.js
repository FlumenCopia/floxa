"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentConsultant, logoutConsultant } from "../src/lib/authApi";
import { getConsultantActivities, markConsultantActivitiesRead } from "../src/lib/projectApi";
import { showError, showSuccess } from "../src/lib/toast";

const primaryNavItems = [
  { label: "Dashboard", icon: "grid", route: "/" },
  { label: "Projects", icon: "mail", route: "/project" },
  { label: "Discovery", icon: "search", route: "/discovery" },
  { label: "AI Suite", icon: "star", route: "/ai-suite" },
  { label: "Analytics", icon: "chart", route: "/analytics" },
];

const clientNavItems = [{ label: "Client Portal", icon: "portal", route: "/client-portal" }];

const accountNavItems = [{ label: "Settings", icon: "settings", route: "/settings" }];

const mobileTabItems = [
  { label: "Home", icon: "grid", route: "/" },
  { label: "Projects", icon: "mail", route: "/project" },
  { label: "AI", icon: "star", route: "/ai-suite" },
  { label: "Portal", icon: "portal", route: "/client-portal" },
  { label: "Settings", icon: "settings", route: "/settings" },
];

const notificationTabByAction = {
  client_profile_submitted: "discovery",
  client_profile_updated: "discovery",
  discovery_submitted: "discovery",
  discovery_updated: "discovery",
  moodboard_selected: "moodboards",
  concept_approved: "concepts",
  concept_changes_requested: "concepts",
  agreement_uploaded: "agreement",
  agreement_updated: "agreement",
  agreement_removed: "agreement",
  agreement_opened: "agreement",
  agreement_downloaded: "agreement",
  agreement_signed: "agreement",
  agreement_accepted: "agreement",
  deliverable_shared: "deliverables",
  deliverable_reshared: "deliverables",
  deliverable_removed: "deliverables",
  deliverable_downloaded: "deliverables",
  deliverable_accepted: "deliverables",
  project_signed_off: "deliverables",
  payment_requested: "payments",
  payment_received: "payments",
  payment_paid: "payments",
};

let cachedConsultant = null;
let hasValidatedSession = false;

function getNotificationProjectId(notification) {
  return notification?.project_id || notification?.metadata?.project_id || notification?.metadata?.project?.id;
}

function getRelativeTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  if (diffHours < 48) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

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
    case "logout":
      return (
        <svg {...commonProps}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
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

function MobileTabItem({ item, onClick }) {
  return (
    <button className={`mobile-tab-item ${item.active ? "active" : ""}`.trim()} type="button" onClick={onClick}>
      <Icon type={item.icon} />
      <span>{item.label}</span>
    </button>
  );
}

export default function Floxaheader({
  children,
  title = "Dashboard",
  activeNav = "Dashboard",
  notificationCount = 0,
  notifications = [],
  notificationsLoading = false,
  readActivityIds = [],
  onNotificationClick,
  onNotificationsOpen,
  onMarkNotificationsRead,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentProjectSearch = searchParams.get("search") || "";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(() => hasValidatedSession);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [headerNotifications, setHeaderNotifications] = useState([]);
  const [headerNotificationsLoading, setHeaderNotificationsLoading] = useState(false);
  const [consultant, setConsultant] = useState(cachedConsultant);
  const [projectSearch, setProjectSearch] = useState(() => searchParams.get("search") || "");
  const notificationsRequestRef = useRef(false);
  const resolvedActiveNav = pathname === "/project" ? "Projects" : activeNav;
  const resolvedPrimaryNavItems = primaryNavItems.map((item) => ({
    ...item,
    active: item.label === resolvedActiveNav,
  }));

  const resolvedMobileTabItems = mobileTabItems.map((item) => ({
    ...item,
    active:
      (resolvedActiveNav === "Dashboard" && item.label === "Home") ||
      (resolvedActiveNav === "Projects" && item.label === "Projects") ||
      (resolvedActiveNav === "AI Suite" && item.label === "AI") ||
      (resolvedActiveNav === "Client Portal" && item.label === "Portal") ||
      (resolvedActiveNav === "Settings" && item.label === "Settings"),
  }));
  const visibleNotifications = headerNotifications.length ? headerNotifications : notifications;
  const visibleNotificationsLoading = headerNotificationsLoading || notificationsLoading;
  const visibleNotificationCount = headerNotifications.length
    ? headerNotifications.filter((notification) => !notification.is_read).length
    : notificationCount;

  useEffect(() => {
    if (!readActivityIds.length) {
      return;
    }

    const readIdSet = new Set(readActivityIds);
    const readAt = new Date().toISOString();

    setHeaderNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        readIdSet.has(notification.id)
          ? {
              ...notification,
              is_read: true,
              read_at: notification.read_at || readAt,
            }
          : notification
      )
    );
  }, [readActivityIds]);

  const markHeaderNotificationsRead = useCallback(() => {
    const readAt = new Date().toISOString();

    setHeaderNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        is_read: true,
        read_at: notification.read_at || readAt,
      }))
    );
  }, []);

  const loadHeaderNotifications = useCallback(async ({ showLoading = false } = {}) => {
    if (notificationsRequestRef.current) {
      return;
    }

    notificationsRequestRef.current = true;

    if (showLoading) {
      setHeaderNotificationsLoading(true);
    }

    try {
      const data = await getConsultantActivities();
      setHeaderNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load consultant notifications:", error);
    } finally {
      notificationsRequestRef.current = false;

      if (showLoading) {
        setHeaderNotificationsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function validateSession() {
      try {
        const currentConsultant = await getCurrentConsultant();
        cachedConsultant = currentConsultant;
        hasValidatedSession = true;

        if (!isMounted) {
          return;
        }

        setConsultant(currentConsultant);
        setIsAuthChecked(true);
      } catch (error) {
        console.error("Session validation failed:", error);
        cachedConsultant = null;
        hasValidatedSession = false;
        localStorage.removeItem("consultant");
        router.replace("/login");
      }
    }

    validateSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isAuthChecked) {
      return;
    }

    let isMounted = true;
    const initialLoadId = window.setTimeout(() => {
      if (isMounted) {
        loadHeaderNotifications({ showLoading: true });
      }
    }, 0);
    const intervalId = window.setInterval(() => {
      if (isMounted) {
        loadHeaderNotifications();
      }
    }, 30000);

    return () => {
      isMounted = false;
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [isAuthChecked, loadHeaderNotifications]);

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
    const searchValue = projectSearch.trim();

    if (!searchValue && pathname !== "/project") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (searchValue) {
        const nextRoute = `/project?search=${encodeURIComponent(searchValue)}`;

        if (pathname !== "/project" || currentProjectSearch !== searchValue) {
          router.replace(nextRoute);
        }

        return;
      }

      if (pathname === "/project" && currentProjectSearch) {
        router.replace("/project");
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [currentProjectSearch, pathname, projectSearch, router]);

  useEffect(() => {
    if (!isSidebarOpen) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => document.body.style.removeProperty("overflow");
  }, [isSidebarOpen]);

  const closeSidebar = () => setIsSidebarOpen(false);
  const handleNavigation = (route) => {
    closeSidebar();
    if (route && route !== pathname) {
      router.push(route);
    }
  };

  const handleProjectSearch = (event) => {
    event.preventDefault();

    const searchValue = projectSearch.trim();

    if (searchValue) {
      router.replace(`/project?search=${encodeURIComponent(searchValue)}`);
      return;
    }

    router.replace("/project");
  };

  const handleNotificationViewAll = () => {
    setIsNotificationOpen(false);
    const firstNotification = visibleNotifications[0];

    if (onNotificationClick) {
      onNotificationClick(firstNotification);
      return;
    }

    if (firstNotification?.project_id) {
      router.push(`/discovery?projectId=${firstNotification.project_id}&tab=activity`);
    }
  };

  const handleNotificationItemClick = (notification) => {
    setIsNotificationOpen(false);

    const projectId = getNotificationProjectId(notification);
    const tab = notificationTabByAction[notification?.action];

    if (projectId && tab) {
      router.push(`/discovery?projectId=${encodeURIComponent(projectId)}&tab=${tab}`);
      return;
    }

    if (onNotificationClick) {
      onNotificationClick(notification);
    }
  };

  const handleNotificationToggle = async () => {
    const nextOpen = !isNotificationOpen;
    setIsNotificationOpen(nextOpen);

    if (nextOpen) {
      if (onNotificationsOpen) {
        markHeaderNotificationsRead();

        try {
          await onNotificationsOpen();
        } catch (error) {
          console.error("Failed to mark consultant notifications as read:", error);
          await loadHeaderNotifications();
        }
      } else {
        markHeaderNotificationsRead();

        try {
          await markConsultantActivitiesRead();
        } catch (error) {
          console.error("Failed to mark consultant notifications as read:", error);
          await loadHeaderNotifications();
        }
      }
    }
  };

  const handleMarkAllRead = async () => {
    markHeaderNotificationsRead();

    if (onMarkNotificationsRead) {
      try {
        await onMarkNotificationsRead();
      } catch (error) {
        console.error("Failed to mark consultant notifications as read:", error);
        await loadHeaderNotifications();
      }
      return;
    }

    try {
      await markConsultantActivitiesRead();
    } catch (error) {
      console.error("Failed to mark consultant notifications as read:", error);
      await loadHeaderNotifications();
    }
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("Are you sure you want to logout?");

    if (!confirmed) {
      return;
    }

    try {
      await logoutConsultant();
      showSuccess("Logout successful.");
    } catch (error) {
      console.error("Logout failed:", error);
      showError(error?.detail || "Logout failed.");
    } finally {
      localStorage.removeItem("consultant");
      setHeaderNotifications([]);
      closeSidebar();
      router.push("/login");
    }
  };

  if (!isAuthChecked) {
    return null;
  }

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
          {resolvedPrimaryNavItems.map((item) => (
            <NavItem key={item.label} item={item} onClick={() => handleNavigation(item.route)} />
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-lbl">Client</div>
          {clientNavItems.map((item) => (
            <NavItem key={item.label} item={item} onClick={() => handleNavigation(item.route)} />
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-lbl">Account</div>
          {accountNavItems.map((item) => (
            <NavItem key={item.label} item={item} onClick={() => handleNavigation(item.route)} />
          ))}
          <NavItem item={{ label: "Logout", icon: "logout" }} onClick={handleLogout} />
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">AK</div>
            <div>
              <div className="user-name">{consultant?.name || "Consultant"}</div>
              <div className="user-plan">Plan unavailable</div>
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
          <div className="topbar-title">{title}</div>
          <div className="spacer" />
          <form className="search-wrap" onSubmit={handleProjectSearch}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search projects..."
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
            />
          </form>
          <div className="notification-wrap">
            <button
              className="icon-btn"
              type="button"
              aria-label={visibleNotificationCount ? `${visibleNotificationCount} notifications` : "No notifications"}
              aria-expanded={isNotificationOpen}
              onClick={handleNotificationToggle}
            >
              <Icon type="bell" />
              {visibleNotificationCount ? <span className="notification-dot" /> : null}
            </button>
            {isNotificationOpen ? (
              <div className="notification-dropdown">
                <div className="notification-head">
                  <div>
                    <span>Notifications</span>
                    <strong>{visibleNotificationCount} unread</strong>
                  </div>
                  <button type="button" onClick={handleMarkAllRead}>Mark all read</button>
                </div>
                <div className="notification-list">
                  {visibleNotificationsLoading ? (
                    <div className="notification-empty">
                      <strong>Loading notifications...</strong>
                      <span>Checking recent project activity.</span>
                    </div>
                  ) : null}
                  {!visibleNotificationsLoading && visibleNotifications.length === 0 ? (
                    <div className="notification-empty">
                      <strong>No notifications yet.</strong>
                      <span>Client actions will appear here.</span>
                    </div>
                  ) : null}
                  {!visibleNotificationsLoading && visibleNotifications.slice(0, 5).map((notification) => (
                    <div
                      className="notification-item"
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationItemClick(notification)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNotificationItemClick(notification);
                        }
                      }}
                    >
                      <span className="notification-status-dot" />
                      <div className="notification-copy">
                        <p>{notification.description || notification.action}</p>
                        {notification.actor_type ? <small>{notification.actor_type}</small> : null}
                      </div>
                      <time>{getRelativeTime(notification.created_at)}</time>
                    </div>
                  ))}
                </div>
                <button className="notification-view-all" type="button" onClick={handleNotificationViewAll}>
                  View All
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div key={pathname} className="page-transition">
          {children}
        </div>
      </div>

      <div className="mobile-tabbar">
        {resolvedMobileTabItems.map((item) => (
          <MobileTabItem key={item.label} item={item} onClick={() => handleNavigation(item.route)} />
        ))}
      </div>
    </>
  );
}
