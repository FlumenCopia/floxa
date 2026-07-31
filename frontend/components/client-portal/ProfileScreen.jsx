"use client";

import { useCallback, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";

const industries = [
  "Branding & Design",
  "Technology / SaaS",
  "Food & Beverage",
  "Fashion & Apparel",
  "Real Estate",
  "Healthcare",
  "Education",
  "Hospitality",
  "Finance & Banking",
  "Retail",
  "Manufacturing",
  "Architecture & Interior",
  "Events & Entertainment",
  "Media & Publishing",
];

const stageLabels = [
  "Profile",
  "Discovery",
  "Visual",
  "Agreement",
  "Moodboard",
  "Concepts",
  "Delivery",
  "Sign Off",
];

function normalizeWebsite(value) {
  const website = value.trim();

  if (!website) {
    return "";
  }

  if (/^https?:\/\//i.test(website)) {
    return website;
  }

  return `https://${website}`;
}

function formatProfileSaveError(error) {
  if (error?.website?.length) {
    return `Website: ${error.website[0]}`;
  }

  if (error?.email?.length) {
    return `Email: ${error.email[0]}`;
  }

  if (error?.year_started?.length) {
    return `Year started: ${error.year_started[0]}`;
  }

  if (error?.detail) {
    return error.detail;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to save your profile.";
}

export function ProfileScreen({
  project,
  clientData,
  setClientData,
  onNext,
  onProjectRefresh,
  profileReturnScreen,
}) {
  const [fields, setFields] = useState({
    name: clientData.clientName ?? "",
    company: clientData.clientCompany ?? "",
    industry: clientData.clientIndustry ?? "",
    yearStart: clientData.clientYearStart?.toString() ?? "",
    location: clientData.clientLocation ?? "",
    phone: clientData.clientPhone ?? "",
    email: clientData.clientEmail ?? project.clientEmail ?? "",
    website: clientData.clientWebsite ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filledCount = Object.values(fields).filter((value) => value.trim()).length;
  const pct = Math.round((filledCount / 8) * 100);

  const update = useCallback((key, val) => {
    setFields((current) => ({ ...current, [key]: val }));
  }, []);

  const handleNext = async () => {
    if (!fields.name.trim() || !fields.company.trim() || !fields.email.trim()) {
      setError("Please enter your name, company, and email address.");
      return;
    }

    if (!/^\d{10}$/.test(fields.phone.trim())) {
      setError("Phone number must be exactly 10 digits.");
      return;
    }

    const profilePayload = {
      client_name: fields.name.trim(),
      company_name: fields.company.trim(),
      industry: fields.industry.trim(),
      year_started: fields.yearStart ? Number(fields.yearStart) : null,
      location: fields.location.trim(),
      phone: fields.phone.trim(),
      email: fields.email.trim(),
      website: normalizeWebsite(fields.website),
    };

    setSaving(true);
    setError("");

    try {
      const response = await clientPortalService.saveClientProfile(project.id, profilePayload);

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Unable to save your profile.");
      }

      await onProjectRefresh();
      setClientData(response.data);
      onNext(profileReturnScreen || "discovery");
    } catch (err) {
      console.error("Client profile save failed:", err);
      setError(formatProfileSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * pct) / 100;

  return (
    <div className="client-profile-screen">
      <div className="client-profile-form-panel">
        <div className="client-small-logo">FLOXA</div>

        <h1>
          Let&apos;s Know More
          <br />
          About You <span>R</span>
        </h1>
        <p>Your brand clarity journey starts with knowing who you are.</p>

        {[
          { key: "name", placeholder: "Enter Your Name", type: "text" },
          { key: "company", placeholder: "Enter Your Company Name", type: "text" },
        ].map((field) => (
          <label className="client-line-field" key={field.key}>
            <input
              type={field.type}
              placeholder={field.placeholder}
              value={fields[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
            />
            <span aria-hidden="true">/</span>
          </label>
        ))}

        <div className="client-field-grid">
          <label className="client-line-field">
            <select
              value={fields.industry}
              onChange={(event) => update("industry", event.target.value)}
            >
              <option value="" disabled>
                Enter Your Industry
              </option>
              {industries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
            <span aria-hidden="true">v</span>
          </label>

          <label className="client-line-field">
            <input
              type="number"
              placeholder="Year Started"
              value={fields.yearStart}
              min="1950"
              max="2026"
              onChange={(event) => update("yearStart", event.target.value)}
            />
            <span aria-hidden="true">/</span>
          </label>
        </div>

        {[
          { key: "location", placeholder: "Enter Your Location", type: "text" },
          { key: "phone", placeholder: "Phone Number", type: "tel" },
          { key: "email", placeholder: "Email ID", type: "email" },
          { key: "website", placeholder: "Website", type: "url" },
        ].map((field) => (
          <label className="client-line-field" key={field.key}>
            <input
              type={field.type}
              placeholder={field.placeholder}
              value={fields[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
            />
            <span aria-hidden="true">/</span>
          </label>
        ))}

        {error ? <div className="client-form-error">{error}</div> : null}

        <div className="client-form-actions">
          <button type="button" onClick={() => onNext("login")}>
            &lt;- Back
          </button>
          <button type="button" onClick={handleNext} disabled={saving}>
            {saving ? "Saving..." : "Begin Discovery ->"}
          </button>
        </div>
      </div>

      <div className="client-profile-visual-panel">
        <div className="client-profile-orb">
          <svg width="min(340px, 40vw)" height="min(340px, 40vw)" viewBox="0 0 200 200">
            <defs>
              <clipPath id="orbClip">
                <circle cx="100" cy="100" r="88" />
              </clipPath>
            </defs>
            <circle
              cx="100"
              cy="100"
              r="88"
              fill="rgba(10,25,18,0.6)"
              stroke="rgba(137,172,160,0.2)"
              strokeWidth="1.5"
            />
            <rect
              x="12"
              y={200 - 176 * (pct / 100)}
              width="176"
              height={176 * (pct / 100)}
              fill="rgba(28,52,46,0.55)"
              clipPath="url(#orbClip)"
            />
            <circle
              cx="100"
              cy="100"
              r="88"
              fill="none"
              stroke="rgba(77,255,160,0.28)"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div>{pct}%</div>
        </div>

        <div className="client-profile-stage-rail">
          {stageLabels.map((stage, index) => (
            <div className={index === 0 ? "active" : ""} key={stage}>
              <span />
              <strong>{stage}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
