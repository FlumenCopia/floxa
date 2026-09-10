"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Video } from "lucide-react";
import { clientPortalService } from "../../services/clientPortalService";
import { ClientDashboard } from "./ClientDashboard";
import "./ClientPortal.css";
import { DiscoveryFlow } from "./DiscoveryFlow";
import { DiscoveryReview } from "./DiscoveryReview";
import { ProfileScreen } from "./ProfileScreen";
import { LoginScreen, SplashScreen, WelcomeStage } from "./SplashScreen";
import { VideoCallModal } from "./VideoCallModal";
import { webRTCService } from "../../services/webRTCService";
import { supportSocket } from "../../services/supportSocketService";

function getResumeScreen(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "profile_complete") {
    return "discovery";
  }

  if (normalizedStatus === "discovery_complete") {
    return "dashboard";
  }

  if (normalizedStatus === "created" || normalizedStatus === "discovery") {
    return "profile";
  }

  return "profile";
}

function getScreenStorageKey(token) {
  return `floxa-client-screen-${token || "test-token"}`;
}

function readStoredScreen(token) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(getScreenStorageKey(token)) || "";
}

function writeStoredScreen(token, screen) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(getScreenStorageKey(token), screen);
  }
}

function getDemoInitialScreen(token, status) {
  const storedScreen = readStoredScreen(token);
  const normalizedStatus = String(status || "").toLowerCase();

  if (storedScreen) {
    return storedScreen;
  }

  if (normalizedStatus === "profile_complete" || normalizedStatus === "discovery_complete") {
    return getResumeScreen(status);
  }

  return "splash";
}

function isRealPortalToken(token) {
  return Boolean(token && token !== "test-token");
}

function isClientProfileComplete(savedProfile) {
  if (!savedProfile) {
    return false;
  }

  if (savedProfile.isCompleted || savedProfile.is_completed) {
    return true;
  }

  return Boolean(
    savedProfile.clientYearStart ||
    savedProfile.year_started ||
    savedProfile.yearStarted ||
    (typeof savedProfile.clientLocation === "string" && savedProfile.clientLocation.trim()) ||
    (typeof savedProfile.location === "string" && savedProfile.location.trim()) ||
    (typeof savedProfile.clientPhone === "string" && savedProfile.clientPhone.trim()) ||
    (typeof savedProfile.phone === "string" && savedProfile.phone.trim()) ||
    (typeof savedProfile.clientWebsite === "string" && savedProfile.clientWebsite.trim()) ||
    (typeof savedProfile.website === "string" && savedProfile.website.trim())
  );
}

function hasDiscoveryAnswers(savedDiscovery) {
  if (!savedDiscovery) return false;
  if (savedDiscovery.isSubmitted || savedDiscovery.is_submitted) return true;
  if (savedDiscovery.isComplete || savedDiscovery.is_complete) return true;

  const draft = savedDiscovery.draft || savedDiscovery;
  const whatDo = draft.whatDo || draft.what_business_does || draft.whatDoYouDo || "";
  const targetCustomer = draft.targetCustomer || draft.target_customer || "";
  const whyChooseUs = draft.whyChooseUs || draft.why_choose_us || "";
  const brandFeeling = draft.brandFeeling || draft.brand_feeling || "";
  const persona = draft.persona || draft.audience_archetype || "";
  const emotions = draft.emotions || savedDiscovery.emotions || [];
  const competitors = draft.competitors || savedDiscovery.competitors || [];
  const visualStyles = draft.visualStyles || draft.visual_styles || savedDiscovery.visualStyles || savedDiscovery.visual_styles || [];

  return Boolean(
    whatDo.trim() ||
    targetCustomer.trim() ||
    whyChooseUs.trim() ||
    brandFeeling.trim() ||
    persona.trim() ||
    (Array.isArray(emotions) && emotions.length > 0) ||
    (Array.isArray(competitors) && competitors.length > 0) ||
    (Array.isArray(visualStyles) && visualStyles.length > 0)
  );
}

function getBackendResumeScreen(savedProfile, savedDiscovery) {
  if (savedDiscovery?.isSubmitted || savedDiscovery?.is_submitted) {
    return "dashboard";
  }

  if (savedDiscovery?.isComplete || savedDiscovery?.is_complete) {
    return "review";
  }

  if (hasDiscoveryAnswers(savedDiscovery)) {
    return "discovery";
  }

  if (!isClientProfileComplete(savedProfile)) {
    return "profile";
  }

  return "discovery";
}

