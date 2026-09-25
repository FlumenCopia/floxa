"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  LayoutDashboard,
  Users,
  FolderKanban,
  Settings,
  Megaphone,
  LogOut,
  Menu,
  X,
  User,
  Radio,
} from "lucide-react";
import { adminApi } from "../services/api";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  const [announcement, setAnnouncement] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) {
      setChecked(true);
      return;
    }

    const token = localStorage.getItem("floxa_admin_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    const storedUser = localStorage.getItem("floxa_admin_user");
    if (storedUser) {
      try {
        setAdminUser(JSON.parse(storedUser));
      } catch {}
    }

    // Verify token with backend
    adminApi
      .getMe()
      .then((res) => {
        if (res?.admin) setAdminUser(res.admin);
        setChecked(true);
      })
      .catch(() => {
        router.replace("/login");
      });

    // Check Global Announcement
    adminApi
      .getAnnouncement()
      .then((res) => {
        if (res?.announcement?.isActive) setAnnouncement(res.announcement);
      })
      .catch(() => {});
  }, [pathname, isLoginPage, router]);

  useEffect(() => {
    const handleAnnouncementRefresh = () => {
      adminApi
        .getAnnouncement()
        .then((res) => {
          if (res?.announcement?.isActive) setAnnouncement(res.announcement);
          else setAnnouncement(null);
        })
        .catch(() => {});
    };

    window.addEventListener("floxa:announcement_changed", handleAnnouncementRefresh);
    return () => window.removeEventListener("floxa:announcement_changed", handleAnnouncementRefresh);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  const navPlatform = [
    { label: "DASHBOARD", href: "/", icon: LayoutDashboard },
    { label: "CONSULTANTS & AGENCIES", href: "/consultants", icon: Users },
    { label: "PLATFORM PROJECTS", href: "/projects", icon: FolderKanban },
  ];

  const navGovernance = [
    { label: "SETTINGS & BROADCAST", href: "/settings", icon: Settings },
  ];

  const getPageTitle = () => {
    if (pathname === "/") return "DASHBOARD OVERVIEW";
    if (pathname === "/consultants") return "CONSULTANTS & AGENCIES";
    if (pathname === "/projects") return "PLATFORM PROJECTS";
    if (pathname === "/settings") return "PLATFORM SETTINGS";
    return "SUPERADMIN CONSOLE";
  };

  return (
    <html lang="en">
      <head>
        <title>FLOXA SuperAdmin Platform</title>
        <meta name="description" content="FLOXA B2B Commercial SuperAdmin Panel" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <style>{`
          :root {
            --background: #020806;
            --foreground: #e8f5ef;
            --bg: #020806;
            --surface: rgba(6, 22, 15, 0.72);
            --card: rgba(6, 22, 15, 0.72);
            --card2: rgba(8, 28, 19, 0.78);
            --border: rgba(77, 255, 160, 0.2);
            --border2: rgba(77, 255, 160, 0.28);
            --neon: #4dffa0;
            --neon-dim: rgba(77, 255, 160, 0.08);
            --neon-mid: rgba(77, 255, 160, 0.18);
            --muted: #89aca0;
            --dim: #4a6b5e;
            --danger: #ff6b6b;
            --amber: #f0b429;
            --cobalt: #4a9eff;
            --sidebar: 268px;
            --topbar: 60px;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          html, body {
            height: 100%;
            background: var(--bg);
            color: var(--foreground);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", sans-serif;
            font-size: 14px;
            line-height: 1.5;
            -webkit-text-size-adjust: 100%;
            -webkit-font-smoothing: antialiased;
          }

          a { color: inherit; text-decoration: none; }
          button, input, select, textarea { font-family: inherit; }

          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }

          /* Ambient Liquid Floxa Background */
          .floxa-ambient-bg {
            position: relative;
            isolation: isolate;
            background: #000704;
            min-height: 100vh;
            width: 100%;
          }

          .floxa-ambient-bg::before {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            margin: 0;
            z-index: -2;
            background: url("/client-design/banner1.png") center / cover no-repeat;
            background-attachment: fixed;
            opacity: 0.95;
            filter: brightness(1.1) contrast(1.12) saturate(1.2);
            pointer-events: none;
          }

          .floxa-ambient-bg::after {
            content: "";
            position: fixed;
            inset: 0;
            z-index: -1;
            background:
              radial-gradient(circle at 50% 35%, rgba(77, 255, 160, 0.12), transparent 55%),
              radial-gradient(circle at 50% 50%, rgba(0, 15, 8, 0.12), rgba(0, 7, 4, 0.55)),
              linear-gradient(180deg, rgba(0, 10, 6, 0.08) 0%, rgba(0, 7, 4, 0.48) 100%);
            pointer-events: none;
          }

          /* Shell Layout */
          .shell {
            display: flex;
            height: 100vh;
            width: 100vw;
            overflow: hidden;
            position: relative;
          }

          /* Sidebar */
          .sidebar {
            width: var(--sidebar);
            flex-shrink: 0;
            background: rgba(2, 14, 9, 0.45);
            backdrop-filter: blur(28px) saturate(160%) brightness(1.1);
            -webkit-backdrop-filter: blur(28px) saturate(160%) brightness(1.1);
            border-right: 1px solid rgba(255, 255, 255, 0.12);
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
            scrollbar-width: thin;
            scrollbar-color: rgba(77, 255, 160, 0.18) transparent;
            transition: transform 0.25s ease;
            z-index: 50;
            box-shadow:
              4px 0 32px rgba(0, 0, 0, 0.4),
              inset -1px 0 1px rgba(77, 255, 160, 0.14);
          }

          .sidebar::-webkit-scrollbar {
            width: 4px;
          }
          .sidebar::-webkit-scrollbar-thumb {
            background: rgba(77, 255, 160, 0.18);
            border-radius: 10px;
          }

          .sidebar-overlay {
            display: none;
          }

          .logo-area {
            padding: 20px 20px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            position: relative;
          }

          .logo-header {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            width: 100%;
          }

          .logo {
            display: flex;
            align-items: center;
            line-height: 1;
          }

          .logo-img {
            height: 24px;
            max-width: 120px;
            width: auto;
            object-fit: contain;
            display: block;
            filter: drop-shadow(0 2px 10px rgba(77, 255, 160, 0.25));
          }

          .logo-text {
            font-size: 19px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #4dffa0;
            text-transform: uppercase;
          }

          .sidebar-close-btn {
            display: none;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            padding: 6px;
            border-radius: 6px;
            align-items: center;
            justify-content: center;
          }

          .logo-tag {
            margin-top: 6px;
            font-size: 10px;
            color: #749b88;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .logo-tag-badge {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.35);
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
          }

          .nav-section {
            padding: 14px 0 8px;
          }

          .nav-lbl {
            padding: 0 20px 10px;
            font-size: 10px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #607f72;
            font-weight: 600;
          }

          .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: calc(100% - 20px);
            margin: 3px 10px;
            padding: 11px 16px;
            border-radius: 5px;
            border: 1px solid transparent;
            background: transparent;
            color: #9fbeaf;
            font-size: 13px;
            font-weight: 500;
            text-align: left;
            position: relative;
            cursor: pointer;
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            transition: all 0.2s ease;
          }

          .nav-item:hover {
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.28);
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(12px);
          }

          .nav-item.active {
            color: #ffffff;
            font-weight: 600;
            background: linear-gradient(135deg, rgba(77, 255, 160, 0.14) 0%, rgba(77, 255, 160, 0.03) 100%);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(77, 255, 160, 0.45);
            box-shadow: 0 0 20px rgba(77, 255, 160, 0.12);
          }

          .nav-item.active .nav-icon {
            color: #4dffa0;
            filter: drop-shadow(0 0 8px rgba(77, 255, 160, 0.5));
          }

          .nav-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            color: inherit;
          }

          .sidebar-footer {
            margin-top: auto;
            padding: 16px 14px 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
          }

          .user-chip {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.09);
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            transition: all 0.2s ease;
          }

          .user-chip:hover {
            background: rgba(255, 255, 255, 0.07);
            border-color: rgba(255, 255, 255, 0.18);
          }

          .avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(77, 255, 160, 0.12);
            border: 1px solid rgba(77, 255, 160, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            color: #4dffa0;
            flex-shrink: 0;
          }

          .user-name {
            font-size: 12px;
            font-weight: 600;
            color: #f3f8f4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 140px;
          }

          .user-plan {
            margin-top: 2px;
            font-size: 9px;
            color: #749b88;
            text-transform: uppercase;
            letter-spacing: 0.14em;
          }

          /* Main Area */
          .main {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }

          /* Topbar */
          .topbar {
            height: var(--topbar);
            background: rgba(4, 18, 12, 0.55);
            backdrop-filter: blur(28px) saturate(150%) brightness(1.06);
            -webkit-backdrop-filter: blur(28px) saturate(150%) brightness(1.06);
            border-bottom: 1px solid rgba(255, 255, 255, 0.09);
            display: flex;
            align-items: center;
            padding: 0 24px;
            gap: 14px;
            min-width: 0;
            z-index: 20;
            flex-shrink: 0;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          }

          .menu-btn {
            display: none;
            width: 34px;
            height: 34px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: var(--muted);
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
          }

          .menu-btn:hover {
            background: var(--neon-dim);
            color: var(--foreground);
          }

          .topbar-title {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: #f4f8f4;
            min-width: 0;
            white-space: nowrap;
            text-transform: uppercase;
          }

          .spacer {
            flex: 1;
            min-width: 0;
          }

          .content-scroll {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 28px;
            scrollbar-width: thin;
            scrollbar-color: rgba(77, 255, 160, 0.2) transparent;
          }

          .content-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .content-scroll::-webkit-scrollbar-thumb {
            background: rgba(77, 255, 160, 0.2);
            border-radius: 10px;
          }

          @media (max-width: 1000px) {
            .sidebar {
              position: fixed;
              top: 0;
              left: 0;
              bottom: 0;
              transform: translateX(-100%);
            }
            .sidebar.open {
              transform: translateX(0);
            }
            .sidebar-overlay {
              display: none;
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.7);
              backdrop-filter: blur(4px);
              z-index: 45;
            }
            .sidebar-overlay.open {
              display: block;
            }
            .menu-btn {
              display: inline-flex;
            }
            .sidebar-close-btn {
              display: inline-flex;
            }
          }
        `}</style>
      </head>
      <body>
        {isLoginPage ? (
          children
        ) : !checked ? (
          <div className="floxa-ambient-bg" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4dffa0",
            fontSize: "14px",
            gap: "10px",
          }}>
            <Shield className="spin" size={22} />
            <span style={{ fontWeight: 600, letterSpacing: "0.5px" }}>Loading SuperAdmin Console...</span>
          </div>
        ) : (
          <div className="floxa-ambient-bg">
            <div className="shell">
              {/* Mobile overlay */}
              <div
                className={`sidebar-overlay ${isSidebarOpen ? "open" : ""}`}
                onClick={() => setIsSidebarOpen(false)}
                aria-hidden="true"
              />

              {/* Sidebar */}
              <nav className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
                <div className="logo-area">
                  <div className="logo-header">
                    <Link href="/" className="logo">
                      <img
                        src="/image/FLOXA_log.png"
                        alt="FLOXA"
                        className="logo-img"
                        onError={(e) => {
                          // Fallback to text if image not found
                          (e.target as HTMLElement).style.display = "none";
                          const txt = document.getElementById("floxa-logo-fallback");
                          if (txt) txt.style.display = "block";
                        }}
                      />
                      <span id="floxa-logo-fallback" className="logo-text" style={{ display: "none" }}>
                        FLOXA
                      </span>
                    </Link>
                    <button
                      className="sidebar-close-btn"
                      type="button"
                      aria-label="Close navigation"
                      onClick={() => setIsSidebarOpen(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="logo-tag">
                    <span>Platform</span>
                    <span className="logo-tag-badge">SuperAdmin</span>
                  </div>
                </div>

                <div className="nav-section">
                  <div className="nav-lbl">Platform</div>
                  {navPlatform.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? "active" : ""}`}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <Icon className="nav-icon" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="nav-section">
                  <div className="nav-lbl">Governance</div>
                  {navGovernance.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${isActive ? "active" : ""}`}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <Icon className="nav-icon" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="nav-section">
                  <button
                    type="button"
                    onClick={() => adminApi.logout()}
                    className="nav-item"
                    style={{ border: "none", width: "calc(100% - 20px)" }}
                  >
                    <LogOut className="nav-icon" />
                    <span>Sign Out</span>
                  </button>
                </div>

                <div className="sidebar-footer">
                  <div className="user-chip">
                    <div className="avatar">
                      {adminUser?.name ? adminUser.name.charAt(0).toUpperCase() : "A"}
                    </div>
                    <div>
                      <div className="user-name">{adminUser?.name || "SuperAdmin"}</div>
                      <div className="user-plan">Master Console</div>
                    </div>
                  </div>
                </div>
              </nav>

              {/* Main Column */}
              <div className="main">
                {/* Topbar */}
                <header className="topbar">
                  <button
                    className="menu-btn"
                    type="button"
                    aria-label="Open sidebar"
                    onClick={() => setIsSidebarOpen((open) => !open)}
                  >
                    <Menu size={18} />
                  </button>

                  <div className="topbar-title">{getPageTitle()}</div>

                  <div className="spacer" />

                  {/* Live Status Pill */}
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(77, 255, 160, 0.08)",
                    border: "1px solid rgba(77, 255, 160, 0.25)",
                    color: "#4dffa0",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#4dffa0", display: "inline-block", boxShadow: "0 0 6px #4dffa0" }} />
                    <span>Live Platform</span>
                  </div>



                  {/* Sign Out */}
                  <button
                    onClick={() => adminApi.logout()}
                    title="Sign Out"
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255, 255, 255, 0.5)",
                      cursor: "pointer",
                      padding: "6px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <LogOut size={16} />
                  </button>
                </header>

                {/* Global Announcement Banner */}
                {announcement && announcement.isActive && announcement.message ? (
                  <div style={{
                    backgroundColor:
                      announcement.type === "warning"
                        ? "rgba(245, 158, 11, 0.15)"
                        : announcement.type === "success"
                          ? "rgba(77, 255, 160, 0.15)"
                          : "rgba(74, 158, 255, 0.15)",
                    borderBottom: `1px solid ${
                      announcement.type === "warning"
                        ? "rgba(245, 158, 11, 0.3)"
                        : announcement.type === "success"
                          ? "rgba(77, 255, 160, 0.3)"
                          : "rgba(74, 158, 255, 0.3)"
                    }`,
                    color:
                      announcement.type === "warning"
                        ? "#f0b429"
                        : announcement.type === "success"
                          ? "#4dffa0"
                          : "#4a9eff",
                    padding: "8px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                  }}>
                    <Megaphone size={14} />
                    <span>{announcement.message}</span>
                  </div>
                ) : null}

                {/* Main Content Area */}
                <div className="content-scroll">
                  <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
