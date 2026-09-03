"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentConsultant, logoutConsultant, subscribeToConsultantChange, clearCurrentConsultantCache } from "../src/lib/authApi";
import { getConsultantActivities, markConsultantActivitiesRead } from "../src/lib/projectApi";
import { showError, showSuccess } from "../src/lib/toast";
import {
  LayoutDashboard,
  FolderKanban,
  Compass,
  Sparkles,
  BarChart3,
  ExternalLink,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  Search,
} from "lucide-react";

const primaryNavItems = [
  { label: "DASHBOARD", icon: "grid", route: "/" },
  { label: "PROJECTS", icon: "mail", route: "/project" },
  { label: "DISCOVERY", icon: "search", route: "/discovery" },
  { label: "AI SUITE", icon: "star", route: "/ai-suite" },
  { label: "ANALYTICS", icon: "chart", route: "/analytics" },
];

const clientNavItems = [{ label: "CLIENT PORTAL", icon: "portal", route: "/client-portal" }];

const accountNavItems = [{ label: "SETTINGS", icon: "settings", route: "/settings" }];

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

function formatRelativeTimeString(value, unit) {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function getRelativeTime(timestamp) {
  if (!timestamp) {
    return "Recently";
  }

  const createdTime = new Date(timestamp).getTime();

  if (Number.isNaN(createdTime)) {
    return "Recently";
  }

  const elapsedMs = Date.now() - createdTime;

  if (elapsedMs < 60000) {
    return "Just now";
  }

  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 60) {
    return formatRelativeTimeString(minutes, "min");
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return formatRelativeTimeString(hours, "hour");
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return formatRelativeTimeString(days, "day");
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return formatRelativeTimeString(months, "month");
  }

  const years = Math.floor(months / 12);
  return formatRelativeTimeString(years, "year");
}

function Icon({ type }) {
  switch (type) {
    case "grid":
      return <LayoutDashboard size={16} strokeWidth={1.8} />;
    case "mail":
      return <FolderKanban size={16} strokeWidth={1.8} />;
    case "search":
      return <Compass size={16} strokeWidth={1.8} />;
    case "star":
      return <Sparkles size={16} strokeWidth={1.8} />;
    case "chart":
      return <BarChart3 size={16} strokeWidth={1.8} />;
    case "portal":
      return <ExternalLink size={16} strokeWidth={1.8} />;
    case "settings":
      return <Settings size={16} strokeWidth={1.8} />;
    case "bell":
      return <Bell size={16} strokeWidth={1.8} />;
    case "logout":
      return <LogOut size={16} strokeWidth={1.8} />;
    default:
      return <LayoutDashboard size={16} strokeWidth={1.8} />;
  }
}

function NavItem({ item, onClick }) {
  if (item.route) {
    return (
      <Link
        href={item.route}
        className={`nav-item ${item.active ? "active" : ""}`.trim()}
        onClick={onClick}
      >
        <Icon type={item.icon} />
        {item.label}
        {item.badge ? <span className={`nav-badge ${item.badgeClass || ""}`.trim()}>{item.badge}</span> : null}
      </Link>
    );
  }

  return (
    <button className={`nav-item ${item.active ? "active" : ""}`.trim()} type="button" onClick={onClick}>
      <Icon type={item.icon} />
      {item.label}
      {item.badge ? <span className={`nav-badge ${item.badgeClass || ""}`.trim()}>{item.badge}</span> : null}
    </button>
  );
}

function MobileTabItem({ item, onClick }) {
  if (item.route) {
    return (
      <Link
        href={item.route}
        className={`mobile-tab-item ${item.active ? "active" : ""}`.trim()}
        onClick={onClick}
      >
        <Icon type={item.icon} />
        <span>{item.label}</span>
      </Link>
    );
  }

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
  onNotificationClick = () => { },
  onNotificationsOpen = () => { },
  onMarkNotificationsRead = () => { },
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
    active: item.label.toLowerCase() === resolvedActiveNav.toLowerCase(),
  }));

  const resolvedMobileTabItems = mobileTabItems.map((item) => ({
    ...item,
    active:
      (resolvedActiveNav?.toLowerCase() === "dashboard" && item.label.toLowerCase() === "home") ||
      (resolvedActiveNav?.toLowerCase() === "projects" && item.label.toLowerCase() === "projects") ||
      (resolvedActiveNav?.toLowerCase() === "ai suite" && item.label.toLowerCase() === "ai") ||
      (resolvedActiveNav?.toLowerCase() === "client portal" && item.label.toLowerCase() === "portal") ||
      (resolvedActiveNav?.toLowerCase() === "settings" && item.label.toLowerCase() === "settings"),
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

    Promise.resolve().then(() => {
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
    });
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

    const unsubscribe = subscribeToConsultantChange((updated) => {
      if (isMounted) {
        setConsultant(updated);
      }
    });

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
        clearCurrentConsultantCache();
        localStorage.removeItem("consultant");
        router.replace("/login");
      }
    }

    validateSession();

    return () => {
      isMounted = false;
      unsubscribe();
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
  const handleNavigation = () => {
    closeSidebar();
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
          <div className="logo-header">
            <div className="logo">
              <img src="/image/FLOXA_log.png" alt="FLOXA" className="logo-img" />
            </div>
            <button
              className="sidebar-close-btn"
              type="button"
              aria-label="Close navigation"
              onClick={closeSidebar}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
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
          <NavItem item={{ label: "LOGOUT", icon: "logout" }} onClick={handleLogout} />
        </div>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div
              className="avatar"
              style={{
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                flexShrink: 0,
              }}
            >
              {consultant?.avatar_url || consultant?.avatar ? (
                <img
                  key={consultant.avatar_url || consultant.avatar}
                  src={consultant.avatar_url || consultant.avatar}
                  alt={consultant?.name || "Consultant"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>{consultant?.name ? consultant.name.slice(0, 2).toUpperCase() : "AK"}</span>
              )}
            </div>
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
            <Menu size={18} strokeWidth={1.8} />
          </button>
          <div className="topbar-title">{title}</div>
          <div className="spacer" />
          <form className="search-wrap" onSubmit={handleProjectSearch}>
            <Search size={13} strokeWidth={2} />
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
