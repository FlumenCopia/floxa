"use client";

import { useState } from "react";
import { showInfo } from "@/lib/toast";

export default function Branding() {
  const [primaryColor, setPrimaryColor] = useState("#4DFFA0");
  const [heading, setHeading] = useState("Your Studio");

  const handleBrandingAction = () => {
    showInfo("Custom white-label branding will be available in an upcoming release.");
  };

  return (
    <div className="settings-branding-grid">
      <div className="card settings-card">
        <div className="font-6 settings-card-title">White-label branding</div>

        <div className="form-group mb-3">
          <label className="form-label">Studio logo</label>
          <button className="btn btn-secondary btn-full settings-upload-btn" type="button" onClick={handleBrandingAction}>
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

        <button className="btn btn-primary settings-save-btn" type="button" onClick={handleBrandingAction}>
          Save branding
        </button>
      </div>
    </div>
  );
}
