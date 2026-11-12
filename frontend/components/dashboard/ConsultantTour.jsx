"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  FolderKanban,
  MessageSquare,
  Compass,
  Target,
  BarChart3,
  ExternalLink,
  Settings,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Check,
  Lightbulb,
  Rocket,
} from "lucide-react";
import "./ConsultantTour.css";

const TOUR_STEPS = [
  {
    id: "dashboard",
    targetSelector: '[data-tour="dashboard"]',
    fallbackSelector: 'a.nav-item[href="/"], .nav-item',
    badge: "Sidebar 1/8 • Executive Overview",
    title: "Executive Dashboard",
    description:
      "Your real-time agency command center. Monitor active project counts, recent system activity feeds, and average milestone progress across all ongoing brand client engagements.",
    tip: "Click 'New' on the dashboard anytime to launch a brand project in under 60 seconds.",
    icon: LayoutDashboard,
  },
  {
    id: "projects",
    targetSelector: '[data-tour="projects"]',
    fallbackSelector: 'a.nav-item[href="/project"]',
    badge: "Sidebar 2/8 • Client Engagements",
    title: "Projects & Engagements",
    description:
      "Manage all ongoing client projects in one unified hub. Set milestone payment terms (Advance, Mid-way, Final balance), and invite your clients directly to their dedicated project workspace.",
    tip: "Track project milestones, deliverables, and payment statuses in real time.",
    icon: FolderKanban,
  },
  {
    id: "chat",
    targetSelector: '[data-tour="chat"]',
    fallbackSelector: 'a.nav-item[href="/chat"]',
    badge: "Sidebar 3/8 • Real-Time Communication",
    title: "Omnichannel Client Chat & Calls",
    description:
      "Collaborate with clients in real time. Send instant text messages, audio voice notes, design attachments, and launch 1-click WebRTC audio & video calls right in your browser—no external meeting links needed.",
    tip: "Incoming client messages trigger real-time notifications with 1-click quick replies.",
    icon: MessageSquare,
  },
  {
    id: "discovery",
    targetSelector: '[data-tour="discovery"]',
    fallbackSelector: 'a.nav-item[href="/discovery"]',
    badge: "Sidebar 4/8 • Core Brand Delivery",
    title: "Discovery & Brand Delivery",
    description:
      "The heart of FLOXA's brand methodology. Guide clients through interactive questionnaires, Brand DNA briefs, visual Moodboard curation, Concept design rounds, Deliverables files, and Milestone Agreements.",
    tip: "Tabs update automatically as clients review, submit feedback, and grant milestone approvals.",
    icon: Compass,
  },
  {
    id: "ai-suite",
    targetSelector: '[data-tour="ai-suite"]',
    fallbackSelector: 'a.nav-item[href="/ai-suite"]',
    badge: "Sidebar 5/8 • Strategy Suite",
    title: "Brand Strategy Suite",
    description:
      "Empower your creative workflow with dedicated strategy tools. Formulate brand purpose, core brand values, buyer personas, mission & vision statements, tone of voice guidelines, and taglines.",
    tip: "Export or copy strategy frameworks directly into your client's Brand DNA brief.",
    icon: Target,
  },
  {
    id: "analytics",
    targetSelector: '[data-tour="analytics"]',
    fallbackSelector: 'a.nav-item[href="/analytics"]',
    badge: "Sidebar 6/8 • Business Insights",
    title: "Agency Performance & Analytics",
    description:
      "Gain clear insights into your agency's operations. Review project completion velocity, milestone delivery turnaround times, and key health indicators across all active client accounts.",
    tip: "Identify bottlenecks early to ensure on-time milestone delivery and faster payouts.",
    icon: BarChart3,
  },
  {
    id: "client-portal",
    targetSelector: '[data-tour="client-portal"]',
    fallbackSelector: 'a.nav-item[href^="/client-portal"]',
    badge: "Sidebar 7/8 • Client Experience",
    title: "Client Portal Preview",
    description:
      "Preview the exact experience your client sees. Review how your client experiences the Discovery questionnaire, Brand DNA brief, visual moodboards, concept approvals, and digital agreement signing.",
    tip: "Experience the presentation from your client's perspective before sharing.",
    icon: ExternalLink,
  },
  {
    id: "settings",
    targetSelector: '[data-tour="settings"]',
    fallbackSelector: 'a.nav-item[href="/settings"]',
    badge: "Sidebar 8/8 • Agency Configuration",
    title: "Agency & Account Settings",
    description:
      "Manage your consultant profile, update agency branding and profile photo, configure email & in-app notification alerts, and manage your account security credentials.",
    tip: "Keep your profile up to date—your name and agency branding appear on client portals and agreements.",
    icon: Settings,
  },
];