function writeDiscoveryDraft(projectId, discovery) {
  if (
    typeof window === "undefined" ||
    !projectId ||
    !discovery?.draft ||
    discovery?.isSubmitted ||
    discovery?.is_submitted
  ) {
    return;
  }

  const existing = window.localStorage.getItem(`floxa-discovery-${projectId}`);
  let existingStep = undefined;
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (typeof parsed?.step === "number") {
        existingStep = parsed.step;
      }
    } catch {
      // ignore
    }
  }

  const draftToWrite = {
    ...discovery.draft,
    ...(existingStep !== undefined ? { step: existingStep } : {}),
  };

  window.localStorage.setItem(
    `floxa-discovery-${projectId}`,
    JSON.stringify(draftToWrite)
  );
}

export function ClientPortal({ token, isConsultant = false }) {
  const searchParams = useSearchParams();
  const isConsultantMode =
    isConsultant ||
    searchParams?.get("mode") === "consultant" ||
    searchParams?.get("consultant") === "true" ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/client-portal"));
  const consultantToken = searchParams?.get("consultant_token") || "";

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState("notFound");
  const [screen, setScreen] = useState(() => readStoredScreen(token) || "splash");
  const [resumeTargetScreen, setResumeTargetScreen] = useState("");
  const [clientData, setClientData] = useState({});
  const [profileReturnScreen, setProfileReturnScreen] = useState("");

  const applyProject = useCallback((portalProject) => {
    setProject(portalProject);
    setClientData(portalProject.brandDNA ?? {});
  }, []);

  const refreshProject = useCallback(async () => {
    const response = await clientPortalService.getProject();
    const portalProject = "success" in response ? response.data : response;

    if (portalProject) {
      applyProject(portalProject);
    }

    return portalProject;
  }, [applyProject]);

  const [editStep, setEditStep] = useState(1);

  const goToScreen = (nextScreen, options = {}) => {
    if (typeof options?.step === "number") {
      setEditStep(options.step);
    }
    setProfileReturnScreen(
      nextScreen === "profile" && ["dashboard", "review"].includes(screen) ? screen : ""
    );
    writeStoredScreen(token, nextScreen);
    setScreen(nextScreen);
  };

  const loadSavedPortalProgress = useCallback(async (portalProject) => {
    let savedProfile = null;
    try {
      const profileResponse = await clientPortalService.getClientProfile(portalProject.id);
      if (profileResponse?.success) {
        savedProfile = profileResponse.data;
      }
    } catch {
      // New project without profile yet
    }

    let savedDiscovery = null;
    try {
      const discoveryResponse = await clientPortalService.getDiscoveryDraft(portalProject.portal_token || portalProject.id);
      if (discoveryResponse?.success) {
        savedDiscovery = discoveryResponse.data;
      }
    } catch {
      // New project without discovery yet
    }

    const projectWithSavedData = savedProfile
      ? {
          ...portalProject,
          clientEmail: savedProfile.clientEmail || portalProject.clientEmail,
          brandDNA: {
            ...portalProject.brandDNA,
            ...savedProfile,
            ...(savedDiscovery?.clientData || {}),
          },
        }
      : portalProject;

    if (savedDiscovery && !savedDiscovery.isSubmitted && !savedDiscovery.is_submitted) {
      writeDiscoveryDraft(portalProject.id, savedDiscovery);
    }

    applyProject(projectWithSavedData);

    return getBackendResumeScreen(savedProfile, savedDiscovery);
  }, [applyProject]);

  const handlePortalAccess = async (password) => {
    const response = await clientPortalService.verifyPortalPassword(password, token);

    if (!response.success) {
      return response;
    }

    const projectResponse = await clientPortalService.getProject();
    const verifiedProject = projectResponse.success ? projectResponse.data : project;
    const nextScreen = await loadSavedPortalProgress(verifiedProject);
    setResumeTargetScreen(nextScreen);
    goToScreen(nextScreen);

    return response;
  };

  useEffect(() => {
    clientPortalService
      .createSession(token)
      .then(async (sessionResult) => {
        if (sessionResult?.notFound) {
          setErrorType("notFound");
          setError("Link not found");
          return;
        }

        if (sessionResult?.forbidden) {
          setErrorType("forbidden");
          setError(sessionResult.error || "Permission denied");
          return;
        }

        if (sessionResult?.unauthorized) {
          setErrorType("unauthorized");
          setError(sessionResult.error || "Authentication required");
          return;
        }

        if (sessionResult?.requirePassword) {
          setResumeTargetScreen("");
          setScreen("login");
          return;
        }

        if (sessionResult?.serverError) {
          setErrorType("serverError");
          setError(sessionResult.error || "Unable to load portal. Please try again later.");
          return;
        }

        if (sessionResult?.networkError) {
          setErrorType("networkError");
          setError(sessionResult.error || "Network connection error. Please check your connection.");
          return;
        }

        if (sessionResult?.error) {
          setErrorType("serverError");
          setError(sessionResult.error);
          return;
        }

        const portalProject = sessionResult?.project || sessionResult;
        if (portalProject) {
          applyProject(portalProject);

          if (isRealPortalToken(token)) {
            try {
              const accessResponse = await clientPortalService.checkPortalAccess(token);

              if (!accessResponse.success) {
                setResumeTargetScreen("");
                setScreen("login");
                return;
              }

              const verifiedProject = accessResponse.data || portalProject;
              applyProject(verifiedProject);
              const nextScreen = await loadSavedPortalProgress(verifiedProject);
              setResumeTargetScreen(nextScreen);
              const stored = readStoredScreen(token);
              const finalScreen =
                stored &&
                !["splash", "login"].includes(stored) &&
                (nextScreen !== "profile" || stored === "profile")
                  ? stored
                  : nextScreen;
              writeStoredScreen(token, finalScreen);
              setScreen(finalScreen);
            } catch {
              setResumeTargetScreen("");
              setScreen("login");
            }
          } else {
            setScreen(getDemoInitialScreen(token, portalProject.status));
          }
        } else {
          setErrorType("notFound");
          setError("Invalid link");
        }
      })
      .catch(() => {
        setErrorType("serverError");
        setError("Something went wrong. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [applyProject, loadSavedPortalProgress, token]);

  useEffect(() => {
    if (!loading && project && screen) {
      writeStoredScreen(token, screen);
    }
  }, [loading, project, screen, token]);

  useEffect(() => {
    const portalToken = token || project?.portal_token;
    if (portalToken && isRealPortalToken(portalToken)) {
      supportSocket.connect({ portalToken });
    }
  }, [token, project?.portal_token]);

  if (loading) {
    return (
      <main className="client-portal-shell client-loading-shell">
        <div className="client-loading-logo-wrap">
          <img src="/image/FLOXA_log.png" alt="FLOXA" className="client-loading-logo-img" />
        </div>
      </main>
    );
  }

  if (error) {
    let errorHeading = "Link not found";
    let errorSub = "Contact your consultant for a new link.";

    if (errorType === "forbidden") {
      errorHeading = "Access Denied";
      errorSub = "Contact your project consultant or administrator.";
    } else if (errorType === "unauthorized") {
      errorHeading = "Authentication Required";
      errorSub = "Please log in to continue.";
    } else if (errorType === "serverError" || errorType === "networkError") {
      errorHeading = "Unable to Load Portal";
      errorSub = "Please check your connection and try again.";
    }

    return (
      <main className="client-portal-shell client-error-shell">
        <div>Locked</div>
        <strong>{errorHeading}</strong>
        <p>{error}</p>
        <span>{errorSub}</span>
      </main>
    );
  }

  const branding = {
    primary: project?.brandPrimaryColor ?? "#1C342E",
    neon: project?.brandNeonColor ?? "#4DFFA0",
    heading: project?.clientPortalHeading ?? "Discover Your Brand Clarity.",
  };

  const screenProps = {
    token,
    portalToken: token || project?.portal_token,
    project,
    branding,
    clientData,
    setClientData,
    profileReturnScreen,
    resumeScreen: resumeTargetScreen || getResumeScreen(project?.status),
    requiresPassword: isRealPortalToken(token) && !isConsultantMode,
    isConsultantMode,
    consultantToken,
    onNext: goToScreen,
    initialStep: editStep,
    onVerifyPassword: handlePortalAccess,
    onProjectRefresh: refreshProject,
  };

  return (
    <main className="client-portal-shell">
      {screen === "splash" || screen === "login" ? (
        <WelcomeStage
          {...screenProps}
          initialMode={screen === "login" ? "login" : "splash"}
        />
      ) : null}
      {screen === "profile" ? <ProfileScreen {...screenProps} /> : null}
      {screen === "discovery" ? <DiscoveryFlow key={`discovery-step-${editStep}`} {...screenProps} /> : null}
      {screen === "review" ? <DiscoveryReview key="review-stage" {...screenProps} /> : null}
      {screen === "dashboard" ? (
        <ClientDashboard
          {...screenProps}
          onSignOut={async () => {
            await clientPortalService.logout();
            goToScreen("splash");
          }}
        />
      ) : null}

      {screen !== "splash" && screen !== "login" ? (
        <>
          <button
            type="button"
            className="floxa-video-call-trigger-btn"
            onClick={() =>
              webRTCService.initiateCall({
                projectId: project?.project_id || project?.id,
                clientName: project?.client_name || project?.company_name || project?.client?.name || "Client",
                projectTitle: project?.title || project?.company_name || "Brand Project",
                role: "client",
                portalToken: token || project?.portal_token,
              })
            }
          >
            <Video size={15} strokeWidth={2} />
            <span>Video Call Consultant</span>
          </button>
          <VideoCallModal currentRole="client" project={project} />
        </>
      ) : null}
    </main>
  );
}

export default ClientPortal;
