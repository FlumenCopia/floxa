"use client";

import { useEffect, useState } from "react";
import { clientPortalService } from "../../services/clientPortalService";
import { ClientDashboard } from "./ClientDashboard";
import "./ClientPortal.css";
import { DiscoveryFlow } from "./DiscoveryFlow";
import { ProfileScreen } from "./ProfileScreen";
import { LoginScreen, SplashScreen } from "./SplashScreen";

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

function getInitialScreen(token, status) {
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

export function ClientPortal({ token }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState(() => readStoredScreen(token) || "splash");
  const [clientData, setClientData] = useState({});

  const applyProject = (portalProject) => {
    setProject(portalProject);
    setClientData(portalProject.brandDNA ?? {});
  };

  const refreshProject = async () => {
    const response = await clientPortalService.getProject();
    const portalProject = "success" in response ? response.data : response;

    if (portalProject) {
      applyProject(portalProject);
    }

    return portalProject;
  };

  const goToScreen = (nextScreen) => {
    writeStoredScreen(token, nextScreen);
    setScreen(nextScreen);
  };

  useEffect(() => {
    clientPortalService
      .createSession(token)
      .then((portalProject) => {
        if (portalProject) {
          applyProject(portalProject);
          setScreen(getInitialScreen(token, portalProject.status));
        } else {
          setError("Invalid link");
        }
      })
      .catch(() => setError("Something went wrong. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!loading && project && screen) {
      writeStoredScreen(token, screen);
    }
  }, [loading, project, screen, token]);

  if (loading) {
    return (
      <main className="client-portal-shell client-loading-shell">
        <div>FLOXA</div>
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
    project,
    branding,
    clientData,
    setClientData,
    resumeScreen: getResumeScreen(project?.status),
    onNext: goToScreen,
    onProjectRefresh: refreshProject,
  };

  return (
    <main className="client-portal-shell">
      {screen === "splash" ? <SplashScreen {...screenProps} /> : null}
      {screen === "login" ? <LoginScreen {...screenProps} /> : null}
      {screen === "profile" ? <ProfileScreen {...screenProps} /> : null}
      {screen === "discovery" ? <DiscoveryFlow {...screenProps} /> : null}
      {screen === "dashboard" ? (
        <ClientDashboard
          {...screenProps}
          onSignOut={async () => {
            await clientPortalService.logout();
            goToScreen("splash");
          }}
        />
      ) : null}
    </main>
  );
}
