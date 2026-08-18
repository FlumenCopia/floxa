"use client";

import React, { useState, useEffect } from "react";
import { fetchProtectedAssetBlob } from "@/src/lib/api";

/**
 * Reusable ProtectedAssetImage component for fetching and rendering protected private Blob images.
 * Uses authenticated fetch with credentials: "include", converts binary response to a Blob object URL,
 * renders that object URL, and revokes it on unmount or URL change.
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

  useEffect(() => {
    if (!src) {
      return undefined;
    }

    let isMounted = true;
    let createdUrl = null;

    Promise.resolve().then(() => {
      if (isMounted) {
        setLoading(true);
        setError(null);
      }
    });

    fetchProtectedAssetBlob(src)
      .then(({ blob }) => {
        if (!isMounted) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ProtectedAssetImage] Failed to load protected image:", err);
        }
        setError(err.detail || "Failed to load image");
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      setObjectUrl(null);
      setLoading(false);
      setError(null);
    };
  }, [src]);

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
          {...props}
        >
          <span>{fallbackText}</span>
          {children}
        </div>
      );
    }

    return (
      <div className={`protected-image-placeholder error ${className}`.trim()} style={style} {...props}>
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
          {...props}
        >
          <span>Loading image...</span>
          {children}
        </div>
      );
    }

    return (
      <div className={`protected-image-placeholder loading ${className}`.trim()} style={style} {...props}>
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
          backgroundImage: `url(${objectUrl})`,
        }}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      {...props}
    />
  );
}