export default function ConsultantTour({ consultant = null, onOpenWizard = () => {} }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [tooltipStyle, setTooltipStyle] = useState({ top: 100, left: 260, arrowTop: 24, centered: false });
  const tooltipRef = useRef(null);

  const consultantId = consultant?.id || consultant?._id || "default";
  const storageKey = `floxa_consultant_tour_completed_${consultantId}`;

  const calculatePosition = useCallback((stepIndex) => {
    if (typeof window === "undefined") return;

    const step = TOUR_STEPS[stepIndex];
    if (!step) return;

    const margin = 16;
    const mobileTabbar = document.querySelector(".mobile-tabbar");
    const mobileBarHeight = mobileTabbar ? mobileTabbar.getBoundingClientRect().height : 0;
    const isCompactScreen = window.innerWidth <= 1000 || mobileBarHeight > 0;
    const bottomReserve = isCompactScreen ? Math.max(84, Math.ceil(mobileBarHeight + margin)) : margin;
    const measuredWidth = tooltipRef.current?.offsetWidth || 420;
    const measuredHeight = tooltipRef.current?.offsetHeight || 340;
    const tooltipWidth = Math.min(measuredWidth, window.innerWidth - margin * 2);
    const tooltipHeight = Math.min(measuredHeight, window.innerHeight - margin - bottomReserve);

    let targetEl = document.querySelector(step.targetSelector);
    if (!targetEl && step.fallbackSelector) {
      targetEl = document.querySelector(step.fallbackSelector);
    }

    const rect = targetEl ? targetEl.getBoundingClientRect() : null;
    const isTargetVisible =
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 12 &&
      rect.left >= 0 &&
      rect.left < window.innerWidth;

    if (!isTargetVisible) {
      // Compact/mobile screen (sidebar collapsed off-screen) or element missing:
      // Center cleanly in the safe area above the mobile bottom navigation bar.
      setSpotlightRect(null);
      const safeAvailableH = window.innerHeight - margin - bottomReserve;
      const centeredTop = Math.max(margin, Math.round(margin + (safeAvailableH - tooltipHeight) / 2));
      const centeredLeft = Math.max(margin, Math.round((window.innerWidth - tooltipWidth) / 2));
      setTooltipStyle({
        top: centeredTop,
        left: centeredLeft,
        arrowTop: 24,
        centered: true,
      });
      return;
    }

    // Scroll smoothly into view if offscreen (e.g., lower sidebar items)
    targetEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });

    const padding = 5;
    const spot = {
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    setSpotlightRect(spot);

    // Default: position directly to the right of the sidebar item
    let left = rect.right + margin;
    let top = rect.top - 8;
    let centered = false;

    // Small viewport fallback: if right side overflows, center cleanly above bottom nav
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = Math.max(margin, Math.round((window.innerWidth - tooltipWidth) / 2));
      top = Math.max(margin, rect.bottom + margin);
      centered = true;
    }

    // Clamp top & left strictly within safe viewport boundaries (above mobile bottom nav)
    const maxTop = Math.max(margin, window.innerHeight - tooltipHeight - bottomReserve);
    const clampedTop = Math.min(Math.max(margin, top), maxTop);
    const clampedLeft = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - tooltipWidth - margin));
    const arrowTop = Math.min(
      Math.max(18, Math.round(rect.top + rect.height / 2 - clampedTop - 6)),
      Math.max(18, tooltipHeight - 30)
    );

    setTooltipStyle({ top: clampedTop, left: clampedLeft, arrowTop, centered });
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setShowWelcomeModal(false);
    setIsActive(true);
  }, []);

  const completeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, "true");
      } catch {}
    }
    setIsActive(false);
    setSpotlightRect(null);
    setShowWelcomeModal(true);
  }, [storageKey]);

  const handleSkipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const handleNextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      calculatePosition(next);
    } else {
      completeTour();
    }
  }, [currentStep, calculatePosition, completeTour]);

  const handlePrevStep = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      calculatePosition(prev);
    }
  }, [currentStep, calculatePosition]);

  // Check on mount if tour has been completed before or if explicitly requested via query param (?tour=true)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("tour") === "true") {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
        const timer = setTimeout(() => {
          startTour();
        }, 400);
        return () => clearTimeout(timer);
      }
    } catch {}

    const hasSeen = localStorage.getItem(storageKey);
    if (!hasSeen) {
      // Delay briefly for initial DOM layout to settle
      const timer = setTimeout(() => {
        startTour();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [storageKey, startTour]);

  // Listen for replay event: window.dispatchEvent(new CustomEvent('floxa:start_tour'))
  useEffect(() => {
    const handleReplay = () => {
      startTour();
    };
    window.addEventListener("floxa:start_tour", handleReplay);
    return () => window.removeEventListener("floxa:start_tour", handleReplay);
  }, [startTour]);

  // Recalculate position after step DOM update, on resize, or on scroll
  useEffect(() => {
    if (!isActive) return;

    const rafId = window.requestAnimationFrame(() => calculatePosition(currentStep));
    const timer = setTimeout(() => {
      calculatePosition(currentStep);
    }, 60);

    const handleUpdate = () => calculatePosition(currentStep);
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      clearTimeout(timer);
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [isActive, currentStep, calculatePosition]);

  // Keyboard navigation: Escape to skip, ArrowRight to advance, ArrowLeft to go back
  useEffect(() => {
    if (!isActive && !showWelcomeModal) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isActive) handleSkipTour();
        else if (showWelcomeModal) setShowWelcomeModal(false);
      } else if (isActive && (e.key === "ArrowRight" || e.key === "Enter")) {
        handleNextStep();
      } else if (isActive && e.key === "ArrowLeft") {
        handlePrevStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, showWelcomeModal, handleSkipTour, handleNextStep, handlePrevStep]);

  const activeStepData = TOUR_STEPS[currentStep] || TOUR_STEPS[0];
  const StepIcon = activeStepData.icon || Compass;
  const consultantName = consultant?.name ? consultant.name.split(" ")[0] : "";

  const tourOverlay = isActive ? (
        <div className="floxa-tour-overlay" aria-live="polite">
          {spotlightRect ? (
            <div
              className="floxa-tour-spotlight"
              style={{
                top: `${spotlightRect.top}px`,
                left: `${spotlightRect.left}px`,
                width: `${spotlightRect.width}px`,
                height: `${spotlightRect.height}px`,
              }}
            />
          ) : null}

          <div
            ref={tooltipRef}
            className={`floxa-tour-tooltip ${tooltipStyle.centered ? "no-arrow" : ""}`}
            style={{
              top: `${tooltipStyle.top}px`,
              left: `${tooltipStyle.left}px`,
              "--tour-arrow-top": `${tooltipStyle.arrowTop ?? 24}px`,
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="floxa-tour-header">
              <span className="floxa-tour-badge">
                {activeStepData.badge}
              </span>
              <button
                type="button"
                className="floxa-tour-skip-btn"
                onClick={handleSkipTour}
                title="Skip onboarding tour"
              >
                Skip Tour
              </button>
            </div>

            <h3 className="floxa-tour-title">{activeStepData.title}</h3>
            <p className="floxa-tour-desc">{activeStepData.description}</p>

            {activeStepData.tip ? (
              <div className="floxa-tour-tip">
                <span><strong>Tip:</strong> {activeStepData.tip}</span>
              </div>
            ) : null}

            <div className="floxa-tour-footer">
              <div className="floxa-tour-dots">
                {TOUR_STEPS.map((step, idx) => (
                  <span
                    key={step.id}
                    className={`floxa-tour-dot ${idx === currentStep ? "active" : ""}`}
                    onClick={() => {
                      setCurrentStep(idx);
                      calculatePosition(idx);
                    }}
                    title={`Jump to ${step.title}`}
                  />
                ))}
              </div>

              <div className="floxa-tour-actions">
                {currentStep > 0 ? (
                  <button
                    type="button"
                    className="floxa-tour-btn-back"
                    onClick={handlePrevStep}
                  >
                    <ArrowLeft size={13} style={{ display: "inline", marginRight: "3px" }} />
                    Back
                  </button>
                ) : null}

                <button
                  type="button"
                  className="floxa-tour-btn-next"
                  onClick={handleNextStep}
                >
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    <>
                      Finish Tour
                    </>
                  ) : (
                    <>
                      Next
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null;

  const welcomeModal = showWelcomeModal ? (
        <div className="floxa-welcome-backdrop" role="dialog" aria-modal="true">
          <div className="floxa-welcome-card">
            

            <button
              type="button"
              className="floxa-welcome-close"
              onClick={() => setShowWelcomeModal(false)}
              aria-label="Close welcome message"
            >
              <X size={18} />
            </button>

            

            <h2 className="floxa-welcome-title">
              Hai{consultantName ? `, ${consultantName}` : ""}, Welcome to FLOXA!
            </h2>
            <div className="floxa-welcome-subtitle">Explore FLOXA Now</div>

            <p className="floxa-welcome-message">
              Your brand strategy workspace is ready. Launch client engagements, develop comprehensive Brand DNA briefs, collaborate on moodboards, and protect your agency with verified milestone payments.
            </p>

            <div className="floxa-welcome-actions">
              <button
                type="button"
                className="floxa-welcome-btn-primary"
                onClick={() => {
                  setShowWelcomeModal(false);
                  onOpenWizard();
                }}
              >
                Create Your First Project
              </button>

              <button
                type="button"
                className="floxa-welcome-btn-secondary"
                onClick={() => setShowWelcomeModal(false)}
              >
                Explore Workspace
              </button>
            </div>
          </div>
        </div>
      ) : null;

  const content = (
    <>
      {tourOverlay}
      {welcomeModal}
    </>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}
