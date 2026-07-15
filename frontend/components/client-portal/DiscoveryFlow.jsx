"use client";

import { useCallback, useEffect, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";

const personalityClusters = [
  { min: -3, max: -1.5, name: "Soft Minimalist" },
  { min: -1.5, max: -0.4, name: "Quiet Specialist" },
  { min: -0.4, max: 0.8, name: "Balanced Clarity" },
  { min: 0.8, max: 2.1, name: "Bold Challenger" },
  { min: 2.1, max: 4, name: "Electric Leader" },
];

export const slidersOne = [
  { key: "playfulSerious", left: "Playful", right: "Serious" },
  { key: "unconventionalMainstream", left: "Unconventional", right: "Mainstream" },
  { key: "industrialNatural", left: "Industrial", right: "Natural" },
  { key: "approachableElite", left: "Approachable", right: "Elite" },
  { key: "casualElegant", left: "Casual", right: "Elegant" },
  { key: "refinedStrong", left: "Refined", right: "Strong" },
];

export const slidersTwo = [
  { key: "feminineMasculine", left: "Feminine", right: "Masculine" },
  { key: "simpleComplex", left: "Simple", right: "Complex" },
  { key: "youthfulEstablished", left: "Youthful", right: "Established" },
  { key: "subtleBright", left: "Subtle", right: "Bright" },
  { key: "classicContemporary", left: "Classic", right: "Contemporary" },
  { key: "friendlyAuthoritative", left: "Friendly", right: "Authoritative" },
  { key: "economicalExpensive", left: "Economical", right: "Expensive" },
];

export const emotionsList = [
  "Trust",
  "Bold",
  "Warm",
  "Calm",
  "Raw",
  "Sharp",
  "Fresh",
  "Playful",
  "Refined",
  "Strong",
  "Soft",
  "Vibrant",
  "Heritage",
  "Modern",
  "Honest",
  "Edgy",
  "Friendly",
  "Prestige",
  "Pure",
  "Fun",
  "Confident",
  "Subtle",
  "Dynamic",
  "Quiet",
  "Elegant",
  "Earthy",
  "Electric",
  "Classic",
];

export const personas = [
  { name: "Budget Conscious", desc: "Price-sensitive, value-focused buyers" },
  { name: "Quality Seeker", desc: "Research-driven, pay premium for quality" },
  { name: "Trend Follower", desc: "Culture-aware early adopters" },
  { name: "Premium Loyalist", desc: "Exclusive tastes, brand-loyal, high LTV" },
];

export const visualStyles = [
  "Minimal Clean",
  "Bold Geometric",
  "Organic Warm",
  "Luxury Editorial",
  "Retro Craft",
  "Tech Forward",
  "Playful Illustrative",
  "Classic Heritage",
  "Street Urban",
];

export const defaultCompetitors = [
  { name: "", rating: "", reason: "" },
  { name: "", rating: "", reason: "" },
  { name: "", rating: "", reason: "" },
];

export const allSliderDefinitions = [...slidersOne, ...slidersTwo];

function getSliderDefinitionsForStep(step) {
  if (step < 2) {
    return [];
  }

  if (step === 2) {
    return slidersOne;
  }

  return allSliderDefinitions;
}

export function readStoredDraft(draftKey) {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const localValue = window.localStorage.getItem(draftKey);
    return localValue ? JSON.parse(localValue) : {};
  } catch {
    return {};
  }
}

function toBackendSliderValue(value) {
  return Math.round(((Number(value || 0) + 3) / 6) * 100);
}

export function getCompetitorNameForPayload(competitor) {
  return String(competitor.name || "").trim();
}

