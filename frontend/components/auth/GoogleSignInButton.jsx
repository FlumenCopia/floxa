"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { googleAuthConsultant } from "../../src/lib/authApi";
import { showError, showSuccess } from "../../src/lib/toast";

export default function GoogleSignInButton({ label = "Continue with Google" }) {
  const router = useRouter();
  const hiddenBtnRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.google?.accounts?.id)
  );

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (typeof window === "undefined" || window.google?.accounts?.id) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error("Failed to load Google Identity Services script.");
    };
    document.head.appendChild(script);
  }, []);

  const handleCredentialResponse = useCallback(
    async (response) => {
      if (!response?.credential) {
        showError("Google authentication failed. Please try again.");
        return;
      }

      setIsLoading(true);

      try {
        const data = await googleAuthConsultant(response.credential);
        const username =
          data?.consultant?.name ||
          data?.consultant?.full_name ||
          data?.consultant?.email ||
          "there";

        showSuccess(`Welcome, ${username}!`);
        router.push("/");
      } catch (error) {
        console.error("Google login error:", error);
        const message =
          error?.detail ||
          error?.message ||
          "Google authentication failed. Please try again.";
        showError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!scriptLoaded || !clientId || typeof window === "undefined") return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
      });

      if (hiddenBtnRef.current) {
        hiddenBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hiddenBtnRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "rectangular",
          text: "continue_with",
          width: "100%",
        });
      }
    } catch (err) {
      console.error("Failed to initialize Google Sign-In:", err);
    }
  }, [scriptLoaded, clientId, handleCredentialResponse]);

  const handleClick = () => {
    if (isLoading) return;

    if (!clientId) {
      showError("Google Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID.");
      return;
    }

    if (!scriptLoaded || !window.google?.accounts?.id) {
      showError("Google Identity Services script is loading. Please try again in a moment.");
      return;
    }

    // Trigger Google Prompt or click Google rendered button
    if (hiddenBtnRef.current) {
      const googleBtnEl = hiddenBtnRef.current.querySelector("div[role=button], iframe, button");
      if (googleBtnEl) {
        googleBtnEl.click();
        return;
      }
    }

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback to hidden rendered button trigger
        const el = hiddenBtnRef.current?.querySelector("div[role=button], iframe, button");
        if (el) el.click();
      }
    });
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
        className="google-btn"
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        style={{ width: "100%", opacity: isLoading ? 0.7 : 1 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {isLoading ? "Signing in..." : label}
      </button>

      <div
        ref={hiddenBtnRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: 0.001,
          pointerEvents: scriptLoaded && clientId ? "auto" : "none",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
