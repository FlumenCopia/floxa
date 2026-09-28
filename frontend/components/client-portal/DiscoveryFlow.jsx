"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Eye } from "lucide-react";
import { clientPortalService } from "../../services/clientPortalService";
import { supportSocket } from "../../services/supportSocketService";
import { showSuccess } from "@/lib/toast";

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
  "Aspirational",
  "Pure",
  "Fun",
  "Confident",
  "Subtle",
  "Dynamic",
  "Quiet",
  "Elegant",
  "Earthy",
  "Electric",
];

const personas = [
  { name: "Value-Seeker", desc: "Price-first, practical & ROI-focused" },
  { name: "Premium-Seeker", desc: "Status, craft & quality above all" },
  { name: "Innovator", desc: "Early adopter, loves novelty & speed" },
  { name: "Traditionalist", desc: "Reliability, heritage & proven track record" },
];

const visualStylesList = [
  { name: "Bold & Loud", desc: "High contrast, big type, intense color" },
  { name: "Minimal & Clean", desc: "Generous whitespace, restraint, precision" },
  { name: "Warm & Earthy", desc: "Natural tones, organic textures, approachable" },
  { name: "Dark & Luxurious", desc: "Deep palettes, metallic accents, moody" },
  { name: "Playful & Vibrant", desc: "Bright colors, rounded shapes, energy" },
  { name: "Editorial & Typographic", desc: "Serif-led, sophisticated, literary feel" },
];

export const defaultCompetitors = [
  { name: "", rating: "neutral", reason: "" },
  { name: "", rating: "neutral", reason: "" },
  { name: "", rating: "neutral", reason: "" },
];

export const allSliderDefinitions = [...slidersOne, ...slidersTwo];

export function getSliderDefinitionsForStep(step) {
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
    const raw = window.localStorage.getItem(draftKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function toBackendSliderValue(value) {
  return Math.round(((Number(value || 0) + 3) / 6) * 100);
}

export function getCompetitorNameForPayload(competitor) {
  return competitor.name.trim();
}

export function validateDiscoveryInputQuality(text, fieldLabel) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return `Please fill in "${fieldLabel}".`;
  }

  const trimmed = text.trim();

  if (trimmed.length < 10) {
    return `Please provide a more detailed answer for "${fieldLabel}" (at least 10 characters).`;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return `Please use at least a couple of words to explain "${fieldLabel}".`;
  }

  // Check unique words (prevent e.g. 'test test test')
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  if (words.length >= 3 && uniqueWords.size < 2) {
    return `Please enter meaningful words for "${fieldLabel}", avoid repeating the same word.`;
  }

  // Check for repeated character sequences (e.g. 'aaaaa', 'asdfasdfasdf', 'abcabcabc')
  if (/(.)\1{4,}/i.test(trimmed) || /(.{2,4})\1{2,}/i.test(trimmed)) {
    return `Please enter real words for "${fieldLabel}", avoid repeating character patterns.`;
  }

  // Check Latin words for gibberish consonant clusters (e.g. sdfhsdjkf, dfghjkl)
  const latinWords = words.filter((w) => /^[a-zA-Z]+$/.test(w));
  if (latinWords.length > 0) {
    for (const w of latinWords) {
      if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(w)) {
        return `Please enter meaningful text for "${fieldLabel}". Random keystrokes cannot be used to build your Brand DNA.`;
      }
    }

    const allLetters = trimmed.replace(/[^a-zA-Z]/g, "");
    if (allLetters.length >= 10) {
      const vowels = allLetters.match(/[aeiouy]/gi) || [];
      const vowelRatio = vowels.length / allLetters.length;
      if (vowelRatio < 0.15) {
        return `Please enter meaningful sentences for "${fieldLabel}". Keystroke mash cannot be used for Brand DNA.`;
      }
    }
  }

  return null;
}

