"use client";

import { useCallback, useEffect, useState } from "react";
import "./ClientPortalIntroModal.css";

export const CLIENT_SLIDES = [
  {
    id: "profile",
    step: "Step 1 of 9",
    category: "Profile Setup",
    title: "Company & Profile Basics",
    subtitle: "Establish your brand credentials and project workspace.",
    items: [
      "Company or trade name",
      "Primary contact person and email address",
      "Industry classification (e.g. Technology, Retail, Hospitality)",
      "Current website and primary social links (optional)",
    ],
    note: "Your profile details link your account to your project milestones and can be edited anytime.",
  },
  {
    id: "essentials",
    step: "Step 2 of 9",
    category: "Business Essentials",
    title: "Core Purpose & Brand Mission",
    subtitle: "Share the foundational purpose of your business in your own words.",
    items: [
      "What your business does (your core service or product in plain words)",
      "Who your primary target customer or client is",
      "Why customers choose you over alternative solutions",
      "How your brand experience should make people feel",
    ],
    note: "Answers can be short sentences or bullet points. Authenticity is what helps your consultant most.",
  },
  {
    id: "personality",
    step: "Step 3 of 9",
    category: "Brand Personality",
    title: "Character & Perception Sliders",
    subtitle: "Position where your brand sits on key personality spectrums.",
    items: [
      "Playful ⟷ Serious character spectrum",
      "Approachable ⟷ Elite market positioning",
      "Natural ⟷ Industrial aesthetic tone",
      "Casual ⟷ Elegant & Unconventional ⟷ Mainstream balance",
    ],
    note: "Drag sliders to where your brand belongs, or leave them centered for a balanced stance.",
  },
  {
    id: "visual-tone",
    step: "Step 4 of 9",
    category: "Visual Tone",
    title: "Visual & Structural Character",
    subtitle: "Define aesthetic boundaries and the structural weight of your brand.",
    items: [
      "Simple ⟷ Complex aesthetic density",
      "Subtle ⟷ Bright color energy",
      "Classic ⟷ Contemporary design style",
      "Friendly ⟷ Authoritative voice & Economical ⟷ Luxurious appeal",
    ],
    note: "These values provide your designer with exact creative coordinates for typography and layout.",
  },
  {
    id: "emotions",
    step: "Step 5 of 9",
    category: "Emotional Tone",
    title: "Brand Emotion Keywords",
    subtitle: "Select the primary emotional reactions your brand should evoke.",
    items: [
      "Choose 3 to 8 emotion tags from the curated attribute list",
      "Select core attributes such as Trust, Bold, Refined, Vibrant, Warm, or Confident",
      "Deselect or swap anytime as you fine-tune your brand voice",
    ],
    note: "Focus on how you want customers to feel the moment they encounter your brand.",
  },
  {
    id: "persona-comps",
    step: "Step 6 of 9",
    category: "Market & Audience",
    title: "Target Persona & Competitors",
    subtitle: "Pinpoint your ideal buyer archetype and benchmark market peers.",
    items: [
      "Select your customer archetype (Value-Seeker, Premium-Seeker, Innovator, Traditionalist)",
      "List 1 to 3 key competitor brands in your market",
      "Rate each competitor (Like or Dislike) and explain why in one sentence",
    ],
    note: "Honest feedback about competitors helps your consultant identify gaps to make your brand stand out.",
  },
  {
    id: "visual-styles",
    step: "Step 7 of 9",
    category: "Visual Direction",
    title: "Aesthetic Styles & Discovery Review",
    subtitle: "Pick your preferred visual styles and review your brief before submitting.",
    items: [
      "Select up to 3 visual style directions (e.g. Minimal & Clean, Bold, Dark & Luxurious)",
      "Review your complete Discovery brief summary on the review screen",
      "Submit your answers to lock in your foundation and hand off to your consultant",
    ],
    note: "You can review and edit every section before final submission.",
  },
  {
    id: "moodboards-concepts",
    step: "Step 8 of 9",
    category: "Design Rounds",
    title: "Moodboards & Brand Concepts",
    subtitle: "Explore curated directions, review logo concepts, and iterate.",
    items: [
      "Review curated visual moodboards and vote on your favorite direction",
      "Inspect proposed logo marks, color systems, and mockups in high resolution",
      "Submit targeted revision comments or approve the winning design concept",
    ],
    note: "Direct feedback ensures the final visual identity matches your vision before production.",
  },
  {
    id: "delivery-launch",
    step: "Step 9 of 9",
    category: "Milestones & Delivery",
    title: "Agreements, Payments & Final Assets",
    subtitle: "Track milestones, finalize payments, and download your production kit.",
    items: [
      "Review and digitally sign your client service agreement",
      "Track and approve project milestone payments transparently",
      "Download production vector logos, color codes, and brand guidelines packages",
    ],
    note: "You can also message your consultant or start a video call directly from the portal topbar anytime.",
    buttonText: "Enter My Portal",
  },
];

