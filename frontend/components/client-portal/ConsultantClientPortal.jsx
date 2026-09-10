"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingCart, Gem, Globe, Sparkles, Sprout, Building2, X, ArrowLeft, ArrowRight, Video, MessageSquare, Eye } from "lucide-react";
import { supportSocket } from "../../services/supportSocketService";
import { clientPortalService } from "../../services/clientPortalService";
import { getProjects } from "@/lib/projectApi";
import { showSuccess } from "@/lib/toast";
import { webRTCService } from "../../services/webRTCService";
import { VideoCallModal } from "./VideoCallModal";
import "./ClientPortal.css";

const firstFrameFields = [
  {
    key: "what",
    label: "What do you do?",
    placeholder: "Describe your product or service in 2-3 sentences...",
  },
  {
    key: "customer",
    label: "Who is your target customer?",
    placeholder: "Demographics, mindset, and what they care about...",
  },
  {
    key: "choose",
    label: "Why should they choose you?",
    placeholder: "Your key differentiator from competitors...",
  },
  {
    key: "trust",
    label: "Why should they trust you?",
    placeholder: "Years of experience, certifications, key results...",
  },
];

const personalityOne = [
  ["Playful", "Serious"],
  ["Unconventional", "Mainstream"],
  ["Industrial", "Natural"],
  ["Approachable", "Elite"],
  ["Casual", "Elegant"],
  ["Refined", "Strong"],
];

const personalityTwo = [
  ["Feminine", "Masculine"],
  ["Simple", "Complex"],
  ["Youthful", "Established"],
  ["Subtle", "Bright"],
  ["Classic", "Contemporary"],
  ["Friendly", "Authoritative"],
  ["Economical", "Expensive"],
];

const sliderKeyToPair = {
  playfulSerious: "Playful-Serious",
  unconventionalMainstream: "Unconventional-Mainstream",
  industrialNatural: "Industrial-Natural",
  approachableElite: "Approachable-Elite",
  casualElegant: "Casual-Elegant",
  refinedStrong: "Refined-Strong",
  feminineMasculine: "Feminine-Masculine",
  simpleComplex: "Simple-Complex",
  youthfulEstablished: "Youthful-Established",
  subtleBright: "Subtle-Bright",
  classicContemporary: "Classic-Contemporary",
  friendlyAuthoritative: "Friendly-Authoritative",
  economicalExpensive: "Economical-Expensive",
};

const pairToSliderKey = Object.fromEntries(
  Object.entries(sliderKeyToPair).map(([k, v]) => [v, k])
);

