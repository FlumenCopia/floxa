"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { showInfo } from "./toast";

// Check if running in standalone PWA mode
export const checkIsStandalone = () => {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true ||
    document.referrer?.includes("android-app://") ||
    localStorage?.getItem("floxa_pwa_installed") === "true"
  );
};

// Check if iOS device
export const checkIsIos = () => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

let deferredPrompt = null;
const listeners = new Set();

let state = {
  isInstalled: false,
  canInstall: false,
  isIos: false,
  showIosGuide: false,
  floatingDismissed: false,
};

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error("[FLOXA PWA] Listener error:", err);
    }
  });
};

// Initialize listeners on client side
if (typeof window !== "undefined") {
  const isStandalone = checkIsStandalone();
  const isIos = checkIsIos();
  let floatingDismissed = false;
  try {
    floatingDismissed = sessionStorage.getItem("floxa_pwa_floating_dismissed") === "true";
  } catch {}

  state = {
    isInstalled: isStandalone,
    canInstall: !isStandalone,
    isIos,
    showIosGuide: false,
    floatingDismissed,
  };

  // Listen for beforeinstallprompt event from modern browsers
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (
      window.location.pathname.startsWith("/client") ||
      window.location.pathname.startsWith("/reset-password") ||
      window.location.pathname.startsWith("/forgot-password")
    ) {
      return;
    }
    deferredPrompt = e;
    state = {
      ...state,
      isInstalled: false,
      canInstall: true,
    };
    notify();
  });

  // Listen for appinstalled event
  window.addEventListener("appinstalled", () => {
    state = {
      ...state,
      isInstalled: true,
      canInstall: false,
    };
    deferredPrompt = null;
    try {
      localStorage.setItem("floxa_pwa_installed", "true");
    } catch {}
    notify();
  });

  // Also listen to display-mode standalone media query changes
  try {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    mediaQuery.addEventListener("change", (e) => {
      if (e.matches) {
        state = {
          ...state,
          isInstalled: true,
          canInstall: false,
        };
        notify();
      }
    });
  } catch {}
}

export const getPwaSnapshot = () => state;

export const subscribePwa = (callback) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

export const promptInstall = async () => {
  if (typeof window === "undefined") return false;

  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        state = {
          ...state,
          isInstalled: true,
          canInstall: false,
        };
        deferredPrompt = null;
        try {
          localStorage.setItem("floxa_pwa_installed", "true");
        } catch {}
        notify();
        return true;
      }
    } catch (err) {
      console.warn("[FLOXA PWA] Install prompt failed:", err);
    }
  } else if (state.isIos && !state.isInstalled) {
    state = {
      ...state,
      showIosGuide: true,
    };
    notify();
    return false;
  } else {
    showInfo("To install FLOXA, click the Install icon (⊕ or ⬇) in your browser address bar.");
  }
  return false;
};

export const dismissFloating = () => {
  state = {
    ...state,
    floatingDismissed: true,
  };
  try {
    sessionStorage.setItem("floxa_pwa_floating_dismissed", "true");
  } catch {}
  notify();
};

export const closeIosGuide = () => {
  state = {
    ...state,
    showIosGuide: false,
  };
  notify();
};

const SERVER_PWA_STATE = Object.freeze({
  isInstalled: false,
  canInstall: false,
  isIos: false,
  showIosGuide: false,
  floatingDismissed: false,
});

export const getServerPwaSnapshot = () => SERVER_PWA_STATE;

export function usePwaInstall() {
  const [mounted, setMounted] = useState(false);
  const pwaState = useSyncExternalStore(
    subscribePwa,
    getPwaSnapshot,
    getServerPwaSnapshot
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const isExcluded =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/client") ||
      window.location.pathname.startsWith("/reset-password") ||
      window.location.pathname.startsWith("/forgot-password"));
  if (isExcluded) {
    return {
      isMounted: mounted,
      isInstalled: true,
      canInstall: false,
      isIos: false,
      showIosGuide: false,
      floatingDismissed: true,
      promptInstall: () => {},
      dismissFloating: () => {},
      closeIosGuide: () => {},
      hasNativePrompt: false,
    };
  }

  return {
    ...pwaState,
    isMounted: mounted,
    promptInstall,
    dismissFloating,
    closeIosGuide,
    hasNativePrompt: Boolean(deferredPrompt),
  };
}
