"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";

export default function PwaProvider() {
  const pathname = usePathname();
  const isClientPortal = Boolean(pathname && pathname.startsWith("/client"));

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Do not register PWA service worker on the client portal - app is strictly for consultants
    if (isClientPortal) {
      return;
    }

    const registerSw = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates periodically
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener("statechange", () => {
              if (
                installingWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New update available, activate it quietly
                installingWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
        });
      } catch (err) {
        // Silently handle registration errors in dev or restricted environments
        console.debug("[FLOXA PWA] Service worker registration skipped:", err);
      }
    };

    if (document.readyState === "complete") {
      registerSw();
    } else {
      window.addEventListener("load", registerSw);
      return () => window.removeEventListener("load", registerSw);
    }
  }, [isClientPortal]);

  if (isClientPortal) {
    return null;
  }

  return <PwaInstallPrompt />;
}