export function buildDiscoveryPayload({ basics, sliders, emotions, persona, comps, styles, step }) {
  const sliderDefinitions = getSliderDefinitionsForStep(step);

  return {
    what_business_does: basics.whatDo.trim(),
    target_customer: basics.targetCustomer.trim(),
    why_choose_us: basics.whyChooseUs.trim(),
    brand_feeling: basics.brandFeeling.trim(),
    audience_archetype: persona,
    sliders: sliderDefinitions.map((slider) => ({
      slider_key: slider.key,
      left_label: slider.left,
      right_label: slider.right,
      value: toBackendSliderValue(sliders[slider.key] ?? 0),
    })),
    emotions: emotions.map((emotion) => ({ emotion })),
    competitors: comps
      .filter((competitor) => getCompetitorNameForPayload(competitor))
      .map((competitor) => ({
        name: getCompetitorNameForPayload(competitor),
        rating: competitor.rating || "neutral",
        reason: competitor.reason.trim(),
      })),
    visual_styles: styles.map((style) => ({ style })),
  };
}

function formatDiscoverySaveError(error) {
  if (error?.detail) {
    return error.detail;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to submit discovery. Please try again.";
}

export function DiscoveryFlow({
  project,
  onNext,
}) {
  const draftKey = `floxa-discovery-${project.id}`;
  const [step, setStep] = useState(() => {
    const draft = readStoredDraft(draftKey);
    return Math.min(6, Math.max(1, draft.step ?? 1));
  });
  const [sliders, setSliders] = useState(() => readStoredDraft(draftKey).sliders ?? {});
  const [emotions, setEmotions] = useState(() => readStoredDraft(draftKey).emotions ?? []);
  const [persona, setPersona] = useState(() => readStoredDraft(draftKey).persona ?? "");
  const [styles, setStyles] = useState(() => readStoredDraft(draftKey).styles ?? []);
  const [comps, setComps] = useState([
    ...(readStoredDraft(draftKey).comps ?? defaultCompetitors),
  ]);
  const [basics, setBasics] = useState(() => ({
    whatDo: readStoredDraft(draftKey).basics?.whatDo ?? "",
    targetCustomer: readStoredDraft(draftKey).basics?.targetCustomer ?? "",
    whyChooseUs: readStoredDraft(draftKey).basics?.whyChooseUs ?? "",
    brandFeeling: readStoredDraft(draftKey).basics?.brandFeeling ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const pcts = [28, 36, 44, 54, 64, 75];
  const pct = pcts[step - 1];

  useEffect(() => {
    const draft = { basics, sliders, emotions, persona, styles, comps, step };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));

    const timeout = window.setTimeout(() => {
      const payload = buildDiscoveryPayload({
        basics,
        sliders,
        emotions,
        persona,
        comps,
        styles,
        step,
      });

      clientPortalService.saveDiscoveryDraft(project.id, payload).catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [draftKey, project.id, step, basics, sliders, emotions, persona, styles, comps]);

  const updateSlider = useCallback((key, val) => {
    setSliders((current) => ({ ...current, [key]: val }));
  }, []);

  const getCluster = () => {
    const values = Object.values(sliders).filter((value) => value !== undefined);

    if (!values.length) {
      return "Calculating...";
    }

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return (
      personalityClusters.find((cluster) => avg >= cluster.min && avg < cluster.max)?.name ??
      "Bold Challenger"
    );
  };

  const saveDiscoveryProgress = async () => {
    const payload = buildDiscoveryPayload({
      basics,
      sliders,
      emotions,
      persona,
      comps,
      styles,
      step,
    });

    return clientPortalService.saveDiscoveryDraft(project.id, payload);
  };

  const handleFinish = async () => {
    if (!styles.length) {
      setMessage("Choose at least one visual style.");
      return;
    }

    setMessage("");
    onNext("review");
  };

  async function nextStep() {
    const valid =
      (step !== 1 ||
        Boolean(
          basics.whatDo &&
            basics.targetCustomer &&
            basics.whyChooseUs &&
            basics.brandFeeling
        )) &&
      (step !== 4 || emotions.length > 0) &&
      (step !== 5 ||
        Boolean(
          persona &&
            comps.some((item) => getCompetitorNameForPayload(item) && item.rating)
        ));

    if (!valid) {
      setMessage("Please complete the required fields before continuing.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const data = await saveDiscoveryProgress();

      if (data.success) {
        setStep((current) => current + 1);
      } else {
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch (error) {
      console.error("Client discovery step save failed:", error);
      setMessage(formatDiscoverySaveError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="client-discovery-screen">
      <div className="client-discovery-content">
        <div className="client-discovery-topbar">
          <div className="client-small-logo">FLOXA</div>
          <div>
            Phase 2 of 9 <span>{pct}%</span>
          </div>
        </div>

        <div className="client-discovery-dots">
          <span>Step {step} of 6</span>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <i
              key={item}
              className={item < step ? "complete" : item === step ? "active" : ""}
            />
          ))}
        </div>

        {step === 1 ? (
          <>
            <h2>Business Essentials</h2>
            <p>Tell us the core of what you do in your own words.</p>
            {[
              { key: "whatDo", label: "What does your business do?", placeholder: "We help..." },
              {
                key: "targetCustomer",
                label: "Who is your target customer?",
                placeholder: "Our customer is...",
              },
              {
                key: "whyChooseUs",
                label: "Why should they choose you?",
                placeholder: "Unlike others, we...",
              },
              {
                key: "brandFeeling",
                label: "How should your brand make people feel?",
                placeholder: "People should feel...",
              },
            ].map((field) => (
              <label className="client-textarea-field" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  value={basics[field.key]}
                  onChange={(event) =>
                    setBasics((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                  className="floxa-input"
                  placeholder={field.placeholder}
                  rows={3}
                />
              </label>
            ))}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2>
              How do you want
              <br />
              to be perceived?
            </h2>
            <p>Move each slider to describe your brand&apos;s character.</p>
            {slidersOne.map(({ key, ...slider }) => (
              <SliderRow
                key={key}
                {...slider}
                value={sliders[key] ?? 0}
                onChange={(value) => updateSlider(key, value)}
              />
            ))}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2>
              What does your brand
              <br />
              look and feel like?
            </h2>
            <p>Define the visual and structural identity.</p>
            {slidersTwo.map(({ key, ...slider }) => (
              <SliderRow
                key={key}
                {...slider}
                value={sliders[key] ?? 0}
                onChange={(value) => updateSlider(key, value)}
              />
            ))}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2>
              Pick up to 8 words your
              <br />
              brand should feel like
            </h2>
            <p>These guide your visual direction and tone of voice.</p>
            <div className="client-chip-wrap">
              {emotionsList.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => {
                    if (emotions.includes(word)) {
                      setEmotions((current) => current.filter((item) => item !== word));
                    } else if (emotions.length < 8) {
                      setEmotions((current) => [...current, word]);
                    }
                  }}
                  className={`floxa-chip ${emotions.includes(word) ? "active" : ""}`}
                >
                  {word}
                </button>
              ))}
            </div>
            <div className="client-helper-text">{emotions.length} / 8 selected</div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <h2>
              Who is your
              <br />
              primary customer?
            </h2>
            <div className="client-persona-grid">
              {personas.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => setPersona(item.name)}
                  className={persona === item.name ? "active" : ""}
                >
                  <strong>{item.name}</strong>
                  <span>{item.desc}</span>
                </button>
              ))}
            </div>

            <div className="client-section-label">Rate competitor brands</div>
            {comps.map((competitor, index) => (
              <div className="client-competitor-card" key={index}>
                <input
                  value={competitor.name}
                  onChange={(event) =>
                    setComps((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: event.target.value } : item
                      )
                    )
                  }
                  placeholder={`Competitor ${index + 1} name`}
                />
                <div>
                  {["like", "dislike"].map((rating) => (
                    <button
                      type="button"
                      key={rating}
                      onClick={() =>
                        setComps((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, rating: item.rating === rating ? "" : rating }
                              : item
                          )
                        )
                      }
                      className={competitor.rating === rating ? rating : ""}
                    >
                      {rating === "like" ? "Like" : "Dislike"}
                    </button>
                  ))}
                </div>
                <input
                  value={competitor.reason}
                  onChange={(event) =>
                    setComps((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, reason: event.target.value } : item
                      )
                    )
                  }
                  placeholder="Why do you like or dislike this brand?"
                />
              </div>
            ))}
          </>
        ) : null}

        {step === 6 ? (
          <>
            <h2>
              Choose up to 3
              <br />
              visual styles
            </h2>
            <p>Select the aesthetic directions that resonate most.</p>
            <div className="client-chip-wrap">
              {visualStyles.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => {
                    if (styles.includes(style)) {
                      setStyles((current) => current.filter((item) => item !== style));
                    } else if (styles.length < 3) {
                      setStyles((current) => [...current, style]);
                    }
                  }}
                  className={`floxa-chip ${styles.includes(style) ? "active" : ""}`}
                >
                  {style}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {message ? <div className="client-form-error">{message}</div> : null}

        <div className="client-discovery-actions">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((current) => current - 1)}>
              &lt;- Back
            </button>
          ) : (
            <button type="button" onClick={() => onNext("profile")}>
              &lt;- Back
            </button>
          )}

          {step < 6 ? (
            <button type="button" onClick={nextStep} disabled={saving}>
              Next -&gt;
            </button>
          ) : (
            <button type="button" className="client-review-pulse-btn" onClick={handleFinish} disabled={saving}>
              Review Before Submit
            </button>
          )}
        </div>
      </div>

      <div className="client-discovery-preview">
        <div className="client-mini-orb">
          <svg width="160" height="160" viewBox="0 0 200 200">
            <defs>
              <clipPath id="dOrbClip">
                <circle cx="100" cy="100" r="88" />
              </clipPath>
            </defs>
            <circle
              cx="100"
              cy="100"
              r="88"
              fill="rgba(10,25,18,0.6)"
              stroke="rgba(137,172,160,0.18)"
              strokeWidth="1.5"
            />
            <rect
              x="12"
              y={200 - 176 * (pct / 100)}
              width="176"
              height={176 * (pct / 100)}
              fill="rgba(28,52,46,0.55)"
              clipPath="url(#dOrbClip)"
            />
            <circle
              cx="100"
              cy="100"
              r="88"
              fill="none"
              stroke="rgba(77,255,160,0.28)"
              strokeWidth="2"
              strokeDasharray={553}
              strokeDashoffset={553 - 553 * (pct / 100)}
              strokeLinecap="round"
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div>{pct}%</div>
        </div>

        {[
          { label: "Personality cluster", value: getCluster() },
          {
            label: "Emotions selected",
            value: emotions.length
              ? `${emotions.slice(0, 3).join(", ")}${emotions.length > 3 ? "..." : ""}`
              : "None yet",
          },
          { label: "Audience archetype", value: persona || "Not selected" },
          {
            label: "Visual direction",
            value: styles.length ? styles.slice(0, 2).join(", ") : "Not selected",
          },
        ].map((item) => (
          <div className="client-preview-line" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SliderRow({ left, right, value, onChange }) {
  const pct = ((value + 3) / 6) * 100;
  const fillStyle = `linear-gradient(to right, rgba(77,255,160,0.45) 0%, rgba(77,255,160,0.6) ${pct}%, rgba(137,172,160,0.12) ${pct}%, rgba(137,172,160,0.12) 100%)`;

  return (
    <div className="client-slider-row">
      <div>
        <span>{left}</span>
        <strong>{value > 0 ? `+${value}` : value}</strong>
        <span>{right}</span>
      </div>
      <input
        type="range"
        min="-3"
        max="3"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="floxa-slider"
        style={{ background: fillStyle }}
      />
    </div>
  );
}
