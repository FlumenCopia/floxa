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
  Download,
} from "lucide-react";
import { adminApi } from "../services/api";
import PwaProvider from "../components/PwaProvider";
import { usePwaInstall } from "../lib/pwa";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<any>(null);
  const [checked, setChecked] = useState(false);
  const [announcement, setAnnouncement] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isMounted, isInstalled, promptInstall } = usePwaInstall();

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4dffa0" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FLOXA Admin" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
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

          /* Mobile Phone Responsive Optimizations */
          @media (max-width: 768px) {
            .topbar {
              padding: 0 12px;
              gap: 8px;
              height: 52px;
            }
            .topbar-live-badge,
            .topbar-install-btn {
              display: none !important;
            }
            .topbar-title {
              font-size: 12px;
              max-width: 180px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .content-scroll {
              padding: 14px 12px;
            }
          }

          /* Responsive Layout Components */
          .admin-page-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            margin-bottom: 20px;
            flex-wrap: wrap;
          }
          @media (max-width: 640px) {
            .admin-page-header {
              flex-direction: column;
              align-items: stretch;
              gap: 12px;
              margin-bottom: 16px;
            }
          }

          .admin-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          @media (max-width: 640px) {
            .admin-header-actions {
              width: 100%;
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
              gap: 8px;
            }
            .admin-header-actions button,
            .admin-header-actions a {
              justify-content: center;
              padding: 9px 12px !important;
              font-size: 12px !important;
            }
          }

          .admin-filter-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          @media (max-width: 640px) {
            .admin-filter-bar {
              flex-direction: column;
              align-items: stretch;
              gap: 10px;
            }
            .admin-filter-bar form {
              width: 100% !important;
              min-width: 0 !important;
            }
            .admin-filter-bar select {
              width: 100% !important;
            }
          }

          .admin-table-wrapper {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .admin-table {
            width: 100%;
            min-width: 680px;
            border-collapse: collapse;
          }

          .admin-card {
            background-color: rgba(6, 22, 15, 0.72);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(77, 255, 160, 0.2);
            border-radius: 10px;
            padding: 20px 22px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          }
          @media (max-width: 640px) {
            .admin-card {
              padding: 16px 14px;
              margin-bottom: 16px;
            }
          }

          .admin-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
          }
          @media (max-width: 640px) {
            .admin-stats-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
            }
          }
          @media (max-width: 420px) {
            .admin-stats-grid {
              grid-template-columns: 1fr;
              gap: 10px;
            }
          }

          .admin-stat-ribbon {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 18px;
          }
          @media (max-width: 640px) {
            .admin-stat-ribbon {
              grid-template-columns: repeat(2, 1fr);
              gap: 8px;
            }
          }

          .admin-two-col-grid {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 20px;
            margin-bottom: 24px;
          }
          @media (max-width: 900px) {
            .admin-two-col-grid {
              grid-template-columns: 1fr;
              gap: 16px;
              margin-bottom: 20px;
            }
          }

          .admin-tabs-scroll {
            display: flex;
            align-items: center;
            gap: 4px;
            overflow-x: auto;
            white-space: nowrap;
            -webkit-overflow-scrolling: touch;
            border-bottom: 1px solid rgba(77, 255, 160, 0.15);
            margin-bottom: 18px;
            padding-bottom: 2px;
            scrollbar-width: none;
          }
          .admin-tabs-scroll::-webkit-scrollbar {
            display: none;
          }

          .admin-form-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
          }
          @media (max-width: 540px) {
            .admin-form-grid-2 {
              grid-template-columns: 1fr;
              gap: 10px;
              margin-bottom: 10px;
            }
          }

          .admin-modal-card {
            background-color: #06160f;
            border: 1px solid rgba(77, 255, 160, 0.25);
            border-radius: 12px;
            width: 100%;
            max-width: 520px;
            padding: 24px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
            position: relative;
            max-height: 92vh;
            overflow-y: auto;
          }
          @media (max-width: 540px) {
            .admin-modal-card {
              padding: 16px 14px;
              max-height: 95vh;
            }
          }

          /* FLOXA Login Studio Theme for SuperAdmin */
          #login-screen {
            position: relative;
            isolation: isolate;
            min-height: 100dvh;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: clamp(24px, 4vw, 40px);
            background: #000704;
          }

          #login-screen::before {
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

          #login-screen::after {
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

          .login-card {
            position: relative;
            width: min(1060px, 92vw);
            min-height: 560px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: clamp(64px, 7vw, 96px) clamp(44px, 6vw, 84px);
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-left: none;
            border-right: none;
            border-radius: 44px;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 40%), rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(28px) saturate(130%) brightness(0.96);
            -webkit-backdrop-filter: blur(28px) saturate(130%) brightness(0.96);
            box-shadow:
              0 40px 100px rgba(0, 0, 0, 0.7),
              inset 0 1px 1px rgba(255, 255, 255, 0.18),
              inset 0 -1px 1px rgba(0, 0, 0, 0.5);
          }

          .login-card.is-login-mode {
            width: min(1200px, 95vw);
            min-height: 580px;
            padding: clamp(52px, 5.5vw, 76px) clamp(48px, 6vw, 88px);
          }

          .login-stage-track {
            display: grid;
            grid-template-columns: 1fr;
            grid-template-rows: 1fr;
            width: 100%;
            align-items: center;
            justify-items: center;
          }

          .login-stage-view {
            grid-area: 1 / 1 / 2 / 2;
            width: 100%;
          }

          .login-access-wrap {
            width: 100%;
            display: grid;
            grid-template-columns: 1.05fr 0.95fr;
            gap: clamp(32px, 5vw, 64px);
            align-items: center;
          }

          .login-access-wrap.slide-in-view .login-access-intro {
            animation: login-left-slide-in 0.85s cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .login-access-wrap.slide-in-view .login-pill-form {
            animation: login-right-slide-in 0.85s cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          @keyframes login-right-slide-in {
            from { opacity: 0; transform: translateX(42px); }
            to { opacity: 1; transform: translateX(0); }
          }

          @keyframes login-left-slide-in {
            from { opacity: 0; transform: translateX(-32px); }
            to { opacity: 1; transform: translateX(0); }
          }

          .login-access-intro {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            text-align: left;
          }

          .login-brand-logo {
            margin-bottom: 8px;
            display: flex;
            justify-content: flex-start;
            align-items: center;
          }

          .login-brand-logo-img {
            max-width: min(420px, 82vw);
            height: clamp(68px, 8.5vw, 94px);
            width: auto;
            object-fit: contain;
            filter: drop-shadow(0 14px 36px rgba(0, 0, 0, 0.65));
          }

          .login-brand-subtitle {
            margin: 14px 0 32px;
            color: rgba(255, 255, 255, 0.9);
            font-size: clamp(18px, 2.4vw, 26px);
            font-weight: 300;
            letter-spacing: 0.04em;
            text-align: inherit;
          }

          .login-admin-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            min-height: 48px;
            padding: 12px 28px;
            border: 1px solid rgba(255, 255, 255, 0.24);
            border-radius: 999px;
            color: #ffffff;
            background: linear-gradient(135deg, rgba(28, 56, 46, 0.88), rgba(12, 28, 22, 0.94));
            font-size: 14px;
            font-weight: 500;
            letter-spacing: 0.03em;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
          }

          .login-admin-badge-icon {
            display: grid;
            width: 24px;
            height: 24px;
            place-items: center;
            border-radius: 50%;
            border: 1px solid rgba(77, 255, 160, 0.35);
            background: rgba(77, 255, 160, 0.1);
            color: #4dffa0;
          }

          .login-pill-form {
            display: flex;
            flex-direction: column;
            gap: 13px;
            width: 100%;
          }

          .login-pill-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
            width: 100%;
            background: #ffffff;
            border-radius: 999px;
            height: 52px;
            padding: 0 18px;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
            transition: box-shadow 0.2s ease, transform 0.2s ease;
          }

          .login-pill-input-wrap:focus-within {
            box-shadow: 0 6px 24px rgba(77, 255, 160, 0.28), 0 0 0 2px rgba(77, 255, 160, 0.4);
            transform: translateY(-1px);
          }

          .login-pill-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6b7280;
            margin-right: 10px;
            flex-shrink: 0;
          }

          .login-pill-input {
            width: 100%;
            border: none;
            outline: none;
            background: transparent;
            color: #111827;
            font-size: 15px;
            font-weight: 500;
          }

          .login-pill-input::placeholder {
            color: #9ca3af;
            font-weight: 400;
          }

          .login-pill-eye-btn {
            background: none;
            border: none;
            color: #6b7280;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            margin-left: 6px;
            flex-shrink: 0;
          }

          .login-pill-eye-btn:hover {
            color: #111827;
          }

          .login-pill-submit-btn {
            width: 100%;
            height: 52px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.24);
            background: linear-gradient(135deg, rgba(28, 56, 46, 0.95), rgba(14, 32, 25, 0.95));
            color: #ffffff;
            font-size: 15px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            cursor: pointer;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
            transition: all 0.22s ease;
          }

          .login-pill-submit-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            border-color: rgba(255, 255, 255, 0.4);
            filter: brightness(1.15);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38);
          }

          .login-pill-submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .login-btn-arrow {
            display: grid;
            width: 24px;
            height: 24px;
            place-items: center;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.3);
            background: rgba(255, 255, 255, 0.08);
          }

          .login-error-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(239, 68, 68, 0.14);
            border: 1px solid rgba(239, 68, 68, 0.35);
            color: #fca5a5;
            padding: 10px 16px;
            border-radius: 999px;
            font-size: 13px;
          }

          .login-terms-note {
            text-align: center;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.48);
            line-height: 1.45;
            margin-top: 2px;
          }

          @media (max-width: 900px) {
            #login-screen {
              padding: 20px 14px;
            }
            .login-card.is-login-mode {
              width: 100%;
              max-width: 580px;
              min-height: auto;
              padding: 40px 24px 32px;
              border-radius: 36px;
            }
            .login-access-wrap {
              grid-template-columns: 1fr;
              gap: 22px;
              text-align: center;
            }
            .login-access-intro {
              align-items: center;
              text-align: center;
            }
            .login-brand-logo {
              justify-content: center;
            }
            .login-brand-subtitle {
              text-align: center;
              margin-bottom: 18px;
            }
            .login-pill-form {
              max-width: 100%;
            }
          }

          @media (max-width: 600px) {
            #login-screen {
              padding: 14px 10px;
              min-height: 100dvh;
            }
            .login-card.is-login-mode {
              width: 100% !important;
              max-width: 100% !important;
              min-height: auto !important;
              padding: 30px 16px 24px !important;
              border-radius: 28px !important;
            }
            .login-access-intro .login-brand-logo-img {
              height: clamp(42px, 11vw, 56px);
              max-width: 74vw;
            }
            .login-brand-subtitle {
              font-size: 14px;
              margin: 8px 0 18px;
              line-height: 1.4;
            }
            .login-pill-form {
              gap: 11px;
            }
            .login-pill-input-wrap {
              height: 46px;
              padding: 0 16px 0 14px;
            }
            .login-pill-submit-btn {
              height: 46px;
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
                  {isMounted && !isInstalled && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSidebarOpen(false);
                        promptInstall();
                      }}
                      className="nav-item"
                      style={{
                        border: "1px dashed rgba(77, 255, 160, 0.4)",
                        background: "rgba(77, 255, 160, 0.06)",
                        color: "#4dffa0",
                        marginBottom: "6px",
                      }}
                    >
                      <Download className="nav-icon" style={{ color: "#4dffa0" }} />
                      <span>Install App</span>
                    </button>
                  )}
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
                  <div
                    className="topbar-live-badge"
                    style={{
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
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#4dffa0", display: "inline-block", boxShadow: "0 0 6px #4dffa0" }} />
                    <span>Live Platform</span>
                  </div>

                  {/* Install App Button */}
                  {isMounted && !isInstalled && (
                    <button
                      className="topbar-install-btn"
                      onClick={() => promptInstall()}
                      title="Install SuperAdmin App"
                      style={{
                        backgroundColor: "rgba(77, 255, 160, 0.08)",
                        border: "1px solid rgba(77, 255, 160, 0.3)",
                        borderRadius: "8px",
                        color: "#4dffa0",
                        cursor: "pointer",
                        padding: "5px 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <Download size={13} />
                      <span>Install App</span>
                    </button>
                  )}

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
        <PwaProvider />
      </body>
    </html>
  );
}
