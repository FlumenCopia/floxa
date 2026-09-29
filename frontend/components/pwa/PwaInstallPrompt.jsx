"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Download, X, Share2, PlusSquare, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa";

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const {
    isMounted,
    isInstalled,
    floatingDismissed,
    showIosGuide,
    promptInstall,
    dismissFloating,
    closeIosGuide,
  } = usePwaInstall();

  // Exclude client portal, reset-password, and forgot-password flows from showing install prompts
  const currentPath = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  const isExcludedRoute = Boolean(
    currentPath.startsWith("/client") ||
    currentPath.startsWith("/reset-password") ||
    currentPath.startsWith("/forgot-password")
  );

  // If running on server, app is already installed, or on an excluded route, do not render anything
  if (!isMounted || isInstalled || isExcludedRoute) {
    return null;
  }

  return (
    <>
      {/* Floating in-app PWA install pill/card */}
      {!floatingDismissed ? (
        <aside
          className="floxa-pwa-floating"
          aria-label="Install FLOXA Application"
          role="complementary"
        >
          <div className="floxa-pwa-icon-box" aria-hidden="true">
            <Download size={20} strokeWidth={2.2} />
          </div>

          <div className="floxa-pwa-text">
            <div className="floxa-pwa-title">Install FLOXA App</div>
            <div className="floxa-pwa-desc">Full-screen &amp; offline brand workspace</div>
          </div>

          <div className="floxa-pwa-actions">
            <button
              type="button"
              className="floxa-pwa-btn-install"
              onClick={promptInstall}
              title="Install FLOXA on this device"
            >
              <Download size={13} strokeWidth={2.4} />
              <span>Install</span>
            </button>

            <button
              type="button"
              className="floxa-pwa-btn-dismiss"
              onClick={dismissFloating}
              aria-label="Dismiss install prompt"
              title="Dismiss for now"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </aside>
      ) : null}

      {/* iOS Safari Home Screen Instructions Modal */}
      {showIosGuide ? (
        <div
          className="floxa-logout-overlay"
          onClick={closeIosGuide}
          role="dialog"
          aria-modal="true"
          aria-labelledby="floxa-ios-install-title"
        >
          <div
            className="floxa-logout-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "440px" }}
          >
            <div
              className="floxa-logout-icon-wrap"
              style={{
                background: "rgba(77, 255, 160, 0.12)",
                borderColor: "rgba(77, 255, 160, 0.35)",
                color: "#4dffa0",
                boxShadow: "0 0 24px rgba(77, 255, 160, 0.2)",
              }}
              aria-hidden="true"
            >
              <Smartphone size={24} strokeWidth={2.2} />
            </div>

            <h3 id="floxa-ios-install-title" className="floxa-logout-title">
              Install FLOXA on iPhone / iPad
            </h3>

            <p className="floxa-logout-desc" style={{ marginBottom: "20px" }}>
              Install the FLOXA progressive web app to your home screen for quick offline access and full-screen workspace.
            </p>

            <div style={{ margin: "0 0 24px" }}>
              <div className="floxa-ios-step">
                <span className="floxa-ios-step-num">1</span>
                <span className="floxa-ios-step-text">
                  Tap the <strong>Share</strong> button <Share2 size={13} style={{ display: "inline", verticalAlign: "middle" }} /> at the bottom or top of Safari.
                </span>
              </div>

              <div className="floxa-ios-step">
                <span className="floxa-ios-step-num">2</span>
                <span className="floxa-ios-step-text">
                  Scroll down the share sheet and tap <strong>Add to Home Screen</strong> <PlusSquare size={13} style={{ display: "inline", verticalAlign: "middle" }} />.
                </span>
              </div>

              <div className="floxa-ios-step">
                <span className="floxa-ios-step-num">3</span>
                <span className="floxa-ios-step-text">
                  Tap <strong>Add</strong> in the top-right corner to complete installation.
                </span>
              </div>
            </div>

            <div className="floxa-logout-actions">
              <button
                type="button"
                className="floxa-pwa-btn-install"
                onClick={closeIosGuide}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  padding: "11px 18px",
                  fontSize: "14px",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