export function ClientPortalIntroModal({
  token = "",
  projectId = "",
  clientName = "",
  onClose = () => {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const storageKey = `floxa_client_intro_seen_${token || projectId || "default"}`;

  const closeModal = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, "true");
      } catch {}
    }
    setIsOpen(false);
    onClose();
  }, [storageKey, onClose]);

  const openModal = useCallback(() => {
    setCurrentSlide(0);
    setIsOpen(true);
  }, []);

  // Check on mount if intro has been seen before
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasSeen = localStorage.getItem(storageKey);
    if (!hasSeen) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  // Listen for replay event: window.dispatchEvent(new CustomEvent('floxa:open_client_intro'))
  useEffect(() => {
    const handleReopen = () => {
      openModal();
    };
    window.addEventListener("floxa:open_client_intro", handleReopen);
    return () => window.removeEventListener("floxa:open_client_intro", handleReopen);
  }, [openModal]);

  // Handle keyboard navigation (Left, Right, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeModal();
      } else if (e.key === "ArrowRight") {
        if (currentSlide < CLIENT_SLIDES.length - 1) {
          setCurrentSlide((prev) => prev + 1);
        } else {
          closeModal();
        }
      } else if (e.key === "ArrowLeft") {
        if (currentSlide > 0) {
          setCurrentSlide((prev) => prev - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentSlide, closeModal]);

  if (!isOpen) return null;

  const activeSlide = CLIENT_SLIDES[currentSlide] || CLIENT_SLIDES[0];
  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === CLIENT_SLIDES.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      closeModal();
    } else {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  return (
    <div
      className="client-intro-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-intro-title"
      onClick={closeModal}
    >
      <div className="client-intro-card" onClick={(e) => e.stopPropagation()}>
        {/* Header: Clean Step Label & Skip */}
        <div className="client-intro-header">
          <div className="client-intro-step-pill">
            <span>{activeSlide.step}</span>
            <span className="client-intro-step-divider">•</span>
            <span className="client-intro-step-category">{activeSlide.category}</span>
          </div>

          <button
            type="button"
            className="client-intro-skip-btn"
            onClick={closeModal}
            title="Skip intro"
          >
            Skip
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="client-intro-scrollable">
          <div className="client-intro-body">
            <h2 id="client-intro-title" className="client-intro-title">
              {activeSlide.title}
            </h2>

            <p className="client-intro-subtitle">{activeSlide.subtitle}</p>

            {/* Structured What to Fill Section */}
            {activeSlide.items && activeSlide.items.length > 0 ? (
              <div className="client-intro-section">
                <div className="client-intro-section-title">
                  What you will complete on this page:
                </div>
                <ol className="client-intro-items-list">
                  {activeSlide.items.map((item, idx) => (
                    <li key={idx} className="client-intro-item">
                      <span className="client-intro-item-num">{idx + 1}</span>
                      <span className="client-intro-item-text">{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* Note */}
            {activeSlide.note ? (
              <div className="client-intro-note">
                <strong>Note:</strong> {activeSlide.note}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer: Progress and Navigation Buttons */}
        <div className="client-intro-footer">
          <div className="client-intro-footer-left">
            <div className="client-intro-dots">
              {CLIENT_SLIDES.map((slide, idx) => (
                <button
                  type="button"
                  key={slide.id}
                  className={`client-intro-dot ${idx === currentSlide ? "active" : ""}`}
                  onClick={() => setCurrentSlide(idx)}
                  title={`Go to ${slide.step}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
            <span className="client-intro-counter">
              {currentSlide + 1} / {CLIENT_SLIDES.length}
            </span>
          </div>

          <div className="client-intro-actions">
            {!isFirstSlide ? (
              <button
                type="button"
                className="client-intro-btn-back"
                onClick={handlePrev}
              >
                Back
              </button>
            ) : null}

            <button
              type="button"
              className="client-intro-btn-next"
              onClick={handleNext}
            >
              {activeSlide.buttonText || (isLastSlide ? "Enter Portal" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
