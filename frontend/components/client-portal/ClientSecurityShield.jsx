"use client";

import { useEffect } from "react";

/**
 * ClientSecurityShield (Silent Protection):
 * 1. Silently blocks developer shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, Ctrl+P).
 * 2. Silently disables right-click context menu across the portal.
 * 3. Silently wipes system clipboard on PrintScreen attempts.
 * 4. Silently hides page contents during print / save-to-pdf attempts (@media print).
 * 5. Prevents dragging and selecting images.
 * Zero visible UI popups, zero banners, zero annoying overlays.
 */
export function ClientSecurityShield({ isConsultant = false }) {
  useEffect(() => {
    if (isConsultant || typeof window === "undefined") {
      return undefined;
    }

    // 1. Injected styles for global drag/select/print protection
    const styleEl = document.createElement("style");
    styleEl.id = "floxa-security-shield-styles";
    styleEl.innerHTML = `
      body, .client-portal-shell {
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      img, canvas, .client-panel-image {
        -webkit-user-drag: none !important;
        user-drag: none !important;
      }
      @media print {
        html, body, .client-portal-shell {
          display: none !important;
          visibility: hidden !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    // 2. Multi-stage clipboard wiper
    const wipeClipboard = () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("").catch(() => {});
        }
      } catch {}
    };

    // 3. Silent keyboard shortcut blocker
    const handleKeyDown = (e) => {
      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      const keyCode = e.keyCode || e.which;

      // PrintScreen key - silently neutralize clipboard
      if (key === "printscreen" || code === "PrintScreen" || keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        wipeClipboard();
        setTimeout(wipeClipboard, 50);
        setTimeout(wipeClipboard, 150);
        setTimeout(wipeClipboard, 300);
        return false;
      }

      // F12
      if (key === "f12" || code === "F12" || keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl/Cmd + Shift + I/J/C
      if (cmdOrCtrl && e.shiftKey && (key === "i" || key === "j" || key === "c")) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl/Cmd + U (View source)
      if (cmdOrCtrl && key === "u") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl/Cmd + S (Save page)
      if (cmdOrCtrl && key === "s") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl/Cmd + P (Print)
      if (cmdOrCtrl && key === "p") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleKeyUp = (e) => {
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      const keyCode = e.keyCode || e.which;

      if (key === "printscreen" || code === "PrintScreen" || keyCode === 44) {
        wipeClipboard();
        setTimeout(wipeClipboard, 100);
      }
    };

    // 4. Context menu blocker
    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);

      const injectedStyle = document.getElementById("floxa-security-shield-styles");
      if (injectedStyle) {
        injectedStyle.remove();
      }
    };
  }, [isConsultant]);

  // Completely silent - no visible UI banners or messages
  return null;
}

export default ClientSecurityShield;
