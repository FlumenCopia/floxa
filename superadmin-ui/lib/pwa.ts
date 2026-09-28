"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Check if running in standalone PWA window
export const checkIsStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as any)?.standalone === true ||
    document.referrer?.includes("android-app://") ||
    localStorage?.getItem("floxa_admin_pwa_installed") === "true"
  );
};

// Check if running on iOS Safari
export const checkIsIos = (): boolean => {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

let deferredPrompt: any = null;
const listeners = new Set<() => void>();

interface PwaState {
  isInstalled: boolean;
  canInstall: boolean;
  isIos: boolean;
  showIosGuide: boolean;
  floatingDismissed: boolean;
}

let state: PwaState = {
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
      console.error("[FLOXA Admin PWA] Listener error:", err);
    }
  });
};

if (typeof window !== "undefined") {
  const isStandalone = checkIsStandalone();
  const isIos = checkIsIos();
  let floatingDismissed = false;
  try {
    floatingDismissed = sessionStorage.getItem("floxa_admin_pwa_floating_dismissed") === "true";
  } catch {}

  state = {
    isInstalled: isStandalone,
    canInstall: !isStandalone,
    isIos,
    showIosGuide: false,
    floatingDismissed,
  };

  // Listen for browser install prompt trigger
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    state = {
      ...state,
      isInstalled: false,
      canInstall: true,
    };
    notify();
  });

  // Listen for app installed event
  window.addEventListener("appinstalled", () => {
    state = {
      ...state,
      isInstalled: true,
      canInstall: false,
    };
    deferredPrompt = null;
    try {
      localStorage.setItem("floxa_admin_pwa_installed", "true");
    } catch {}
    notify();
  });

  // Display mode change listener
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

export const getPwaSnapshot = (): PwaState => state;

export const subscribePwa = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

export const promptInstall = async (): Promise<boolean> => {
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
          localStorage.setItem("floxa_admin_pwa_installed", "true");
        } catch {}
        notify();
        return true;
      }
    } catch (err) {
      console.warn("[FLOXA Admin PWA] Install prompt failed:", err);
    }
  } else if (state.isIos && !state.isInstalled) {
    state = {
      ...state,
      showIosGuide: true,
    };
    notify();
    return false;
  } else {
    alert("To install FLOXA SuperAdmin, tap or click the Install icon (⊕ or ⬇) in your browser address bar.");
  }
  return false;
};

export const dismissFloating = () => {
  state = {
    ...state,
    floatingDismissed: true,
  };
  try {
    sessionStorage.setItem("floxa_admin_pwa_floating_dismissed", "true");
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

export function usePwaInstall() {
  const [mounted, setMounted] = useState(false);
  const pwaState = useSyncExternalStore(
    subscribePwa,
    getPwaSnapshot,
    () => ({
      isInstalled: false,
      canInstall: false,
      isIos: false,
      showIosGuide: false,
      floatingDismissed: false,
    })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    ...pwaState,
    isMounted: mounted,
    promptInstall,
    dismissFloating,
    closeIosGuide,
    hasNativePrompt: Boolean(deferredPrompt),
  };
}
