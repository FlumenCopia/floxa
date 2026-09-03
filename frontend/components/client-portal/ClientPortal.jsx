"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

function getBackendResumeScreen(savedProfile, savedDiscovery) {
  if (!savedProfile) {
    return "profile";
  }

  if (savedDiscovery?.isSubmitted) {
    return "dashboard";
  }

  if (savedDiscovery?.isComplete) {
    return "review";
  }

  return "discovery";
}

function writeDiscoveryDraft(projectId, discovery) {
  if (typeof window === "undefined" || !projectId || !discovery?.draft) {
    return;
  }

  window.localStorage.setItem(
    `floxa-discovery-${projectId}`,
    JSON.stringify(discovery.draft)
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

  const goToScreen = (nextScreen) => {
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

    if (savedDiscovery) {
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
      .then(async (portalProject) => {
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
              setScreen(nextScreen);
            } catch {
              setResumeTargetScreen("");
              setScreen("login");
            }
          } else {
            setScreen(getDemoInitialScreen(token, portalProject.status));
          }
        } else if (isRealPortalToken(token)) {
          setResumeTargetScreen("");
          setScreen("login");
        } else {
          setError("Invalid link");
        }
      })
      .catch(() => setError("Something went wrong. Please try again."))
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
    return (
      <main className="client-portal-shell client-error-shell">
        <div>Locked</div>
        <strong>Link not found</strong>
        <p>{error}</p>
        <span>Contact your consultant for a new link.</span>
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
      {screen === "discovery" ? <DiscoveryFlow {...screenProps} /> : null}
      {screen === "review" ? <DiscoveryReview {...screenProps} /> : null}
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
            📹 Video Call Consultant
          </button>
          <VideoCallModal currentRole="client" project={project} />
        </>
      ) : null}
    </main>
  );
}