export function buildDiscoveryPayload({ basics = {}, sliders, emotions, persona, comps, styles, step }) {
  const allSliders = [...slidersOne, ...slidersTwo];

  const whatDo = basics.whatDo || basics.whatDoYouDo || basics.what_business_does || basics.businessDescription || "";
  const targetCustomer = basics.targetCustomer || basics.target_customer || "";
  const whyChooseUs = basics.whyChooseUs || basics.whyChooseYou || basics.why_choose_us || "";
  const brandFeeling = basics.brandFeeling || basics.brand_feeling || basics.whyTrustYou || "";

  return {
    step,
    business_basics: {
      ...basics,
      whatDo,
      whatDoYouDo: whatDo,
      targetCustomer,
      whyChooseUs,
      whyChooseYou: whyChooseUs,
      brandFeeling,
      whyTrustYou: brandFeeling,
    },
    what_business_does: whatDo,
    whatDo,
    whatDoYouDo: whatDo,
    target_customer: targetCustomer,
    targetCustomer,
    why_choose_us: whyChooseUs,
    whyChooseUs,
    whyChooseYou: whyChooseUs,
    brand_feeling: brandFeeling,
    brandFeeling,
    whyTrustYou: brandFeeling,
    sliders: allSliders.map((slider) => ({
      slider_key: slider.key,
      left_label: slider.left,
      right_label: slider.right,
      value: toBackendSliderValue(sliders[slider.key] ?? 0),
    })),
    personality_sliders: allSliders.map((slider) => ({
      slider_key: slider.key,
      left_label: slider.left,
      right_label: slider.right,
      value: toBackendSliderValue(sliders[slider.key] ?? 0),
    })),
    emotions: Array.from(
      new Set(
        (emotions || [])
          .map((e) => (typeof e === "string" ? e : e?.emotion))
          .filter(Boolean)
      )
    )
      .slice(0, 8)
      .map((emotion) => ({ emotion })),
    customer_archetype: persona,
    audience_archetype: persona,
    persona: persona,
    competitors: (comps || [])
      .filter((competitor) => getCompetitorNameForPayload(competitor))
      .map((competitor) => ({
        name: getCompetitorNameForPayload(competitor),
        rating: competitor.rating || "neutral",
        reason: (competitor.reason || "").trim(),
      })),
    visual_styles: Array.from(
      new Set(
        (styles || [])
          .map((s) => (typeof s === "string" ? s : s?.style))
          .filter(Boolean)
      )
    )
      .slice(0, 3)
      .map((style) => ({ style })),
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
  token,
  portalToken,
  onNext,
  onStepChange,
  isConsultantMode = false,
  consultantToken = "",
  initialStep,
}) {
  const targetPortalToken = portalToken || token || project?.portal_token || project?.portalToken || "";
  const draftKey = `floxa-discovery-${project?.id || "draft"}`;
  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined" && targetPortalToken) {
      const stored =
        window.sessionStorage.getItem(`floxa-client-step-${targetPortalToken}`) ||
        window.localStorage.getItem(`floxa-client-step-${targetPortalToken}`);
      const parsed = parseInt(stored, 10);
      if (parsed >= 1 && parsed <= 6) {
        return parsed;
      }
    }
    const draft = readStoredDraft(draftKey);
    if (typeof draft?.step === "number" && draft.step >= 1 && draft.step <= 6) {
      return draft.step;
    }
    if (typeof initialStep === "number" && initialStep >= 1 && initialStep <= 6) {
      return initialStep;
    }
    return 1;
  });
  const [sliders, setSliders] = useState(() => readStoredDraft(draftKey).sliders ?? {});
  const [emotions, setEmotions] = useState(() => {
    const raw = readStoredDraft(draftKey).emotions ?? [];
    return Array.from(
      new Set(
        (Array.isArray(raw) ? raw : [])
          .map((item) => (typeof item === "string" ? item : item?.emotion))
          .filter(Boolean)
      )
    ).slice(0, 8);
  });
  const [persona, setPersona] = useState(() => readStoredDraft(draftKey).persona ?? "");
  const [styles, setStyles] = useState(() => {
    const raw = readStoredDraft(draftKey).styles ?? [];
    return Array.from(
      new Set(
        (Array.isArray(raw) ? raw : [])
          .map((item) => (typeof item === "string" ? item : item?.style))
          .filter(Boolean)
      )
    ).slice(0, 3);
  });
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
  const [activeHelpSession, setActiveHelpSession] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpQuestion, setHelpQuestion] = useState("");
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);

  const pageId = `frame_${step}`;
  const isCurrentStepHelpActive = Boolean(
    activeHelpSession?.is_active && (activeHelpSession?.page_id === pageId || activeHelpSession?.page_id?.includes(`Step ${step}`))
  );
  const isReadOnly = Boolean(isConsultantMode && !isCurrentStepHelpActive);

  const pcts = [17, 33, 50, 67, 83, 100];
  const pct = pcts[step - 1] ?? 100;

  useEffect(() => {
    if (typeof window !== "undefined" && targetPortalToken && typeof step === "number") {
      window.sessionStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(step));
      window.localStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(step));
    }
    if (typeof onStepChange === "function") {
      onStepChange(step);
    }
  }, [targetPortalToken, step, onStepChange]);

  useEffect(() => {
    if (typeof initialStep === "number" && initialStep >= 1 && initialStep <= 6 && initialStep !== step) {
      setStep(initialStep);
    }
  }, [initialStep]);

  useEffect(() => {
    if (!targetPortalToken) return;

    supportSocket.connect({
      portalToken: targetPortalToken,
      consultantToken: consultantToken || (isConsultantMode ? localStorage.getItem("floxa_jwt") || "" : ""),
    });

    const unsubscribeInitial = supportSocket.on("initial_state", (data) => {
      if (data?.active_help) {
        setActiveHelpSession(data.active_help);
      }
    });

    const unsubscribeHelpReq = supportSocket.on("help_requested", (data) => {
      setActiveHelpSession(data);
    });

    const unsubscribeHelpResolved = supportSocket.on("help_resolved", () => {
      setActiveHelpSession(null);
    });

    const unsubscribeFieldSync = supportSocket.on("field_sync", (data) => {
      if (data.field_key.startsWith("basics.") || data.field_key.startsWith("answers.")) {
        const rawKey = data.field_key.split(".")[1];
        let targetKey = rawKey;
        if (rawKey === "whatDoYouDo" || rawKey === "businessDescription" || rawKey === "whatDo") targetKey = "whatDo";
        if (rawKey === "whyChooseYou" || rawKey === "whyChooseUs") targetKey = "whyChooseUs";
        if (rawKey === "whyTrustYou" || rawKey === "brandFeeling") targetKey = "brandFeeling";
        if (rawKey === "targetCustomer") targetKey = "targetCustomer";
        setBasics((prev) => ({ ...prev, [targetKey]: data.value }));
      } else if (data.field_key.startsWith("slider.")) {
        const key = data.field_key.split(".")[1];
        setSliders((prev) => ({ ...prev, [key]: data.value }));
      } else if (data.field_key === "emotions" || data.field_key === "selectedEmotions") {
        setEmotions(data.value || []);
      } else if (data.field_key === "persona" || data.field_key === "selectedAudience" || data.field_key === "customer_archetype" || data.field_key === "audience_archetype") {
        const val = Array.isArray(data.value) ? (data.value[0] || "") : (data.value || "");
        setPersona(val);
      } else if (data.field_key === "styles" || data.field_key === "selectedVisual") {
        setStyles(data.value || []);
      } else if (data.field_key === "comps" || data.field_key === "competitors") {
        if (Array.isArray(data.value)) {
          setComps(data.value);
        }
      }
    });

    const unsubscribeStepNav = supportSocket.on("step_navigate", (data) => {
      if (typeof data.step === "number" && data.step >= 1 && data.step <= 6) {
        setStep(data.step);
      }
    });

    return () => {
      unsubscribeInitial();
      unsubscribeHelpReq();
      unsubscribeHelpResolved();
      unsubscribeFieldSync();
      unsubscribeStepNav();
    };
  }, [targetPortalToken, consultantToken, isConsultantMode]);

  // Pre-load saved discovery answers from server database on mount
  useEffect(() => {
    if (!targetPortalToken) return;
    clientPortalService.getDiscoveryDraft(targetPortalToken).then((res) => {
      if (res?.success && res.data) {
        const d = res.data;
        setBasics((prev) => ({
          ...prev,
          whatDo: d.business_description || d.businessDescription || d.whatDo || prev.whatDo,
          targetCustomer: d.target_customer || d.targetCustomer || prev.targetCustomer,
          whyChooseUs: d.why_choose_us || d.whyChooseUs || prev.whyChooseUs,
          brandFeeling: d.brand_feeling || d.brandFeeling || prev.brandFeeling,
        }));

        if (Array.isArray(d.emotions) && d.emotions.length > 0) {
          const loadedEmotions = Array.from(
            new Set(
              d.emotions
                .map((e) => (typeof e === "string" ? e : e?.emotion))
                .filter(Boolean)
            )
          ).slice(0, 8);
          setEmotions(loadedEmotions);
        }

        if (Array.isArray(d.sliders) || Array.isArray(d.personality_sliders)) {
          const sList = d.sliders || d.personality_sliders;
          const sMap = {};
          sList.forEach((s) => {
            if (s.slider_key && s.value !== undefined) {
              sMap[s.slider_key] = Math.round((s.value / 100) * 6 - 3);
            }
          });
          if (Object.keys(sMap).length > 0) {
            setSliders((prev) => ({ ...prev, ...sMap }));
          }
        }

        if (d.audience_archetype || d.customer_archetype) {
          setPersona(d.audience_archetype || d.customer_archetype);
        }

        if (Array.isArray(d.competitors) && d.competitors.length > 0) {
          setComps(d.competitors);
        }

        if (Array.isArray(d.visual_styles) && d.visual_styles.length > 0) {
          setStyles(
            Array.from(
              new Set(
                d.visual_styles
                  .map((v) => (typeof v === "string" ? v : v.style))
                  .filter(Boolean)
              )
            ).slice(0, 3)
          );
        }
      }
    });
  }, [targetPortalToken]);

  useEffect(() => {
    if (isReadOnly) return;

    const draft = { basics, sliders, emotions, persona, styles, comps, step };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    if (targetPortalToken) {
      window.localStorage.setItem(`floxa-discovery-${targetPortalToken}`, JSON.stringify(draft));
    }

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

      if (targetPortalToken) {
        clientPortalService.saveDiscoveryDraft(targetPortalToken, payload).catch(() => undefined);
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [draftKey, targetPortalToken, step, basics, sliders, emotions, persona, styles, comps, isReadOnly]);

  const updateSlider = useCallback((key, val) => {
    if (isReadOnly) return;
    setSliders((current) => ({ ...current, [key]: val }));
    supportSocket.syncField({
      pageId,
      fieldKey: `slider.${key}`,
      value: val,
    });
  }, [isReadOnly, pageId]);

  const handleBasicsChange = (key, value) => {
    if (isReadOnly) return;
    setBasics((current) => ({ ...current, [key]: value }));
    supportSocket.syncField({
      pageId,
      fieldKey: `basics.${key}`,
      value,
    });
    if (key === "whatDo") {
      supportSocket.syncField({
        pageId,
        fieldKey: "answers.whatDoYouDo",
        value,
      });
      supportSocket.syncField({
        pageId,
        fieldKey: "basics.businessDescription",
        value,
      });
    } else if (key === "whyChooseUs") {
      supportSocket.syncField({
        pageId,
        fieldKey: "answers.whyChooseYou",
        value,
      });
    } else if (key === "brandFeeling") {
      supportSocket.syncField({
        pageId,
        fieldKey: "answers.whyTrustYou",
        value,
      });
    }
  };

  const handleEmotionToggle = (word) => {
    if (isReadOnly) return;
    setEmotions((current) => {
      const normalizedCurrent = Array.from(
        new Set(
          (current || [])
            .map((item) => (typeof item === "string" ? item : item?.emotion))
            .filter(Boolean)
        )
      );
      let next;
      if (normalizedCurrent.includes(word)) {
        next = normalizedCurrent.filter((item) => item !== word);
      } else if (normalizedCurrent.length < 8) {
        next = [...normalizedCurrent, word];
      } else {
        return normalizedCurrent;
      }
      supportSocket.syncField({
        pageId,
        fieldKey: "emotions",
        value: next,
      });
      return next;
    });
  };

  const handlePersonaSelect = (name) => {
    if (isReadOnly) return;
    const next = persona === name ? "" : name;
    setPersona(next);
    supportSocket.syncField({
      pageId,
      fieldKey: "persona",
      value: next,
    });
    supportSocket.syncField({
      pageId,
      fieldKey: "selectedAudience",
      value: next ? [next] : [],
    });
  };

  const handleStylesToggle = (name) => {
    if (isReadOnly) return;
    setStyles((current) => {
      const normalizedCurrent = Array.from(
        new Set(
          (current || [])
            .map((item) => (typeof item === "string" ? item : item?.style))
            .filter(Boolean)
        )
      );
      let next;
      if (normalizedCurrent.includes(name)) {
        next = normalizedCurrent.filter((item) => item !== name);
      } else if (normalizedCurrent.length < 3) {
        next = [...normalizedCurrent, name];
      } else {
        return normalizedCurrent;
      }
      supportSocket.syncField({
        pageId,
        fieldKey: "styles",
        value: next,
      });
      supportSocket.syncField({
        pageId,
        fieldKey: "selectedVisual",
        value: next,
      });
      return next;
    });
  };

  const handleCompsChange = (updater) => {
    if (isReadOnly) return;
    setComps((current) => {
      const next = updater(current);
      supportSocket.syncField({
        pageId,
        fieldKey: "comps",
        value: next,
      });
      supportSocket.syncField({
        pageId,
        fieldKey: "competitors",
        value: next,
      });
      return next;
    });
  };

  const stepTitles = {
    1: "Step 1: Business Essentials",
    2: "Step 2: Brand Personality",
    3: "Step 3: Visual & Structural Identity",
    4: "Step 4: Brand Emotions",
    5: "Step 5: Customer Archetype & Competitors",
    6: "Step 6: Visual Styles",
  };

  const submitHelpRequest = async () => {
    if (isSubmittingHelp) return;
    setIsSubmittingHelp(true);

    try {
      const stepTitle = stepTitles[step] || `Step ${step}`;
      const question = helpQuestion.trim() || `I need guidance with ${stepTitle}.`;

      // 1. Immediately auto-save all currently filled fields to the backend database
      const payload = buildDiscoveryPayload({
        basics,
        sliders,
        emotions,
        persona,
        comps,
        styles,
        step,
      });
      const saveToken = targetPortalToken || project?.portal_token || project?.id;
      if (saveToken) {
        clientPortalService.saveDiscoveryDraft(saveToken, payload).catch((err) => {
          console.warn("Auto-save draft on help request failed:", err);
        });
      }

      // 2. Broadcast all currently filled fields AND sliders over WebSocket to consultant
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "basics.whatDo", value: basics.whatDo });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "basics.businessDescription", value: basics.whatDo });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "answers.whatDoYouDo", value: basics.whatDo });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "basics.targetCustomer", value: basics.targetCustomer });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "answers.targetCustomer", value: basics.targetCustomer });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "basics.whyChooseUs", value: basics.whyChooseUs });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "answers.whyChooseYou", value: basics.whyChooseUs });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "basics.brandFeeling", value: basics.brandFeeling });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "answers.whyTrustYou", value: basics.brandFeeling });

      Object.entries(sliders).forEach(([sliderKey, val]) => {
        supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: `slider.${sliderKey}`, value: val });
      });

      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "emotions", value: emotions });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "selectedEmotions", value: emotions });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "persona", value: persona });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "selectedAudience", value: persona ? [persona] : [] });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "comps", value: comps });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "competitors", value: comps });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "styles", value: styles });
      supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: "selectedVisual", value: styles });

      // 3. Send help request via WebSocket for real-time live sync
      const wsSent = supportSocket.requestHelp({
        pageId: stepTitle,
        fieldKey: "",
        question,
      });

      // 4. Call REST API endpoint only as fallback if WebSocket is disconnected
      if (!wsSent && targetPortalToken) {
        await clientPortalService.requestHelp(targetPortalToken, {
          pageId: stepTitle,
          question,
          fieldKey: "",
        }).catch((err) => console.warn("REST help request fallback error:", err));
      }

      setActiveHelpSession({
        page_id: stepTitle,
        question,
        is_active: true,
      });
      setShowHelpModal(false);
      setHelpQuestion("");
      showSuccess(`Help requested on ${stepTitle}. Your consultant has been notified!`);
    } finally {
      setIsSubmittingHelp(false);
    }
  };

  const resolveCurrentHelp = () => {
    const stepTitle = stepTitles[step] || pageId;
    const wsSent = supportSocket.resolveHelp({ pageId: stepTitle });
    if (!wsSent && targetPortalToken) {
      clientPortalService.resolveHelp(targetPortalToken, { pageId: stepTitle }).catch(() => undefined);
    }
    setActiveHelpSession(null);
    showSuccess("Help marked as resolved.");
  };

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

  const saveDiscoveryProgress = async (stepToSave = step) => {
    const payload = buildDiscoveryPayload({
      basics,
      sliders,
      emotions,
      persona,
      comps,
      styles,
      step: stepToSave,
    });

    const saveToken = targetPortalToken || project?.portal_token || project?.id;
    return clientPortalService.saveDiscoveryDraft(saveToken, payload);
  };

  const handleFinish = async () => {
    if (step === 6 && !styles.length) {
      setMessage("Choose at least one visual style.");
      return;
    }

    // Verify all Step 1 fields have meaningful answers before proceeding to review
    const basicFields = [
      { key: "whatDo", label: "What does your business do?" },
      { key: "targetCustomer", label: "Who is your target customer?" },
      { key: "whyChooseUs", label: "Why should they choose you?" },
      { key: "brandFeeling", label: "How should your brand make people feel?" },
    ];
    for (const field of basicFields) {
      const qualityErr = validateDiscoveryInputQuality(basics[field.key], field.label);
      if (qualityErr) {
        setMessage(qualityErr);
        setStep(1);
        return;
      }
    }

    setSaving(true);
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
      const draft = { basics, sliders, emotions, persona, styles, comps, step };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
      const saveToken = targetPortalToken || project?.portal_token || project?.id;
      if (saveToken) {
        await clientPortalService.saveDiscoveryDraft(saveToken, payload);
      }
    } catch (err) {
      console.warn("Saving draft on review transition error:", err);
    } finally {
      setSaving(false);
      setMessage("");
      onNext("review");
    }
  };

  async function nextStep() {
    if (isReadOnly) return;

    if (step === 1) {
      const basicFields = [
        { key: "whatDo", label: "What does your business do?" },
        { key: "targetCustomer", label: "Who is your target customer?" },
        { key: "whyChooseUs", label: "Why should they choose you?" },
        { key: "brandFeeling", label: "How should your brand make people feel?" },
      ];
      for (const field of basicFields) {
        const qualityErr = validateDiscoveryInputQuality(basics[field.key], field.label);
        if (qualityErr) {
          setMessage(qualityErr);
          return;
        }
      }
    }

    const valid =
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

    const next = step + 1;
    setSaving(true);
    setMessage("");

    try {
      const data = await saveDiscoveryProgress(next);

      if (data.success) {
        if (activeHelpSession?.is_active) {
          const stepTitle = stepTitles[step] || `Step ${step}`;
          supportSocket.resolveHelp({ pageId: stepTitle });
          if (targetPortalToken) {
            clientPortalService.resolveHelp(targetPortalToken, { pageId: stepTitle }).catch(() => undefined);
          }
          setActiveHelpSession(null);
        }

        // Broadcast all completed frame values over WebSocket so consultant reflects them immediately
        if (step === 1) {
          supportSocket.syncField({ pageId: "frame_1", fieldKey: "basics.whatDo", value: basics.whatDo });
          supportSocket.syncField({ pageId: "frame_1", fieldKey: "basics.targetCustomer", value: basics.targetCustomer });
          supportSocket.syncField({ pageId: "frame_1", fieldKey: "basics.whyChooseUs", value: basics.whyChooseUs });
          supportSocket.syncField({ pageId: "frame_1", fieldKey: "basics.brandFeeling", value: basics.brandFeeling });
        } else if (step === 2 || step === 3) {
          Object.entries(sliders).forEach(([sliderKey, val]) => {
            supportSocket.syncField({ pageId: `frame_${step}`, fieldKey: `slider.${sliderKey}`, value: val });
          });
        } else if (step === 4) {
          supportSocket.syncField({ pageId: "frame_4", fieldKey: "emotions", value: emotions });
          supportSocket.syncField({ pageId: "frame_4", fieldKey: "selectedEmotions", value: emotions });
        } else if (step === 5) {
          supportSocket.syncField({ pageId: "frame_5", fieldKey: "persona", value: persona });
          supportSocket.syncField({ pageId: "frame_5", fieldKey: "selectedAudience", value: persona ? [persona] : [] });
          supportSocket.syncField({ pageId: "frame_5", fieldKey: "comps", value: comps });
          supportSocket.syncField({ pageId: "frame_5", fieldKey: "competitors", value: comps });
        } else if (step === 6) {
          supportSocket.syncField({ pageId: "frame_6", fieldKey: "styles", value: styles });
          supportSocket.syncField({ pageId: "frame_6", fieldKey: "selectedVisual", value: styles });
        }

        const frameSnapshot = {
          step: next,
          basics: { ...basics },
          sliders: { ...sliders },
          emotions: [...emotions],
          persona,
          comps: [...comps],
          styles: [...styles],
        };

        setStep(next);
        if (typeof onStepChange === "function") {
          onStepChange(next);
        }
        if (typeof window !== "undefined" && targetPortalToken) {
          window.sessionStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(next));
          window.localStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(next));
        }
        supportSocket.navigateStep({ step: next, pageId: `frame_${next}`, frameData: frameSnapshot });
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

  function prevStep() {
    if (step <= 1) return;
    const prev = step - 1;
    setStep(prev);
    if (typeof onStepChange === "function") {
      onStepChange(prev);
    }
    if (typeof window !== "undefined" && targetPortalToken) {
      window.sessionStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(prev));
      window.localStorage.setItem(`floxa-client-step-${targetPortalToken}`, String(prev));
    }
    supportSocket.navigateStep({ step: prev, pageId: `frame_${prev}` });
  }

  return (
    <div className="client-discovery-screen">
      <div className={`client-discovery-content ${isReadOnly ? "consultant-view-locked" : ""}`.trim()}>
        {isConsultantMode ? (
          isReadOnly ? (
            <div className="consultant-mode-banner read-only">
              <div>
                <strong><Eye size={13} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "5px" }} />View Mode:</strong> Client has not requested help on Step {step}. Inputs are locked.
              </div>
              <div className="consultant-mode-banner-badge">Read Only</div>
            </div>
          ) : (
            <div className="consultant-mode-banner live-edit">
              <div>
                <strong><span className="banner-pulse-dot" style={{ display: "inline-block", marginRight: "6px" }} />Live Assistance Active:</strong> Co-editing Step {step} with client in real-time.
                {activeHelpSession?.question ? <span style={{ display: "block", fontSize: "12px", opacity: 0.9 }}>Client Doubt: &quot;{activeHelpSession.question}&quot;</span> : null}
              </div>
              <div className="consultant-mode-banner-badge">
                <span className="banner-pulse-dot" /> Live
              </div>
            </div>
          )
        ) : null}

        <div className="client-discovery-topbar">
          <div className="client-small-logo">
            <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-small-logo-img" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {!isConsultantMode ? (
              isCurrentStepHelpActive ? (
                <button
                  type="button"
                  className="client-help-trigger-btn active-help"
                  onClick={resolveCurrentHelp}
                  title="Help Active • Click to Resolve"
                  aria-label="Help Active • Click to Resolve"
                >
                  <span className="banner-pulse-dot" />
                  <MessageSquare size={16} />
                  <span className="client-help-text">Help Active • Click to Resolve</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="client-help-trigger-btn"
                  onClick={() => setShowHelpModal(true)}
                  title={`Need Help on Step ${step}?`}
                  aria-label={`Need Help on Step ${step}?`}
                >
                  <MessageSquare size={16} />
                  <span className="client-help-text">Need Help on Step {step}?</span>
                </button>
              )
            ) : null}
            <div>
              Phase 2 of 9 <span>{pct}%</span>
            </div>
          </div>
        </div>

        <div className="client-discovery-dots">
          <span>Step {step} of 6</span>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStep(item);
                supportSocket.navigateStep({ step: item, pageId: `frame_${item}` });
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
              }}
              title={`Jump to Step ${item}`}
            >
              <i className={item < step ? "complete" : item === step ? "active" : ""} />
            </button>
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
                  disabled={isReadOnly}
                  onChange={(event) => handleBasicsChange(field.key, event.target.value)}
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
            {slidersOne.map(({ key, ...slider }, index) => (
              <SliderRow
                key={key}
                index={index}
                {...slider}
                disabled={isReadOnly}
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
            {slidersTwo.map(({ key, ...slider }, index) => (
              <SliderRow
                key={key}
                index={index}
                {...slider}
                disabled={isReadOnly}
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
                  disabled={isReadOnly}
                  onClick={() => handleEmotionToggle(word)}
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
                  disabled={isReadOnly}
                  onClick={() => handlePersonaSelect(item.name)}
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
                  disabled={isReadOnly}
                  onChange={(event) =>
                    handleCompsChange((current) =>
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
                      disabled={isReadOnly}
                      onClick={() =>
                        handleCompsChange((current) =>
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
                  disabled={isReadOnly}
                  onChange={(event) =>
                    handleCompsChange((current) =>
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
              {visualStylesList.map((style) => (
                <button
                  key={style.name}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleStylesToggle(style.name)}
                  className={`floxa-chip ${styles.includes(style.name) ? "active" : ""}`}
                >
                  {style.name}
                </button>
              ))}
            </div>
            <div className="client-helper-text">{styles.length} / 3 selected</div>
          </>
        ) : null}

        {message ? <div className="client-form-error">{message}</div> : null}

        <div className="client-discovery-actions">
          {step > 1 ? (
            <button type="button" onClick={prevStep}>
              Back
            </button>
          ) : (
            <button type="button" onClick={() => onNext("profile")}>
              Back
            </button>
          )}

          {step < 6 ? (
            <button type="button" onClick={nextStep} disabled={saving}>
              Next
            </button>
          ) : (
            <button type="button" className="client-review-pulse-btn" onClick={handleFinish} disabled={saving}>
              Review Before Submit
            </button>
          )}
        </div>
      </div>

      {showHelpModal ? (
        <div className="client-help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="client-help-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><MessageSquare size={18} /> Ask Consultant for Assistance</h3>
            <p>
              Stuck or confused on <strong>Step {step}</strong>? Your consultant will be notified instantly and can assist you live on this screen.
            </p>
            <textarea
              className="client-help-modal-textarea"
              placeholder="What are you confused about? (e.g. Which slider position or competitor details to include?)"
              value={helpQuestion}
              onChange={(e) => setHelpQuestion(e.target.value)}
              autoFocus
            />
            <div className="client-help-modal-actions">
              <button type="button" className="client-help-modal-cancel" onClick={() => setShowHelpModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="client-help-modal-submit"
                onClick={submitHelpRequest}
                disabled={isSubmittingHelp}
              >
                {isSubmittingHelp ? "Notifying..." : "Notify Consultant"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

const SLIDER_THUMB_COLORS = [
  { thumb: "#FACC15", glow: "rgba(250, 204, 21, 0.7)" }, // Yellow
  { thumb: "#4ADE80", glow: "rgba(74, 222, 128, 0.7)" }, // Green
  { thumb: "#F472B6", glow: "rgba(244, 114, 182, 0.7)" }, // Pink
  { thumb: "#F87171", glow: "rgba(248, 113, 113, 0.7)" }, // Coral Red
  { thumb: "#38BDF8", glow: "rgba(56, 189, 248, 0.7)" }, // Blue
  { thumb: "#A78BFA", glow: "rgba(167, 139, 250, 0.7)" }, // Purple
];

function SliderRow({ left, right, value, onChange, disabled, index = 0 }) {
  const color = SLIDER_THUMB_COLORS[index % SLIDER_THUMB_COLORS.length];

  return (
    <div
      className="client-slider-row"
      style={{
        "--slider-thumb-color": color.thumb,
        "--slider-thumb-glow": color.glow,
      }}
    >
      <div className="client-slider-labels">
        <span className="client-slider-label-left">{left}</span>
        <span className="client-slider-label-right">{right}</span>
      </div>
      <input
        type="range"
        min="-3"
        max="3"
        step="1"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="client-ticks-slider"
      />
    </div>
  );
}
