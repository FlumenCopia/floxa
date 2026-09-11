"use client";

import React, { useState, useEffect, useRef } from "react";
import { fetchProtectedAssetBlob } from "@/lib/api";
import { supportSocket } from "../../services/supportSocketService";

/**
 * Enhanced ProtectedAssetImage component:
 * 1. Streams protected assets directly through WebSocket (supportSocket) when available,
 *    preventing any HTTP image URLs from appearing in the browser's Network tab.
 * 2. Renders via HTML5 <canvas> to ensure no <img src="..."> element is exposed in the DOM.
 * 3. Prevents context menus, text selection, and image drag-and-drop.
 * 4. Gracefully falls back to authenticated fetch if WebSocket is still connecting.
 */
export default function ProtectedAssetImage({
  src,
  alt = "",
  className = "",
  style = {},
  fallbackText = "No image",
  asBackground = false,
  children,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ariaLabel,
  ...props
}) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState(null);
  const [isSilentBlank, setIsSilentBlank] = useState(false);
  const canvasRef = useRef(null);
  const loadedImageRef = useRef(null);

  // Silent canvas blankout on screenshot hotkeys (zero visible banners or popups)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let blankTimer = null;
    const triggerSilentBlank = () => {
      setIsSilentBlank(true);
      if (blankTimer) clearTimeout(blankTimer);
      blankTimer = setTimeout(() => {
        setIsSilentBlank(false);
      }, 1500);
    };

    const handleKeyDown = (e) => {
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      const keyCode = e.keyCode || e.which;

      if (
        key === "printscreen" ||
        code === "PrintScreen" ||
        keyCode === 44 ||
        key === "meta" ||
        code === "MetaLeft" ||
        code === "MetaRight" ||
        (e.altKey && keyCode === 44) ||
        (e.shiftKey && (e.metaKey || e.ctrlKey) && key === "s")
      ) {
        triggerSilentBlank();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      if (blankTimer) clearTimeout(blankTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!src) {
      return undefined;
    }

    let isMounted = true;
    let createdUrl = null;
    let unsubscribeWs = null;
    let unsubscribeErr = null;
    let fallbackTimer = null;

    setLoading(true);
    setError(null);

    const portalMatch = String(src).match(/\/client-portal\/[^/]+\/(moodboards|concepts)\/([^/]+)\/image/i);

    const loadViaHttpFallback = () => {
      fetchProtectedAssetBlob(src)
        .then(({ blob }) => {
          if (!isMounted) return;
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err.detail || "Failed to load image");
          setLoading(false);
        });
    };

    if (portalMatch && supportSocket && supportSocket.ws && supportSocket.ws.readyState === WebSocket.OPEN) {
      const assetType = portalMatch[1].toLowerCase() === "moodboards" ? "moodboard" : "concept";
      const assetId = portalMatch[2];

      unsubscribeWs = supportSocket.on(`asset_stream_${assetId}`, (payload) => {
        if (!isMounted) return;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        setObjectUrl(payload.data);
        setLoading(false);
      });

      unsubscribeErr = supportSocket.on(`asset_stream_error_${assetId}`, () => {
        if (!isMounted) return;
        loadViaHttpFallback();
      });

      // Request over WebSocket
      supportSocket.requestProtectedAsset({ assetType, assetId });

      // Fallback timer if socket payload is delayed
      fallbackTimer = setTimeout(() => {
        if (isMounted && loading) {
          loadViaHttpFallback();
        }
      }, 2000);
    } else {
      loadViaHttpFallback();
    }

    return () => {
      isMounted = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (unsubscribeWs) unsubscribeWs();
      if (unsubscribeErr) unsubscribeErr();
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      setObjectUrl(null);
      setLoading(false);
      setError(null);
    };
  }, [src]);

  // Draw to canvas when not asBackground
  useEffect(() => {
    if (!asBackground && objectUrl && canvasRef.current) {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loadedImageRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (isSilentBlank) {
            ctx.fillStyle = "#0a1912";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(img, 0, 0);
          }
        }
      };
      img.src = objectUrl;
    }
  }, [asBackground, objectUrl, isSilentBlank]);

  if (!src || error) {
    if (asBackground) {
      return (
        <div
          className={`${className} empty`.trim()}
          style={style}
          onClick={onClick}
          onKeyDown={onKeyDown}
          role={role}
          tabIndex={tabIndex}
          aria-label={ariaLabel}
          onContextMenu={(e) => e.preventDefault()}
          {...props}
        >
          <span>{fallbackText}</span>
          {children}
        </div>
      );
    }

    return (
      <div
        className={`protected-image-placeholder error ${className}`.trim()}
        style={style}
        onContextMenu={(e) => e.preventDefault()}
        {...props}
      >
        <span>{fallbackText}</span>
      </div>
    );
  }

  if (loading) {
    if (asBackground) {
      return (
        <div
          className={`${className} loading`.trim()}
          style={style}
          onClick={onClick}
          onKeyDown={onKeyDown}
          role={role}
          tabIndex={tabIndex}
          aria-label={ariaLabel}
          onContextMenu={(e) => e.preventDefault()}
          {...props}
        >
          <span>Loading image...</span>
          {children}
        </div>
      );
    }

    return (
      <div
        className={`protected-image-placeholder loading ${className}`.trim()}
        style={style}
        onContextMenu={(e) => e.preventDefault()}
        {...props}
      >
        <span>Loading image...</span>
      </div>
    );
  }

  if (asBackground) {
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundImage: isSilentBlank ? "none" : `url(${objectUrl})`,
          backgroundColor: isSilentBlank ? "#0a1912" : undefined,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onContextMenu={(e) => e.preventDefault()}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        ...style,
        maxWidth: "100%",
        maxHeight: "100%",
        display: "block",
        userSelect: "none",
        WebkitUserSelect: "none",
        pointerEvents: onClick ? "auto" : "none",
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel || alt}
      onContextMenu={(e) => e.preventDefault()}
      {...props}
    />
  );
}
