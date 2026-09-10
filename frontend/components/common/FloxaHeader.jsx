"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentConsultant, logoutConsultant, subscribeToConsultantChange, clearCurrentConsultantCache } from "@/lib/authApi";
import { getConsultantActivities, markConsultantActivitiesRead, markProjectActivitiesRead, invalidateConsultantActivitiesCache } from "@/lib/projectApi";
import { showError, showSuccess } from "@/lib/toast";
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
  User,
  Video,
  Phone,
  PhoneOff,
} from "lucide-react";
import { supportSocket } from "@/services/supportSocketService";
import { webRTCService } from "@/services/webRTCService";
import { VideoCallModal } from "@/components/client-portal/VideoCallModal";
import "@/components/client-portal/ClientPortal.css";

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
  client_help_requested: "discovery",
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

function Icon({ type, size, strokeWidth }) {
  switch (type) {
    case "grid":
      return <LayoutDashboard size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "mail":
      return <FolderKanban size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "search":
      return <Compass size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "star":
      return <Sparkles size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "chart":
      return <BarChart3 size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "portal":
      return <ExternalLink size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "settings":
      return <Settings size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    case "bell":
      return <Bell size={size || 24} strokeWidth={strokeWidth || 2} />;
    case "logout":
      return <LogOut size={size || 16} strokeWidth={strokeWidth || 1.8} />;
    default:
      return <LayoutDashboard size={size || 16} strokeWidth={strokeWidth || 1.8} />;
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

  const [callState, setCallState] = useState("idle");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("floxa_jwt") ||
          localStorage.getItem("floxa_token") ||
          "active"
        : "";
    if (token || consultant?.id) {
      supportSocket.connectConsultantNotifications({ consultantToken: token, consultantId: consultant?.id });
    }

    return webRTCService.on("state_change", (state) => {
      setCallState(state);
    });
  }, []);

  const handleNavbarVideoClick = () => {
    if (callState === "incoming_ringing") {
      webRTCService.acceptCall();
    } else if (callState === "connected") {
      // active
    } else {
      const targetNotif = visibleNotifications.find(
        (n) => n.project_id || n.metadata?.project_id
      );
      const targetProjectId =
        targetNotif?.project_id || targetNotif?.metadata?.project_id;
      if (targetProjectId) {
        webRTCService.initiateCall({
          projectId: targetProjectId,
          clientName:
            targetNotif?.client_name ||
            targetNotif?.metadata?.client_name ||
            "Client",
          projectTitle:
            targetNotif?.project_title ||
            targetNotif?.metadata?.project_title ||
            "Project",
          role: "consultant",
        });
      } else {
        router.push("/client-portal");
      }
    }
  };

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

    // Connect consultant global WebSocket notification listener
    const consultantJwt = typeof window !== "undefined" ? (localStorage.getItem("floxa_jwt") || localStorage.getItem("access") || "active") : "";
    supportSocket.connectConsultantNotifications({ consultantToken: consultantJwt, consultantId: consultant?.id });

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

    const unsubscribeLiveHelp = supportSocket.on("help_requested", (data) => {
      if (!isMounted) return;
      const clientName = data.client_name || "Client";
      const projectTitle = data.project_title ? ` (${data.project_title})` : "";
      const stepLabel = data.page_id || "a step";
      const questionText = data.question ? `: "${data.question}"` : "";

      const newNotification = {
        id: Date.now(),
        action: "client_help_requested",
        description: `💬 ${clientName}${projectTitle} needs help on ${stepLabel}${questionText}`,
        is_read: false,
        created_at: new Date().toISOString(),
        portal_token: data.portal_token,
        project_id: data.project_id,
        metadata: {
          portal_token: data.portal_token,
          project_id: data.project_id,
          page_id: data.page_id,
        },
      };

      setHeaderNotifications((current) => [newNotification, ...current]);
      showSuccess(`💬 ${clientName} needs help on ${stepLabel}${questionText}`);
    });

    const unsubscribeLiveNotif = supportSocket.on("notification", (activity) => {
      if (!isMounted || !activity) return;

      invalidateConsultantActivitiesCache();

      setHeaderNotifications((current) => {
        const exists = current.some((n) => n.id === activity.id);
        if (exists) {
          return current.map((n) => (n.id === activity.id ? activity : n));
        }
        return [activity, ...current];
      });

      if (!activity.is_read && activity.actor_type !== "consultant") {
        showSuccess(activity.description || "New project activity");
      }
    });

    return () => {
      isMounted = false;
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
      unsubscribeLiveHelp();
      unsubscribeLiveNotif();
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

  const handleNotificationItemClick = async (notification) => {
    setIsNotificationOpen(false);

    if (notification?.id) {
      setHeaderNotifications((current) =>
        current.map((n) =>
          n.id === notification.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );

      const projectId = getNotificationProjectId(notification);
      if (projectId) {
        markProjectActivitiesRead(projectId, notification.action ? [notification.action] : undefined).catch(() => {});
      }
    }

    if (notification?.action === "client_help_requested" && (notification?.portal_token || notification?.metadata?.portal_token)) {
      const token = notification.portal_token || notification.metadata.portal_token;
      router.push(`/client/${token}?mode=consultant&consultant=true`);
      return;
    }

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

    if (nextOpen && onNotificationsOpen && typeof onNotificationsOpen === "function") {
      try {
        await onNotificationsOpen();
      } catch (error) {
        console.error("Failed to call onNotificationsOpen:", error);
      }
    }
  };

  const handleMarkAllRead = async () => {
    markHeaderNotificationsRead();

    try {
      await markConsultantActivitiesRead();
      invalidateConsultantActivitiesCache();
    } catch (error) {
      console.error("Failed to mark consultant notifications as read:", error);
      await loadHeaderNotifications();
    }

    if (onMarkNotificationsRead && typeof onMarkNotificationsRead === "function") {
      try {
        await onMarkNotificationsRead();
      } catch (error) {
        console.error("Failed in custom onMarkNotificationsRead:", error);
      }
    }
  };

  const handleOpenLogoutModal = () => {
    setIsLogoutModalOpen(true);
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutConsultant();
      showSuccess("Logout successful.");
    } catch (error) {
      console.error("Logout failed:", error);
      showError(error?.detail || "Logout failed.");
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
      localStorage.removeItem("consultant");
      setHeaderNotifications([]);
      closeSidebar();
      router.push("/login");
    }
  };

  useEffect(() => {
    if (!isLogoutModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isLoggingOut) {
        setIsLogoutModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLogoutModalOpen, isLoggingOut]);

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
          <NavItem item={{ label: "LOGOUT", icon: "logout" }} onClick={handleOpenLogoutModal} />
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
                <User size={18} strokeWidth={2} />
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
          {callState === "incoming_ringing" ? (
            <div className="floxa-nav-incoming-call-group">
              <span className="floxa-nav-ringing-indicator">
                <Video size={13} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
                Incoming: <strong>{webRTCService.currentCallInfo?.clientName || "Client"}</strong>
              </span>
              <button
                type="button"
                className="floxa-nav-btn-pick"
                title="Accept Call"
                onClick={() => webRTCService.acceptCall()}
              >
                <Phone size={12} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "3px" }} /> Pick
              </button>
              <button
                type="button"
                className="floxa-nav-btn-deny"
                title="Decline Call"
                onClick={() => webRTCService.rejectCall()}
              >
                <PhoneOff size={12} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "3px" }} /> Deny
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`floxa-nav-video-btn ${callState === "connected" ? "in-call" : ""}`}
              title={callState === "connected" ? "Active Video Call" : "Video Call"}
              onClick={handleNavbarVideoClick}
            >
              <Video size={24} strokeWidth={2} />
            </button>
          )}
          <div className="notification-wrap">
            <button
              className="icon-btn"
              type="button"
              aria-label={visibleNotificationCount ? `${visibleNotificationCount} notifications` : "No notifications"}
              aria-expanded={isNotificationOpen}
              onClick={handleNotificationToggle}
              style={{ position: "relative" }}
            >
              <Icon type="bell" size={24} strokeWidth={2} />
              {visibleNotificationCount > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    right: "3px",
                    minWidth: "16px",
                    height: "16px",
                    padding: "0 4px",
                    borderRadius: "999px",
                    background: "#10b981",
                    color: "#02231c",
                    fontSize: "10px",
                    fontWeight: "800",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                    boxShadow: "0 0 8px rgba(16, 185, 129, 0.6)",
                    pointerEvents: "none",
                  }}
                >
                  {visibleNotificationCount > 10 ? "10+" : visibleNotificationCount}
                </span>
              ) : null}
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

      <VideoCallModal currentRole="consultant" />

      {isLogoutModalOpen ? (
        <div
          className="floxa-logout-overlay"
          onClick={() => {
            if (!isLoggingOut) setIsLogoutModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="floxa-logout-title"
        >
          <div
            className="floxa-logout-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="floxa-logout-icon-wrap" aria-hidden="true">
              <LogOut size={24} strokeWidth={2.2} />
            </div>
            <h3 id="floxa-logout-title" className="floxa-logout-title">
              Log Out
            </h3>
            <p className="floxa-logout-desc">
              Are you sure you want to log out of your FLOXA account?
            </p>
            <div className="floxa-logout-actions">
              <button
                type="button"
                className="floxa-logout-btn-cancel"
                onClick={() => setIsLogoutModalOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="floxa-logout-btn-confirm"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Log Out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mobile-tabbar">
        {resolvedMobileTabItems.map((item) => (
          <MobileTabItem key={item.label} item={item} onClick={() => handleNavigation(item.route)} />
        ))}
      </div>
    </>
  );
}
