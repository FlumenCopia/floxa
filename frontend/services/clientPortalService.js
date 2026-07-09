import { API_BASE_URL, apiRequest } from "../src/lib/api";

const STORAGE_PREFIX = "floxa_client_portal_mock_";

const defaultProject = {
  id: "demo-project",
  name: "FLOXA Brand Clarity Project",
  clientEmail: "client@example.com",
  status: "CREATED",
  completionPct: 12,
  meetingSummary:
    "Your consultant has prepared a private brand discovery space. Complete the profile and discovery steps to unlock your client dashboard.",
  brandPrimaryColor: "#1C342E",
  brandNeonColor: "#4DFFA0",
  clientPortalHeading: "Discover Your Brand Clarity.",
  brandDNA: {},
  moodboards: [
    { id: "mood-1", name: "Calm Precision", clientSelected: false },
    { id: "mood-2", name: "Modern Clarity", clientSelected: false },
    { id: "mood-3", name: "Fresh Authority", clientSelected: false },
  ],
  concepts: [
    {
      id: "concept-1",
      title: "Primary Identity Direction",
      description: "A clean, confident identity system with a flexible modern mark.",
      clientStatus: "PENDING",
    },
    {
      id: "concept-2",
      title: "Secondary Identity Direction",
      description: "A warmer identity route with more editorial pacing and softness.",
      clientStatus: "PENDING",
    },
  ],
  deliverables: [
    { id: "delivery-1", label: "Logo Package", fileFormat: "ZIP" },
    { id: "delivery-2", label: "Brand Guidelines", fileFormat: "PDF" },
  ],
};

let activeToken = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storageKey(token = activeToken || "test-token") {
  return `${STORAGE_PREFIX}${token}`;
}

function readProject(token = activeToken) {
  if (typeof window === "undefined") {
    return clone(defaultProject);
  }

  const stored = window.sessionStorage.getItem(storageKey(token));
  return stored ? JSON.parse(stored) : clone(defaultProject);
}

function writeProject(project, token = activeToken) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(storageKey(token), JSON.stringify(project));
  }

  return project;
}

function buildBrandSummary(project, data) {
  const emotions = data.emotions?.slice(0, 3).join(", ") || "clear, confident, focused";
  const styles = data.visualStyles?.slice(0, 2).join(" and ") || "modern clarity";

  return {
    ...project,
    status: "DISCOVERY_COMPLETE",
    completionPct: Math.max(project.completionPct, 48),
    brandDNA: {
      ...project.brandDNA,
      ...data,
      personalityCluster: "Balanced Clarity",
      positioningStatement: `A brand direction built around ${emotions}, expressed through ${styles}.`,
    },
  };
}

function hasBackendProjectId(projectId) {
  return Number.isInteger(Number(projectId)) && Number(projectId) > 0;
}

function mapBackendProfileToClientData(profile) {
  return {
    clientName: profile.client_name || "",
    clientCompany: profile.company_name || "",
    clientIndustry: profile.industry || "",
    clientYearStart: profile.year_started || "",
    clientLocation: profile.location || "",
    clientPhone: profile.phone || "",
    clientEmail: profile.email || "",
    clientWebsite: profile.website || "",
  };
}

