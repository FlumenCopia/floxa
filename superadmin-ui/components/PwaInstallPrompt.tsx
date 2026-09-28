"use client";

import React from "react";
import { Download, X, Share2, PlusSquare, Shield, Smartphone } from "lucide-react";
import { usePwaInstall } from "../lib/pwa";

export default function PwaInstallPrompt() {
  const {
    isMounted,
    isInstalled,
    floatingDismissed,
    showIosGuide,
    promptInstall,
    dismissFloating,
    closeIosGuide,
  } = usePwaInstall();

  if (!isMounted || isInstalled) {
    return null;
  }

  return (
    <>
      {/* Floating PWA Card */}
      {!floatingDismissed ? (
        <aside
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "14px",
            backgroundColor: "rgba(6, 22, 15, 0.94)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(77, 255, 160, 0.28)",
            borderRadius: "12px",
            padding: "12px 16px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(77, 255, 160, 0.15)",
            maxWidth: "380px",
            animation: "slideUp 0.3s ease-out",
          }}
          aria-label="Install FLOXA SuperAdmin Application"
          role="complementary"
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              backgroundColor: "rgba(77, 255, 160, 0.12)",
              border: "1px solid rgba(77, 255, 160, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4dffa0",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Shield size={20} strokeWidth={2.2} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f3f8f4", letterSpacing: "-0.01em" }}>
              Install SuperAdmin App
            </div>
            <div style={{ fontSize: "11px", color: "#89aca0", marginTop: "2px", lineHeight: "1.3" }}>
              Full-screen console & offline telemetry
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={promptInstall}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "#4dffa0",
                color: "#001f11",
                border: "none",
                borderRadius: "6px",
                padding: "7px 12px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
              title="Install SuperAdmin App on this device"
            >
              <Download size={13} strokeWidth={2.4} />
              <span>Install</span>
            </button>

            <button
              type="button"
              onClick={dismissFloating}
              style={{
                background: "transparent",
                border: "none",
                color: "#607f72",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
              aria-label="Dismiss install prompt"
              title="Dismiss"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </aside>
      ) : null}

      {/* iOS Safari Home Screen Guide Modal */}
      {showIosGuide ? (
        <div
          onClick={closeIosGuide}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "rgba(6, 22, 15, 0.95)",
              border: "1px solid rgba(77, 255, 160, 0.28)",
              borderRadius: "14px",
              padding: "26px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(77, 255, 160, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#4dffa0",
                }}>
                  <Smartphone size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f3f8f4" }}>
                  Install on iOS
                </h3>
              </div>
              <button
                type="button"
                onClick={closeIosGuide}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#89aca0",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#89aca0", lineHeight: "1.5" }}>
              Follow these simple steps in Safari to add the SuperAdmin console to your home screen:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "13px", color: "#e8f5ef" }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(77, 255, 160, 0.15)",
                  color: "#4dffa0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  1
                </div>
                <div>
                  Tap the <strong>Share</strong> button <Share2 size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> in the Safari toolbar.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "13px", color: "#e8f5ef" }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(77, 255, 160, 0.15)",
                  color: "#4dffa0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  2
                </div>
                <div>
                  Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare size={13} style={{ display: "inline", verticalAlign: "-2px" }} />.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "13px", color: "#e8f5ef" }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(77, 255, 160, 0.15)",
                  color: "#4dffa0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  3
                </div>
                <div>
                  Tap <strong>Add</strong> in the top right corner.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={closeIosGuide}
              style={{
                width: "100%",
                backgroundColor: "#4dffa0",
                color: "#001f11",
                border: "none",
                borderRadius: "8px",
                padding: "10px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
