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
  ExternalLink,
} from "lucide-react";
import { adminApi } from "../services/api";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  const [announcement, setAnnouncement] = useState<any>(null);

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

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "Consultants & Agencies", href: "/consultants", icon: Users },
    { label: "Platform Projects", href: "/projects", icon: FolderKanban },
    { label: "Settings & Broadcast", href: "/settings", icon: Settings },
  ];

  return (
    <html lang="en">
      <head>
        <title>FLOXA SuperAdmin Platform</title>
        <meta name="description" content="FLOXA B2B Commercial SuperAdmin Panel" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #060d09;
            color: #f8fafc;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
          }
          a { color: inherit; text-decoration: none; }
          input, select, button { font-family: inherit; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </head>
      <body>
        {isLoginPage ? (
          children
        ) : !checked ? (
          <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#10b981",
            fontSize: "14px",
            gap: "10px",
          }}>
            <Shield className="spin" size={20} />
            <span>Verifying SuperAdmin Session...</span>
          </div>
        ) : (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Top Navigation Bar */}
            <header style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              backgroundColor: "rgba(6, 13, 9, 0.94)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid rgba(16, 185, 129, 0.2)",
              padding: "0 28px",
              height: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              {/* Brand & Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Link href="/" style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "1px", color: "#fff", textTransform: "uppercase" }}>
                  FLOXA
                </Link>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "3px 9px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  color: "#fde68a",
                }}>
                  <Shield size={12} color="#f59e0b" />
                  SuperAdmin
                </span>
                <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", fontWeight: 500 }}>
                  Port 3001
                </span>
              </div>

              {/* Center Nav */}
              <nav style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        transition: "all 0.2s",
                        backgroundColor: isActive ? "rgba(16, 185, 129, 0.15)" : "transparent",
                        color: isActive ? "#34d399" : "rgba(255, 255, 255, 0.65)",
                        border: isActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid transparent",
                      }}
                    >
                      <Icon size={15} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Right: Consultant Link & Sign Out */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noreferrer"
                  title="Open Consultant Workspace in new tab"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "rgba(255, 255, 255, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                  }}
                >
                  <span>Consultant App (3000)</span>
                  <ExternalLink size={12} />
                </a>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#34d399",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}>
                    {adminUser?.name ? adminUser.name.charAt(0).toUpperCase() : "A"}
                  </div>
                  <button
                    onClick={() => adminApi.logout()}
                    title="Sign Out"
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255, 255, 255, 0.5)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            </header>

            {/* Global Announcement Banner */}
            {announcement && announcement.isActive && announcement.message ? (
              <div style={{
                backgroundColor:
                  announcement.type === "warning"
                    ? "rgba(245, 158, 11, 0.15)"
                    : announcement.type === "success"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(59, 130, 246, 0.15)",
                borderBottom: `1px solid ${
                  announcement.type === "warning"
                    ? "rgba(245, 158, 11, 0.3)"
                    : announcement.type === "success"
                      ? "rgba(16, 185, 129, 0.3)"
                      : "rgba(59, 130, 246, 0.3)"
                }`,
                color:
                  announcement.type === "warning"
                    ? "#fbbf24"
                    : announcement.type === "success"
                      ? "#34d399"
                      : "#60a5fa",
                padding: "10px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                fontSize: "13px",
                fontWeight: 600,
              }}>
                <Megaphone size={16} />
                <span>{announcement.message}</span>
              </div>
            ) : null}

            {/* Main Content */}
            <main style={{ padding: "32px 28px", maxWidth: "1400px", width: "100%", margin: "0 auto", flex: 1 }}>
              {children}
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