async function resolvePortalProject(linkToken) {
  if (!linkToken || linkToken === "test-token") {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/client-portal/${linkToken}/`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

function mapPortalProjectToClientProject(portalProject) {
  return {
    ...clone(defaultProject),
    id: portalProject.project_id,
    name: portalProject.company_name || defaultProject.name,
    clientEmail: portalProject.client_email || defaultProject.clientEmail,
    status: portalProject.status || defaultProject.status,
    sector: portalProject.sector || "",
    moodboards: [],
    brandDNA: {
      clientName: portalProject.client_name || "",
      clientCompany: portalProject.company_name || "",
      clientEmail: portalProject.client_email || "",
      clientIndustry: portalProject.sector || "",
    },
  };
}

function mapBackendDiscoveryToClientData(discovery) {
  return {
    whatDo: discovery.what_business_does || "",
    targetCustomer: discovery.target_customer || "",
    whyChooseUs: discovery.why_choose_us || "",
    brandFeeling: discovery.brand_feeling || "",
    audienceArchetype: discovery.audience_archetype || "",
    emotions: discovery.emotions?.map((item) => item.emotion) || [],
    competitors: discovery.competitors || [],
    visualStyles: discovery.visual_styles?.map((item) => item.style) || [],
  };
}

export const clientPortalService = {
  async createSession(linkToken) {
    activeToken = linkToken || "test-token";
    const portalProject = await resolvePortalProject(activeToken);

    if (!portalProject && activeToken !== "test-token") {
      return null;
    }

    const project = portalProject ? mapPortalProjectToClientProject(portalProject) : readProject(activeToken);

    return writeProject(project, activeToken);
  },

  async getProject() {
    return { success: true, data: readProject() };
  },

  async refreshProject() {
    return readProject();
  },

  async getBrandDNAReport(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: null };
    }

    try {
      const brandDNA = await apiRequest(`/client-portal/${portalToken}/brand-dna/`);
      return { success: true, data: brandDNA };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Brand DNA report is not ready yet." };
    }
  },

  async getMoodboards(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: readProject(portalToken).moodboards || [] };
    }

    try {
      const moodboards = await apiRequest(`/client-portal/${portalToken}/moodboards/`);
      return { success: true, data: moodboards };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Moodboards are not ready yet." };
    }
  },

  async updateProfile(profile) {
    const project = readProject();
    const updated = {
      ...project,
      status: "PROFILE_COMPLETE",
      completionPct: Math.max(project.completionPct, 24),
      clientEmail: profile.clientEmail || project.clientEmail,
      brandDNA: {
        ...project.brandDNA,
        ...profile,
      },
    };

    writeProject(updated);
    return { success: true, data: updated.brandDNA };
  },

  async saveClientProfile(projectId, payload) {
    if (!hasBackendProjectId(projectId)) {
      const response = await this.updateProfile({
        clientName: payload.client_name,
        clientCompany: payload.company_name,
        clientIndustry: payload.industry,
        clientYearStart: payload.year_started,
        clientLocation: payload.location,
        clientPhone: payload.phone,
        clientEmail: payload.email,
        clientWebsite: payload.website,
      });

      return response;
    }

    let profile;

    try {
      profile = await apiRequest(`/projects/${projectId}/client-profile/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Client profile API validation error:", error);
      throw error;
    }

    const project = readProject();
    const clientData = mapBackendProfileToClientData(profile);
    const updated = {
      ...project,
      status: "PROFILE_COMPLETE",
      completionPct: Math.max(project.completionPct, 24),
      clientEmail: profile.email || project.clientEmail,
      brandDNA: {
        ...project.brandDNA,
        ...clientData,
      },
    };

    writeProject(updated);

    return { success: true, data: updated.brandDNA };
  },

  async getDiscoveryDraft() {
    return { success: true, data: null };
  },

  async saveDiscoveryDraft() {
    return { success: true };
  },

  async submitDiscovery(projectId, payload) {
    if (hasBackendProjectId(projectId) && activeToken && activeToken !== "test-token") {
      try {
        const discovery = await apiRequest(`/projects/${projectId}/discovery/`, {
          method: "POST",
          headers: {
            "X-Client-Portal-Token": activeToken,
          },
          body: JSON.stringify(payload),
        });
        const project = readProject();
        const clientData = mapBackendDiscoveryToClientData(discovery);
        const updated = {
          ...project,
          status: "DISCOVERY_COMPLETE",
          completionPct: Math.max(project.completionPct, 48),
          brandDNA: {
            ...project.brandDNA,
            ...clientData,
          },
        };

        writeProject(updated);

        return { success: true, data: updated.brandDNA };
      } catch (error) {
        console.error("Client discovery API validation error:", error);
        throw error;
      }
    }

    const data = {
      ...payload,
      brandFeeling: payload.brand_feeling,
      emotions: payload.emotions?.map((item) => item.emotion) || [],
      competitors: payload.competitors || [],
      visualStyles: payload.visual_styles?.map((item) => item.style) || [],
    };
    const project = readProject();
    const updated = buildBrandSummary(project, data);
    writeProject(updated);
    return { success: true, data: updated.brandDNA };
  },

  async selectMoodboard(moodboardId) {
    if (activeToken && activeToken !== "test-token") {
      const selectedMoodboard = await apiRequest(
        `/client-portal/${activeToken}/moodboards/${moodboardId}/select/`,
        {
          method: "POST",
        }
      );

      return { success: true, data: selectedMoodboard };
    }

    const project = readProject();
    const updated = {
      ...project,
      moodboards: project.moodboards.map((item) => ({
        ...item,
        clientSelected: item.id === moodboardId,
        is_selected: item.id === moodboardId,
      })),
      completionPct: Math.max(project.completionPct, 64),
    };

    writeProject(updated);
    return { success: true, data: updated.moodboards.find((item) => item.id === moodboardId) };
  },

  async decideConcept(conceptId, status) {
    const project = readProject();
    const updated = {
      ...project,
      concepts: project.concepts.map((item) =>
        item.id === conceptId ? { ...item, clientStatus: status } : item
      ),
      completionPct: Math.max(project.completionPct, status === "SELECTED" ? 82 : 70),
    };

    writeProject(updated);
    return { success: true };
  },

  async downloadDeliverable(deliverableId) {
    return {
      success: true,
      data: {
        fileUrl: `data:text/plain;charset=utf-8,FLOXA%20demo%20deliverable%20${deliverableId}`,
      },
    };
  },

  async logout() {
    activeToken = null;
    return { success: true };
  },
};
