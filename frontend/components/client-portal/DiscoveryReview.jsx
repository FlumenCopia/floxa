"use client";

import { useMemo, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";
import {
  allSliderDefinitions,
  buildDiscoveryPayload,
  defaultCompetitors,
  readStoredDraft,
} from "./DiscoveryFlow";

function cleanValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "Not provided";
  }

  if (value === 0) {
    return "0";
  }

  return value || "Not provided";
}

function ReviewSection({ title, items, action }) {
  return (
    <section className="client-review-section">
      <div className="client-review-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="client-review-items">
        {items.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{cleanValue(item.value)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatReviewSliderValue(slider, value) {
  if (value === undefined) {
    return "Balanced";
  }

  if (value < 0) {
    return `${slider.left} leaning (${value})`;
  }

  if (value > 0) {
    return `${slider.right} leaning (+${value})`;
  }

  return "Balanced (0)";
}

export function DiscoveryReview({
  project,
  clientData,
  setClientData,
  onNext,
  onProjectRefresh,
}) {
  const draftKey = `floxa-discovery-${project.id}`;
  const draft = useMemo(() => readStoredDraft(draftKey), [draftKey]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const basics = {
    whatDo: "",
    targetCustomer: "",
    whyChooseUs: "",
    brandFeeling: "",
    ...(draft.basics ?? {}),
  };
  const sliders = draft.sliders ?? {};
  const emotions = draft.emotions ?? [];
  const persona = draft.persona ?? "";
  const comps = draft.comps ?? defaultCompetitors;
  const styles = draft.styles ?? [];
  const step = Math.max(6, draft.step ?? 6);
  const sliderItems = allSliderDefinitions.map((slider) => ({
    label: `${slider.left} / ${slider.right}`,
    value: formatReviewSliderValue(slider, sliders[slider.key]),
  }));
  const competitors = comps
    .filter((competitor) => competitor.name || competitor.rating || competitor.reason)
    .map((competitor, index) => ({
      label: competitor.name || `Competitor ${index + 1}`,
      value: [
        competitor.rating ? `Rating: ${competitor.rating}` : "",
        competitor.reason ? `Reason: ${competitor.reason}` : "",
      ].filter(Boolean).join(" - "),
    }));
  const profileItems = [
    { label: "Name", value: clientData.clientName },
    { label: "Company", value: clientData.clientCompany },
    { label: "Industry", value: clientData.clientIndustry },
    { label: "Year Started", value: clientData.clientYearStart },
    { label: "Location", value: clientData.clientLocation },
    { label: "Phone", value: clientData.clientPhone },
    { label: "Email", value: clientData.clientEmail || project.clientEmail },
    { label: "Website", value: clientData.clientWebsite },
  ];
  const businessItems = [
    { label: "What does your business do?", value: basics.whatDo },
    { label: "Target customer", value: basics.targetCustomer },
    { label: "Why choose you?", value: basics.whyChooseUs },
    { label: "Brand feeling", value: basics.brandFeeling },
  ];
  const audienceItems = [
    { label: "Emotions", value: emotions },
    { label: "Primary customer", value: persona },
    { label: "Visual styles", value: styles },
    ...competitors,
  ];

  async function submitReview() {
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = buildDiscoveryPayload({
        basics,
        sliders,
        emotions,
        persona,
        comps,
        styles,
        step,
      });
      const data = await clientPortalService.submitDiscovery(project.id, payload);

      if (data.success) {
        await onProjectRefresh();
        if (data.data) {
          setClientData(data.data);
        }
        window.localStorage.removeItem(draftKey);
        onNext("dashboard");
      } else {
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch (error) {
      console.error("Client discovery review submit failed:", error);
      setMessage(error instanceof Error ? error.message : "Unable to submit discovery. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="client-discovery-screen client-review-screen">
      <div className="client-discovery-content client-review-content">
        <div className="client-discovery-topbar">
          <div className="client-small-logo">FLOXA</div>
          <div>
            Review & Confirm <span>Before Submit</span>
          </div>
        </div>

        <h1>Review your brand discovery</h1>
        <p>Check your profile and discovery answers before sending them to your consultant.</p>

        <div className="client-review-grid">
          <div className="client-review-column">
            <ReviewSection
              title="Profile Summary"
              items={profileItems}
              action={(
                <button type="button" onClick={() => onNext("profile")}>
                  Edit Profile
                </button>
              )}
            />
          </div>

          <div className="client-review-column">
            <ReviewSection
              title="Discovery Summary"
              items={businessItems}
              action={(
                <button type="button" onClick={() => onNext("discovery")}>
                  Edit Discovery
                </button>
              )}
            />
            <ReviewSection title="Brand Personality" items={sliderItems} />
            <ReviewSection title="Audience, Competitors & Style" items={audienceItems} />
          </div>
        </div>

        <div className="client-review-actionbar">
          <label className="client-review-confirm">
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>I confirm that the above information is accurate.</span>
          </label>

          <div className="client-review-submit-wrap">
            {message ? <div className="client-form-error">{message}</div> : null}
            <button type="button" onClick={submitReview} disabled={!confirmed || saving}>
              {saving ? "Submitting Discovery..." : "Submit Discovery"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