const emotions = [
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

const defaultCompetitors = [
  { name: "", rating: "", reason: "" },
  { name: "", rating: "", reason: "" },
  { name: "", rating: "", reason: "" },
];

const visualOptions = [
  ["Bold & Loud", "High contrast, big type, intense color"],
  ["Minimal & Clean", "Generous whitespace, restraint, precision"],
  ["Warm & Earthy", "Natural tones, organic textures, approachable"],
  ["Dark & Luxurious", "Deep palettes, metallic accents, moody"],
  ["Playful & Vibrant", "Bright colors, rounded shapes, energy"],
  ["Editorial & Typographic", "Serif-led, sophisticated, literary feel"],
];

const defaultAnswers = {
  what: "",
  customer: "",
  choose: "",
  trust: "",
  whatDoYouDo: "",
  targetCustomer: "",
  whyChooseYou: "",
  whyTrustYou: "",
};

function ChoiceIcon({ icon }) {
  switch (icon) {
    case "cart":
      return <ShoppingCart size={16} strokeWidth={1.8} />;
    case "gem":
      return <Gem size={16} strokeWidth={1.8} />;
    case "globe":
      return <Globe size={16} strokeWidth={1.8} />;
    case "spark":
      return <Sparkles size={16} strokeWidth={1.8} />;
    case "sprout":
      return <Sprout size={16} strokeWidth={1.8} />;
    case "building":
      return <Building2 size={16} strokeWidth={1.8} />;
    default:
      return <Sparkles size={16} strokeWidth={1.8} />;
  }
}

const makeSliderState = (pairs) =>
  pairs.reduce((acc, pair) => ({ ...acc, [pair.join("-")]: 0 }), {});

function StepDots({ active, total = 6 }) {
  return (
    <div className="cp-dots" aria-label={`Step ${active} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span className={index + 1 === active ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function PortalHeader({ onClose, onVideoCall, callState }) {
  return (
    <header className="cp-header">
      <div className="cp-logo">
        <img src="/image/FLOXA_log.png" alt="FLOXA" className="cp-logo-img" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onVideoCall ? (
          <button
            type="button"
            className={`floxa-nav-video-btn ${callState === "incoming_ringing" ? "ringing" : ""}`}
            onClick={onVideoCall}
            title={
              callState === "connected"
                ? "In Call"
                : callState === "incoming_ringing"
                  ? "Incoming Call!"
                  : "Video Call"
            }
          >
            <Video size={24} strokeWidth={2} />
          </button>
        ) : null}
        {onClose ? (
          <button className="cp-close" onClick={onClose} type="button">
            <X size={15} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
            Close
          </button>
        ) : null}
      </div>
    </header>
  );
}

function PortalCard({
  step,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  submit,
  isConsultantMode,
  isReadOnly,
  isCurrentStepHelpActive,
  activeHelpSession,
  onOpenHelp,
  onResolveHelp,
}) {
  return (
    <section className="cp-card">
      {isConsultantMode ? (
        isReadOnly ? (
          <div className="consultant-mode-banner read-only">
            <div>
              <strong><Eye size={13} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "5px" }} />View Mode:</strong> Client has not requested help on Frame {step}. Inputs are locked.
            </div>
            <div className="consultant-mode-banner-badge">Read Only</div>
          </div>
        ) : (
          <div className="consultant-mode-banner live-edit">
            <div>
              <strong><span className="banner-pulse-dot" style={{ display: "inline-block", marginRight: "6px" }} />Live Assistance Active:</strong> Assisting client on Frame {step} in real-time.
              {activeHelpSession?.question ? (
                <span style={{ display: "block", fontSize: "12px", opacity: 0.9 }}>
                  Client Doubt: &quot;{activeHelpSession.question}&quot;
                </span>
              ) : null}
            </div>
            <div className="consultant-mode-banner-badge">
              <span className="banner-pulse-dot" /> Live
            </div>
          </div>
        )
      ) : null}

      <div className="cp-card-top">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span>Discovery</span>
          {!isConsultantMode ? (
            isCurrentStepHelpActive ? (
              <button
                type="button"
                className="client-help-trigger-btn active-help"
                onClick={onResolveHelp}
              >
                <span className="banner-pulse-dot" /> Help Active • Click to Resolve
              </button>
            ) : (
              <button
                type="button"
                className="client-help-trigger-btn"
                onClick={onOpenHelp}
              >
                <MessageSquare size={13} /> Need Help on Frame {step}?
              </button>
            )
          ) : null}
        </div>
        <StepDots active={step} />
      </div>

      <div className="cp-step-copy">
        <div className="cp-frame">Frame {step} of 6</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={`cp-card-body ${isReadOnly ? "consultant-view-locked" : ""}`.trim()}>
        {children}
      </div>
      <footer className="cp-card-footer">
        <button className="cp-back" type="button" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
          Back
        </button>
        <StepDots active={step} />
        {!isConsultantMode ? (
          <button
            className="cp-primary cp-footer-btn"
            type="button"
            onClick={onNext}
            disabled={isReadOnly}
          >
            {submit ? "Submit Discovery" : "Continue"}
            <ArrowRight size={14} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginLeft: "4px" }} />
          </button>
        ) : !submit ? (
          <button
            className="cp-primary cp-footer-btn"
            type="button"
            onClick={onNext}
            disabled={isReadOnly}
          >
            Continue
            <ArrowRight size={14} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginLeft: "4px" }} />
          </button>
        ) : null}
      </footer>
    </section>
  );
}




const SLIDER_THUMB_COLORS = [
  { thumb: "#FACC15", glow: "rgba(250, 204, 21, 0.75)" }, // Yellow
  { thumb: "#22C55E", glow: "rgba(34, 197, 94, 0.75)" },  // Green
  { thumb: "#F472B6", glow: "rgba(244, 114, 182, 0.75)" }, // Pink
  { thumb: "#F87171", glow: "rgba(248, 113, 113, 0.75)" }, // Coral Red
  { thumb: "#38BDF8", glow: "rgba(56, 189, 248, 0.75)" }, // Blue
  { thumb: "#A78BFA", glow: "rgba(167, 139, 250, 0.75)" }, // Purple
];

function SliderRows({ pairs, values, setValues, isReadOnly, onSync }) {
  return (
    <div className="cp-slider-list">
      {pairs.map(([left, right], index) => {
        const key = `${left}-${right}`;
        const val = values[key] ?? 0;
        const color = SLIDER_THUMB_COLORS[index % SLIDER_THUMB_COLORS.length];
        return (
          <div
            className="client-slider-row"
            key={key}
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
              aria-label={`${left} to ${right}`}
              disabled={isReadOnly}
              max="3"
              min="-3"
              onChange={(event) => {
                const numVal = Number(event.target.value);
                setValues((current) => ({
                  ...current,
                  [key]: numVal,
                }));
                if (onSync) onSync(key, numVal);
              }}
              step="1"
              type="range"
              value={val}
              className="client-ticks-slider"
            />
          </div>
        );
      })}
    </div>
  );
}

function ChoiceGrid({ items, selected, setSelected, limit = 1, className = "", isReadOnly, onSync }) {
  function toggle(value) {
    if (isReadOnly) return;
    setSelected((current) => {
      let next;
      if (current.includes(value)) {
        next = current.filter((item) => item !== value);
      } else if (limit === 1) {
        next = [value];
      } else {
        next = current.length >= limit ? current : [...current, value];
      }
      if (onSync) onSync(next);
      return next;
    });
  }

  return (
    <div className={`cp-choice-grid ${className}`.trim()}>
      {items.map((item) => {
        const [icon, title, copy] = item.length === 3 ? item : ["", item[0], item[1]];
        const isSelected = selected.includes(title);
        return (
          <button
            className={`cp-choice ${isSelected ? "selected" : ""}`.trim()}
            key={title}
            disabled={isReadOnly}
            onClick={() => toggle(title)}
            type="button"
          >
            {icon ? (
              <span className={`cp-choice-icon ${icon}`.trim()}>
                <ChoiceIcon icon={icon} />
              </span>
            ) : null}
            <strong>{title}</strong>
            {copy ? <small>{copy}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function ConsultantClientPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConsultantMode = searchParams?.get("mode") !== "client";
  const urlToken = searchParams?.get("token") || "";

  const [entered, setEntered] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(`floxa-portal-entered-${urlToken || "default"}`) === "true";
  });
  const [finished, setFinished] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(`floxa-portal-finished-${urlToken || "default"}`) === "true";
  });
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = parseInt(window.sessionStorage.getItem(`floxa-portal-step-${urlToken || "default"}`) || "1", 10);
    return saved >= 1 && saved <= 6 ? saved : 1;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(`floxa-portal-entered-${urlToken || "default"}`, String(entered));
      window.sessionStorage.setItem(`floxa-portal-finished-${urlToken || "default"}`, String(finished));
      window.sessionStorage.setItem(`floxa-portal-step-${urlToken || "default"}`, String(step));
    }
  }, [entered, finished, step, urlToken]);
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState(defaultAnswers);
  const [sliderOne, setSliderOne] = useState(() => makeSliderState(personalityOne));
  const [sliderTwo, setSliderTwo] = useState(() => makeSliderState(personalityTwo));
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [selectedAudience, setSelectedAudience] = useState([]);
  const [selectedLogo, setSelectedLogo] = useState([]);
  const [competitors, setCompetitors] = useState(defaultCompetitors);
  const [selectedVisual, setSelectedVisual] = useState([]);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);

  const [activeHelpSession, setActiveHelpSession] = useState(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpQuestion, setHelpQuestion] = useState("");

  const pageId = `frame_${step}`;
  const isCurrentStepHelpActive = Boolean(
    activeHelpSession?.is_active && (
      activeHelpSession?.page_id === pageId ||
      activeHelpSession?.page_id?.toLowerCase().includes(`step ${step}`) ||
      activeHelpSession?.page_id?.toLowerCase().includes(`frame_${step}`) ||
      activeHelpSession?.page_id?.toLowerCase().includes(`frame ${step}`)
    )
  );
  const isReadOnly = Boolean(isConsultantMode && !isCurrentStepHelpActive);

  const [callState, setCallState] = useState("idle");

  useEffect(() => {
    return webRTCService.on("state_change", (state) => {
      setCallState(state);
    });
  }, []);

  const handleConsultantVideoCall = () => {
    if (callState === "incoming_ringing") {
      webRTCService.acceptCall();
    } else if (callState === "connected") {
      // already in call
    } else {
      if (project?.id) {
        webRTCService.initiateCall({
          projectId: project.id,
          clientName: project.client_name || project.company_name || "Client",
          projectTitle: project.title,
          role: "consultant",
        });
      }
    }
  };

  // Load project context
  useEffect(() => {
    async function loadProjectContext() {
      try {
        let list = await clientPortalService.getClientList();
        if (!Array.isArray(list) || list.length === 0) {
          try {
            list = await getProjects();
          } catch (e) {
            console.warn("getProjects fallback error:", e);
          }
        }
        if (Array.isArray(list) && list.length > 0) {
          setProjects(list);
          const first = list[0];
          setProject(first);
          const clientMail = first.client_email || first.client?.email || "";
          if (clientMail) setEmail(clientMail);
        }

        if (urlToken) {
          const resp = await clientPortalService.checkPortalAccess(urlToken);
          if (resp?.success && resp?.data) {
            setProject(resp.data);
            const clientMail = resp.data.clientEmail || resp.data.client_email || "";
            if (clientMail) setEmail(clientMail);
            setEntered(true);
          }
        }
      } catch (err) {
        console.warn("Could not fetch project for portal:", err);
      }
    }
    loadProjectContext();
  }, [urlToken]);

  // Connect to WebSocket for real-time live assistance
  useEffect(() => {
    const portalToken = project?.portal_token || urlToken;
    if (!portalToken) return;

    const handleActiveHelp = (activeHelp) => {
      if (!activeHelp || !activeHelp.is_active) return;
      setActiveHelpSession(activeHelp);
      const pid = String(activeHelp.page_id || "");
      const match = pid.match(/\d+/);
      if (match) {
        const frameNum = parseInt(match[0], 10);
        if (frameNum >= 1 && frameNum <= 9) {
          setStep(frameNum);
        }
      }
    };

    // Fetch initial help status immediately from REST API
    clientPortalService.getHelpStatus(portalToken).then((res) => {
      if (res?.success && res?.active_help) {
        handleActiveHelp(res.active_help);
      }
    });

    // Fetch existing discovery draft from server
    const fetchDiscovery = async () => {
      try {
        const res = await clientPortalService.getDiscoveryDraft(portalToken);
        if (res?.success && res.data) {
          const disc = res.data;
          const whatText = disc.what_business_does || disc.business_description || disc.businessDescription || disc.whatDo || disc.whatDoYouDo || "";
          const customerText = disc.target_customer || disc.targetCustomer || "";
          const whyChooseText = disc.why_choose_us || disc.whyChooseUs || disc.whyChooseYou || "";
          const brandFeelingText = disc.brand_feeling || disc.brandFeeling || disc.whyTrustYou || "";

          setAnswers((prev) => ({
            ...prev,
            what: whatText || prev.what,
            whatDoYouDo: whatText || prev.whatDoYouDo,
            customer: customerText || prev.customer,
            targetCustomer: customerText || prev.targetCustomer,
            choose: whyChooseText || prev.choose,
            whyChooseYou: whyChooseText || prev.whyChooseYou,
            trust: brandFeelingText || prev.trust,
            whyTrustYou: brandFeelingText || prev.whyTrustYou,
          }));

          if (Array.isArray(disc.personality_sliders) || Array.isArray(disc.sliders)) {
            const serverSliders = disc.personality_sliders || disc.sliders;
            setSliderOne((prev) => {
              const updated = { ...prev };
              serverSliders.forEach((s) => {
                const pairKey = sliderKeyToPair[s.slider_key] || s.slider_key;
                if (updated[pairKey] !== undefined) {
                  updated[pairKey] = s.value !== undefined ? Math.round((s.value / 100) * 6 - 3) : 0;
                }
              });
              return updated;
            });
            setSliderTwo((prev) => {
              const updated = { ...prev };
              serverSliders.forEach((s) => {
                const pairKey = sliderKeyToPair[s.slider_key] || s.slider_key;
                if (updated[pairKey] !== undefined) {
                  updated[pairKey] = s.value !== undefined ? Math.round((s.value / 100) * 6 - 3) : 0;
                }
              });
              return updated;
            });
          }

          if (Array.isArray(disc.emotions)) {
            const mappedEmotions = disc.emotions
              .map((e) => (typeof e === "string" ? e : e.emotion))
              .filter(Boolean);
            setSelectedEmotions(mappedEmotions);
          }
          if (disc.audience_archetype || disc.persona) {
            setSelectedAudience([disc.audience_archetype || disc.persona]);
          }
          if (Array.isArray(disc.competitors) && disc.competitors.length > 0) {
            const loadedComps = [0, 1, 2].map((i) => {
              const c = disc.competitors[i];
              if (c && typeof c === "object") {
                return {
                  name: c.name || "",
                  rating: c.rating || "",
                  reason: c.reason || "",
                };
              }
              return { name: typeof c === "string" ? c : "", rating: "", reason: "" };
            });
            setCompetitors(loadedComps);
          }
          if (Array.isArray(disc.visual_styles) && disc.visual_styles.length > 0) {
            setSelectedVisual(disc.visual_styles.map((v) => (typeof v === "string" ? v : v.style)).filter(Boolean));
          }
          if (disc.is_submitted || disc.isSubmitted) {
            setFinished(true);
            if (urlToken) setEntered(true);
          } else if (typeof disc.step === "number" && disc.step >= 1 && disc.step <= 6) {
            setStep(disc.step);
            if (urlToken) setEntered(true);
          }
        }
      } catch (err) {
        console.warn("Could not prefill discovery draft in portal:", err);
      }
    };
    fetchDiscovery();

    const consultantToken = isConsultantMode
      ? localStorage.getItem("floxa_jwt") || ""
      : "";

    supportSocket.connect({ portalToken, consultantToken });

    const unsubscribeInitial = supportSocket.on("initial_state", (data) => {
      if (data?.active_help) {
        handleActiveHelp(data.active_help);
      }
    });

    const unsubscribeHelpReq = supportSocket.on("help_requested", (data) => {
      handleActiveHelp(data);
    });

    const unsubscribeHelpResolved = supportSocket.on("help_resolved", () => {
      setActiveHelpSession(null);
    });

    const unsubscribeFieldSync = supportSocket.on("field_sync", (data) => {
      if (data.field_key.startsWith("basics.") || data.field_key.startsWith("answers.")) {
        const rawKey = data.field_key.split(".")[1];
        if (rawKey === "businessDescription" || rawKey === "whatDo" || rawKey === "whatDoYouDo" || rawKey === "what") {
          setAnswers((prev) => ({ ...prev, what: data.value, whatDoYouDo: data.value }));
        } else if (rawKey === "whyChooseUs" || rawKey === "whyChooseYou" || rawKey === "choose") {
          setAnswers((prev) => ({ ...prev, choose: data.value, whyChooseYou: data.value }));
        } else if (rawKey === "brandFeeling" || rawKey === "whyTrustYou" || rawKey === "trust") {
          setAnswers((prev) => ({ ...prev, trust: data.value, whyTrustYou: data.value }));
        } else if (rawKey === "targetCustomer" || rawKey === "customer") {
          setAnswers((prev) => ({ ...prev, customer: data.value, targetCustomer: data.value }));
        }
      } else if (data.field_key === "sliderOne" && typeof data.value === "object") {
        setSliderOne(data.value);
      } else if (data.field_key === "sliderTwo" && typeof data.value === "object") {
        setSliderTwo(data.value);
      } else if (data.field_key.startsWith("slider.")) {
        const sliderKey = data.field_key.replace("slider.", "");
        const pairKey = sliderKeyToPair[sliderKey] || sliderKey;
        const numVal = Number(data.value) || 0;
        setSliderOne((prev) => (prev[pairKey] !== undefined ? { ...prev, [pairKey]: numVal } : prev));
        setSliderTwo((prev) => (prev[pairKey] !== undefined ? { ...prev, [pairKey]: numVal } : prev));
      } else if (data.field_key === "selectedEmotions" || data.field_key === "emotions") {
        setSelectedEmotions(data.value || []);
      } else if (data.field_key === "selectedAudience" || data.field_key === "persona") {
        const val = Array.isArray(data.value) ? (data.value[0] || "") : (data.value || "");
        setSelectedAudience(val ? [val] : []);
      } else if (data.field_key === "selectedLogo") {
        setSelectedLogo(data.value || []);
      } else if (data.field_key === "competitors" || data.field_key === "comps") {
        if (Array.isArray(data.value)) {
          const loadedComps = [0, 1, 2].map((i) => {
            const c = data.value[i];
            if (c && typeof c === "object") {
              return { name: c.name || "", rating: c.rating || "", reason: c.reason || "" };
            }
            return { name: typeof c === "string" ? c : "", rating: "", reason: "" };
          });
          setCompetitors(loadedComps);
        }
      } else if (data.field_key === "selectedVisual" || data.field_key === "styles") {
        setSelectedVisual(data.value || []);
      }
    });

    const unsubscribeStepNav = supportSocket.on("step_navigate", (data) => {
      if (typeof data.step === "number" && data.step >= 1 && data.step <= 9) {
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
  }, [project?.portal_token, urlToken, isConsultantMode, entered]);

  // Auto-save consultant assisted changes to database
  useEffect(() => {
    if (isReadOnly || !entered) return;
    const portalToken = project?.portal_token || urlToken;
    if (!portalToken) return;

    const timeout = window.setTimeout(() => {
      clientPortalService.saveDiscoveryDraft(portalToken, {
        whatDo: answers.what || answers.whatDoYouDo,
        business_description: answers.what || answers.whatDoYouDo,
        targetCustomer: answers.customer || answers.targetCustomer,
        whyChooseUs: answers.choose || answers.whyChooseYou,
        brandFeeling: answers.trust || answers.whyTrustYou,
        step,
      }).catch(() => undefined);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [answers, step, project?.portal_token, urlToken, isReadOnly, entered]);

  const canStart = email.trim().includes("@");
  const resultLine = useMemo(() => {
    if (selectedEmotions.includes("Bold")) return "Built to feel confident, sharp, and memorable.";
    if (selectedVisual.includes("Warm & Organic")) return "Designed to feel thoughtful, human, and grounded.";
    return "We believe in doing everything well.";
  }, [selectedEmotions, selectedVisual]);

  function updateAnswer(key, value) {
    if (isReadOnly) return;
    setAnswers((current) => ({
      ...current,
      [key]: value,
      ...(key === "what" ? { whatDoYouDo: value } : {}),
      ...(key === "customer" ? { targetCustomer: value } : {}),
      ...(key === "choose" ? { whyChooseYou: value } : {}),
      ...(key === "trust" ? { whyTrustYou: value } : {}),
    }));

    supportSocket.syncField({
      pageId,
      fieldKey: `answers.${key}`,
      value,
    });

    if (key === "what" || key === "whatDoYouDo") {
      supportSocket.syncField({ pageId, fieldKey: "basics.whatDo", value });
      supportSocket.syncField({ pageId, fieldKey: "basics.businessDescription", value });
      supportSocket.syncField({ pageId, fieldKey: "answers.whatDoYouDo", value });
    } else if (key === "choose" || key === "whyChooseYou") {
      supportSocket.syncField({ pageId, fieldKey: "basics.whyChooseUs", value });
      supportSocket.syncField({ pageId, fieldKey: "answers.whyChooseYou", value });
    } else if (key === "trust" || key === "whyTrustYou") {
      supportSocket.syncField({ pageId, fieldKey: "basics.brandFeeling", value });
      supportSocket.syncField({ pageId, fieldKey: "answers.whyTrustYou", value });
    } else if (key === "customer" || key === "targetCustomer") {
      supportSocket.syncField({ pageId, fieldKey: "basics.targetCustomer", value });
      supportSocket.syncField({ pageId, fieldKey: "answers.targetCustomer", value });
    }
  }

  function goNext() {
    if (isReadOnly) return;
    if (step === 6) {
      setFinished(true);
      return;
    }
    const next = Math.min(step + 1, 6);
    setStep(next);
    supportSocket.navigateStep({ step: next, pageId: `frame_${next}` });
  }

  const handleClosePortal = useCallback(() => {
    setEntered(false);
    setStep(1);
    setFinished(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(`floxa-portal-entered-${urlToken || "default"}`, "false");
      window.sessionStorage.setItem(`floxa-portal-finished-${urlToken || "default"}`, "false");
      window.sessionStorage.setItem(`floxa-portal-step-${urlToken || "default"}`, "1");
    }
  }, [urlToken]);

  function goBack() {
    if (step <= 1) {
      handleClosePortal();
      return;
    }
    const prev = Math.max(step - 1, 1);
    setStep(prev);
    supportSocket.navigateStep({ step: prev, pageId: `frame_${prev}` });
  }

  const updateCompetitor = (index, field, value) => {
    if (isReadOnly) return;
    setCompetitors((current) => {
      const base = Array.isArray(current) && current.length === 3 ? current : defaultCompetitors;
      const next = base.map((item, i) =>
        i === index
          ? {
            ...item,
            [field]: field === "rating" && item.rating === value ? "" : value,
          }
          : item
      );
      supportSocket.syncField({ pageId, fieldKey: "comps", value: next });
      supportSocket.syncField({ pageId, fieldKey: "competitors", value: next });
      return next;
    });
  };

  const submitHelpRequest = () => {
    supportSocket.requestHelp({
      pageId,
      fieldKey: "",
      question: helpQuestion.trim() || `I need guidance with Frame ${step}.`,
    });
    setActiveHelpSession({
      page_id: pageId,
      question: helpQuestion.trim(),
      is_active: true,
    });
    setShowHelpModal(false);
    setHelpQuestion("");
    showSuccess(`Help requested on Frame ${step}. Consultant has been notified!`);
  };

  const resolveCurrentHelp = () => {
    supportSocket.resolveHelp({ pageId });
    setActiveHelpSession(null);
    showSuccess("Help session marked as resolved.");
  };

  const cardProps = {
    step,
    isConsultantMode,
    isReadOnly,
    isCurrentStepHelpActive,
    activeHelpSession,
    onBack: goBack,
    onNext: goNext,
    onOpenHelp: () => setShowHelpModal(true),
    onResolveHelp: resolveCurrentHelp,
  };

  if (finished) {
    return (
      <main className="cp-screen">
        <PortalHeader onClose={handleClosePortal} />
        <section className="cp-result-card">
          <div className="cp-frame">Your brand personality</div>
          <h1>Balanced</h1>
          <div className="cp-archetype">* The Harmonist Archetype</div>
          <p>{resultLine}</p>
          <div className="cp-result-grid">
            <div>
              <span>Tone</span>
              <strong>Balanced & Thoughtful</strong>
            </div>
            <div>
              <span>Brand Promise</span>
              <strong>{resultLine}</strong>
            </div>
            <div>
              <span>Tagline</span>
              <strong>Crafted with intention</strong>
            </div>
          </div>
          <p className="cp-result-note">
            Your consultant has been notified. Expect your full brand brief within 48 hours.
          </p>
        </section>
      </main>
    );
  }

  if (!entered) {
    return (
      <main className="cp-screen" onClick={() => router.push("/")}>
        <PortalHeader />
        <section className="cp-entry-card" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="cp-entry-card-close"
            onClick={() => router.push("/")}
            aria-label="Close"
          >
            <X size={15} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
            Close
          </button>
          <div className="cp-orb" aria-hidden="true" />
          <h1>{"Let's discover your brand."}</h1>
          <p>
            {"You've"} been invited to complete a 12-minute brand discovery session. Your answers
            help craft your unique brand identity.
          </p>

          {projects.length > 0 ? (
            <label className="cp-field" style={{ marginBottom: "16px" }}>
              <span>Select Client / Project</span>
              <select
                style={{
                  width: "100%",
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  color: "#f8fafc",
                  fontSize: "14px",
                  outline: "none",
                  cursor: "pointer",
                }}
                onChange={async (e) => {
                  const selected = projects.find((p) => p.portal_token === e.target.value);
                  if (selected) {
                    setProject(selected);
                    const clientMail = selected.client?.email || selected.client_email || "";
                    if (clientMail) setEmail(clientMail);

                    clientPortalService.getHelpStatus(selected.portal_token).then((res) => {
                      if (res?.success && res?.active_help) {
                        setActiveHelpSession(res.active_help);
                        const match = String(res.active_help.page_id || "").match(/\d+/);
                        if (match) {
                          const f = parseInt(match[0], 10);
                          if (f >= 1 && f <= 9) setStep(f);
                        }
                      }
                    });

                    clientPortalService.getDiscoveryDraft(selected.portal_token).then((res) => {
                      if (res?.success && res.data) {
                        const disc = res.data;
                        const whatText = disc.what_business_does || disc.business_description || disc.businessDescription || disc.whatDo || disc.whatDoYouDo || "";
                        const customerText = disc.target_customer || disc.targetCustomer || "";
                        const whyChooseText = disc.why_choose_us || disc.whyChooseUs || disc.whyChooseYou || "";
                        const brandFeelingText = disc.brand_feeling || disc.brandFeeling || disc.whyTrustYou || "";

                        setAnswers((prev) => ({
                          ...prev,
                          what: whatText || prev.what,
                          whatDoYouDo: whatText || prev.whatDoYouDo,
                          customer: customerText || prev.customer,
                          targetCustomer: customerText || prev.targetCustomer,
                          choose: whyChooseText || prev.choose,
                          whyChooseYou: whyChooseText || prev.whyChooseYou,
                          trust: brandFeelingText || prev.trust,
                          whyTrustYou: brandFeelingText || prev.whyTrustYou,
                        }));

                        if (Array.isArray(disc.personality_sliders) || Array.isArray(disc.sliders)) {
                          const serverSliders = disc.personality_sliders || disc.sliders;
                          setSliderOne((prev) => {
                            const updated = { ...prev };
                            serverSliders.forEach((s) => {
                              const pairKey = sliderKeyToPair[s.slider_key] || s.slider_key;
                              if (updated[pairKey] !== undefined) {
                                updated[pairKey] = s.value !== undefined ? Math.round((s.value / 100) * 6 - 3) : 0;
                              }
                            });
                            return updated;
                          });
                          setSliderTwo((prev) => {
                            const updated = { ...prev };
                            serverSliders.forEach((s) => {
                              const pairKey = sliderKeyToPair[s.slider_key] || s.slider_key;
                              if (updated[pairKey] !== undefined) {
                                updated[pairKey] = s.value !== undefined ? Math.round((s.value / 100) * 6 - 3) : 0;
                              }
                            });
                            return updated;
                          });
                        }

                        if (Array.isArray(disc.emotions)) {
                          const mappedEmotions = disc.emotions
                            .map((e) => (typeof e === "string" ? e : e.emotion))
                            .filter(Boolean);
                          setSelectedEmotions(mappedEmotions);
                        }
                        if (disc.audience_archetype || disc.persona) {
                          setSelectedAudience([disc.audience_archetype || disc.persona]);
                        }
                        if (Array.isArray(disc.competitors) && disc.competitors.length > 0) {
                          const loadedComps = [0, 1, 2].map((i) => {
                            const c = disc.competitors[i];
                            if (c && typeof c === "object") {
                              return { name: c.name || "", rating: c.rating || "", reason: c.reason || "" };
                            }
                            return { name: typeof c === "string" ? c : "", rating: "", reason: "" };
                          });
                          setCompetitors(loadedComps);
                        }
                        if (Array.isArray(disc.visual_styles) && disc.visual_styles.length > 0) {
                          setSelectedVisual(disc.visual_styles.map((v) => (typeof v === "string" ? v : v.style)).filter(Boolean));
                        }
                      }
                    });
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  -- Select a client to auto-fill --
                </option>
                {projects.map((p) => (
                  <option key={p.portal_token} value={p.portal_token}>
                    {p.company_name || p.title} ({p.client?.name || p.client_name || p.client_email || "Client"})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="cp-field">
            <span>Your email address</span>
            <input
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <button
            className="cp-primary cp-enter"
            disabled={!canStart}
            onClick={() => setEntered(true)}
            type="button"
          >
            {"Enter portal"}
          </button>
          <small>Answers are shared only with your consultant and kept securely encrypted.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="cp-screen">
      <PortalHeader
        onClose={handleClosePortal}
        onVideoCall={isConsultantMode ? handleConsultantVideoCall : undefined}
        callState={callState}
      />

      {step === 1 ? (
        <PortalCard
          {...cardProps}
          subtitle="Tell us the core of what you do in your own words"
          title="Business Essentials"
        >
          <div className="cp-textarea-stack">
            {[
              {
                key: "whatDoYouDo",
                label: "WHAT DOES YOUR BUSINESS DO?",
                placeholder: "We help...",
              },
              {
                key: "targetCustomer",
                label: "WHO IS YOUR TARGET CUSTOMER?",
                placeholder: "Our customer is...",
              },
              {
                key: "whyChooseYou",
                label: "WHY SHOULD THEY CHOOSE YOU?",
                placeholder: "Unlike others, we...",
              },
              {
                key: "whyTrustYou",
                label: "HOW SHOULD YOUR BRAND MAKE PEOPLE FEEL?",
                placeholder: "People should feel...",
              },
            ].map((field) => (
              <label className="cp-field" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  disabled={isReadOnly}
                  onChange={(event) => updateAnswer(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  value={answers[field.key] || answers[field.key === "whatDoYouDo" ? "what" : field.key === "whyChooseYou" ? "choose" : field.key === "whyTrustYou" ? "trust" : "customer"] || ""}
                />
              </label>
            ))}
          </div>
        </PortalCard>
      ) : null}

      {step === 2 ? (
        <PortalCard
          {...cardProps}
          subtitle="Move each slider to describe your brand's character"
          title="How do you want to be perceived?"
        >
          <SliderRows
            isReadOnly={isReadOnly}
            pairs={personalityOne}
            setValues={setSliderOne}
            values={sliderOne}
            onSync={(pairKey, val) => {
              const camelKey = pairToSliderKey[pairKey] || pairKey;
              supportSocket.syncField({
                pageId,
                fieldKey: `slider.${camelKey}`,
                value: val,
              });
            }}
          />
        </PortalCard>
      ) : null}

      {step === 3 ? (
        <PortalCard
          {...cardProps}
          subtitle="Fine-tune the nuances of how your brand feels"
          title="Visual & Structural Identity"
        >
          <SliderRows
            isReadOnly={isReadOnly}
            pairs={personalityTwo}
            setValues={setSliderTwo}
            values={sliderTwo}
            onSync={(pairKey, val) => {
              const camelKey = pairToSliderKey[pairKey] || pairKey;
              supportSocket.syncField({
                pageId,
                fieldKey: `slider.${camelKey}`,
                value: val,
              });
            }}
          />
        </PortalCard>
      ) : null}

      {step === 4 ? (
        <PortalCard
          {...cardProps}
          subtitle="These guide your visual direction and tone of voice"
          title="Pick up to 8 words your brand should feel like"
        >
          <ChoiceGrid
            className="cp-emotion-grid"
            isReadOnly={isReadOnly}
            items={emotions.map((emotion) => [emotion, ""])}
            limit={8}
            selected={selectedEmotions}
            setSelected={setSelectedEmotions}
            onSync={(val) =>
              supportSocket.syncField({
                pageId,
                fieldKey: "selectedEmotions",
                value: val,
              })
            }
          />
          <p className="client-helper-counter" style={{ textAlign: "center", marginTop: "14px", color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>
            {selectedEmotions.length} / 8 selected
          </p>
        </PortalCard>
      ) : null}

      {step === 5 ? (
        <PortalCard
          {...cardProps}
          subtitle="Choose the archetype that best represents who buys from you"
          title="Who is your primary customer?"
        >
          <div className="client-persona-grid" style={{ marginBottom: "32px" }}>
            {personas.map((item) => {
              const selectedPersona = Array.isArray(selectedAudience) ? (selectedAudience[0] || "") : (selectedAudience || "");
              const isSelected = selectedPersona === item.name;
              return (
                <button
                  type="button"
                  key={item.name}
                  disabled={isReadOnly}
                  onClick={() => {
                    if (isReadOnly) return;
                    const next = isSelected ? "" : item.name;
                    setSelectedAudience(next ? [next] : []);
                    supportSocket.syncField({ pageId, fieldKey: "persona", value: next });
                    supportSocket.syncField({ pageId, fieldKey: "selectedAudience", value: next ? [next] : [] });
                  }}
                  className={isSelected ? "active" : ""}
                >
                  <strong>{item.name}</strong>
                  <span>{item.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="client-section-label" style={{ marginBottom: "16px" }}>Rate competitor brands</div>
          {(Array.isArray(competitors) && competitors.length === 3 ? competitors : defaultCompetitors).map((competitor, index) => (
            <div className="client-competitor-card" key={index} style={{ marginBottom: "16px" }}>
              <input
                value={competitor.name || ""}
                disabled={isReadOnly}
                onChange={(event) => updateCompetitor(index, "name", event.target.value)}
                placeholder={`Competitor ${index + 1} name`}
              />
              <div>
                {["like", "dislike"].map((rating) => (
                  <button
                    type="button"
                    key={rating}
                    disabled={isReadOnly}
                    onClick={() => updateCompetitor(index, "rating", rating)}
                    className={competitor.rating === rating ? rating : ""}
                  >
                    {rating === "like" ? "Like" : "Dislike"}
                  </button>
                ))}
              </div>
              <input
                value={competitor.reason || ""}
                disabled={isReadOnly}
                onChange={(event) => updateCompetitor(index, "reason", event.target.value)}
                placeholder="Why do you like or dislike this brand?"
              />
            </div>
          ))}
        </PortalCard>
      ) : null}

      {step === 6 ? (
        <PortalCard
          {...cardProps}
          submit
          subtitle="Select styles that feel right for your brand"
          title="Which visual directions resonate?"
        >
          <ChoiceGrid
            className="cp-visual-grid"
            isReadOnly={isReadOnly}
            items={visualOptions}
            limit={3}
            selected={selectedVisual}
            setSelected={setSelectedVisual}
            onSync={(val) =>
              supportSocket.syncField({
                pageId,
                fieldKey: "selectedVisual",
                value: val,
              })
            }
          />
          <div className="cp-almost" style={{ marginTop: "20px" }}>
            <strong>✨ Final Step</strong>
            <p>
              {isConsultantMode
                ? "The client will review all inputs and submit discovery from their portal."
                : "Review all discovery inputs with your client and click Submit to finalize the brand brief."}
            </p>
          </div>
        </PortalCard>
      ) : null}

      {showHelpModal ? (
        <div className="client-help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="client-help-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><MessageSquare size={18} /> Ask Consultant for Assistance</h3>
            <p>
              Stuck or confused on <strong>Frame {step}</strong>? Your consultant will be notified instantly and can assist you live on this screen.
            </p>
            <textarea
              className="client-help-modal-textarea"
              placeholder="What are you confused about? (e.g. Which slider position or customer archetype to pick?)"
              value={helpQuestion}
              onChange={(e) => setHelpQuestion(e.target.value)}
              autoFocus
            />
            <div className="client-help-modal-actions">
              <button
                type="button"
                className="client-help-modal-cancel"
                onClick={() => setShowHelpModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="client-help-modal-submit"
                onClick={submitHelpRequest}
              >
                Notify Consultant
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <VideoCallModal
        currentRole={isConsultantMode ? "consultant" : "client"}
        project={project}
      />
    </main>
  );
}

export { ClientPortal } from "./ClientPortal.jsx";
