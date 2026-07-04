"use client";

import { useState } from "react";

export default function Branding() {
  const [primaryColor, setPrimaryColor] = useState("#4DFFA0");
  const [heading, setHeading] = useState("FlumenX Brand Discovery");

  const previewOrbStyle = {
    background: `radial-gradient(circle at 35% 35%, ${primaryColor}, #1c8050, #0a1912)`,
    boxShadow: `0 0 28px ${primaryColor}73`,
  };

  return (
    <div className="settings-branding-grid">
      <div className="card settings-card">
        <div className="font-6 settings-card-title">White-label branding</div>

        <div className="form-group mb-3">
          <label className="form-label">Studio logo</label>
          <button className="btn btn-secondary btn-full settings-upload-btn" type="button">
            Upload logo
          </button>
        </div>

        <div className="form-group mb-3">
          <label className="form-label" htmlFor="brand-color">
            Primary colour
          </label>
          <div className="settings-color-row">
            <input
              aria-label="Primary colour"
              className="settings-color-input"
              id="brand-color"
              onChange={(event) => setPrimaryColor(event.target.value)}
              type="color"
              value={primaryColor}
            />
            <input
              className="form-input settings-input"
              onChange={(event) => setPrimaryColor(event.target.value)}
              value={primaryColor}
            />
          </div>
        </div>

        <div className="form-group mb-3">
          <label className="form-label" htmlFor="brand-heading">
            Portal heading
          </label>
          <input
            className="form-input settings-input"
            id="brand-heading"
            onChange={(event) => setHeading(event.target.value)}
            value={heading}
          />
        </div>

        <div className="form-group mb-4">
          <label className="form-label" htmlFor="brand-slug">
            Portal slug
          </label>
          <input className="form-input settings-input" id="brand-slug" placeholder="your-studio" />
          <div className="form-hint">floxa.io/your-studio</div>
        </div>

        <button className="btn btn-primary settings-save-btn" type="button">
          Save branding
        </button>
      </div>

      <div className="settings-preview-wrap">
        <div className="settings-preview-label">Live preview</div>
        <div className="brand-preview">
          <div className="brand-preview-heading">{heading || "Your Studio"}</div>
          <div className="preview-portal">
            <div className="preview-orb" style={previewOrbStyle} />
            <div className="text-sm font-5 mb-2">Let&apos;s discover your brand.</div>
            <div className="preview-cta" style={{ background: primaryColor }}>
              Enter portal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
