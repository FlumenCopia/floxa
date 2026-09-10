import { apiRequest, buildApiUrl } from "../lib/api.js";

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
  if (!projectId) return false;
  const str = String(projectId).trim();
  return /^[0-9a-fA-F]{24}$/.test(str) || (Number.isInteger(Number(str)) && Number(str) > 0);
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
    isCompleted: Boolean(
      profile.is_completed ||
      profile.year_started ||
      profile.location ||
      profile.phone ||
      profile.website
    ),
  };
}

async function resolvePortalProject(linkToken) {
  if (!linkToken || linkToken === "test-token") {
    return { notFound: false, data: null };
  }

  try {
    const search = typeof window !== "undefined" ? window.location.search || "" : "";
    const response = await fetch(buildApiUrl(`/client-portal/${linkToken}/${search}`), {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 404) {
      return { notFound: true, data: null };
    }

    if (response.status === 403) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.detail || "";
      } catch {}
      const isPasswordRequired = detail.toLowerCase().includes("password");
      return {
        notFound: false,
        requirePassword: isPasswordRequired,
        forbidden: !isPasswordRequired,
        error: detail || "Permission denied",
        data: null,
      };
    }

    if (response.status === 401) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.detail || "";
      } catch {}
      return {
        notFound: false,
        unauthorized: true,
        error: detail || "Authentication required. Please log in.",
        data: null,
      };
    }

    if (!response.ok) {
      return { notFound: false, serverError: true, data: null };
    }

    const data = await response.json();
    return { notFound: false, data };
  } catch {
    return { notFound: false, networkError: true, data: null };
  }
}

function mapPortalProjectToClientProject(portalProject) {
  const backendProgress = Number(portalProject.progress);
  const portalToken = portalProject.portal_token || portalProject.token || activeToken || "";

  return {
    ...clone(defaultProject),
    id: portalProject.project_id,
    portal_token: portalToken,
    portalToken: portalToken,
    name: portalProject.company_name || defaultProject.name,
    clientEmail: portalProject.client_email || defaultProject.clientEmail,
    status: portalProject.status || defaultProject.status,
    completionPct: Number.isFinite(backendProgress) ? backendProgress : defaultProject.completionPct,
    clientSignedOff: Boolean(portalProject.client_signed_off),
    signedOffAt: portalProject.signed_off_at || "",
    sector: portalProject.sector || "",
    moodboards: [],
    concepts: [],
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
    whatDo: discovery.what_business_does || discovery.business_description || discovery.businessDescription || discovery.whatDo || discovery.whatDoYouDo || "",
    targetCustomer: discovery.target_customer || discovery.targetCustomer || "",
    whyChooseUs: discovery.why_choose_us || discovery.whyChooseUs || discovery.whyChooseYou || "",
    brandFeeling: discovery.brand_feeling || discovery.brandFeeling || discovery.whyTrustYou || "",
    audienceArchetype: discovery.audience_archetype || discovery.persona || (Array.isArray(discovery.selectedAudience) ? discovery.selectedAudience[0] : ""),
    emotions: discovery.emotions?.map((item) => (typeof item === "string" ? item : item.emotion)) || [],
    competitors: discovery.competitors || [],
    visualStyles: discovery.visual_styles?.map((item) => (typeof item === "string" ? item : item.style)) || [],
  };
}

function isBackendDiscoveryComplete(discovery) {
  if (!discovery) {
    return false;
  }

  if (typeof discovery.is_complete === "boolean") {
    return discovery.is_complete;
  }

  if (typeof discovery.isComplete === "boolean") {
    return discovery.isComplete;
  }

  const requiredFields = [
    discovery.what_business_does || discovery.business_description || discovery.businessDescription || discovery.whatDo || discovery.whatDoYouDo,
    discovery.target_customer || discovery.targetCustomer,
    discovery.why_choose_us || discovery.whyChooseUs || discovery.whyChooseYou,
    discovery.brand_feeling || discovery.brandFeeling || discovery.whyTrustYou,
    discovery.audience_archetype || discovery.persona || (Array.isArray(discovery.selectedAudience) ? discovery.selectedAudience[0] : ""),
  ];

  return (
    requiredFields.every((value) => String(value || "").trim()) &&
    Boolean(discovery.emotions?.length || discovery.selectedEmotions?.length) &&
    Boolean(discovery.competitors?.length || discovery.comps?.length) &&
    Boolean(discovery.visual_styles?.length || discovery.visualStyles?.length || discovery.styles?.length || discovery.selectedVisual?.length)
  );
}

function fromBackendSliderValue(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(-3, Math.min(3, Math.round((number / 100) * 6 - 3)));
}

function mapBackendDiscoveryToDraft(discovery) {
  const sliders = (discovery.sliders || discovery.personality_sliders || []).reduce((result, slider) => ({
    ...result,
    [slider.slider_key]: fromBackendSliderValue(slider.value),
  }), {});

  return {
    whatDo: discovery.what_business_does || discovery.business_description || discovery.businessDescription || discovery.whatDo || discovery.whatDoYouDo || "",
    targetCustomer: discovery.target_customer || discovery.targetCustomer || "",
    whyChooseUs: discovery.why_choose_us || discovery.whyChooseUs || discovery.whyChooseYou || "",
    brandFeeling: discovery.brand_feeling || discovery.brandFeeling || discovery.whyTrustYou || "",
    emotions: discovery.emotions?.map((item) => (typeof item === "string" ? item : item.emotion)) || [],
    persona: discovery.audience_archetype || discovery.persona || (Array.isArray(discovery.selectedAudience) ? discovery.selectedAudience[0] : ""),
    competitors: discovery.competitors || [],
    visualStyles: discovery.visual_styles?.map((item) => (typeof item === "string" ? item : item.style)) || [],
    sliders,
  };
}

function resolveAssetUrl(url) {
  if (!url) {
    return "";
  }

  return buildApiUrl(url);
}

function mapBackendConcept(concept) {
  return {
    ...concept,
    image_url: resolveAssetUrl(concept.image_url || concept.image),
    file_url: resolveAssetUrl(concept.file_url || concept.file),
  };
}

function mapBackendDeliverable(deliverable) {
  return {
    ...deliverable,
    file_url: resolveAssetUrl(deliverable.file_url || deliverable.file),
  };
}

function mapProjectAgreement(agreement) {
  if (!agreement) {
    return null;
  }

  const fileUrl = resolveAssetUrl(agreement.file_url || agreement.basic_pdf_url || agreement.signed_pdf_url);
  const downloadUrl = resolveAssetUrl(agreement.download_url);

  return {
    ...agreement,
    title: "Basic Agreement",
    status_label: getAgreementStatusLabel(agreement.status),
    file_url: fileUrl,
    download_url: downloadUrl || (fileUrl ? `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}download=1` : ""),
    isProjectAgreement: true,
  };
}

function getAgreementStatusLabel(status) {
  const labels = {
    draft: "Draft",
    shared: "Shared",
    signature_requested: "Signature Requested",
    signed: "Signed",
    active: "Active",
    completed: "Completed / Locked",
  };

  return labels[status] || status || "Not generated yet";
}

export const clientPortalService = {
  async createSession(linkToken) {
    activeToken = linkToken || "test-token";
    const res = await resolvePortalProject(activeToken);

    if (res.notFound) {
      return { notFound: true };
    }

    if (res.requirePassword) {
      return { requirePassword: true };
    }

    if (res.forbidden) {
      return { forbidden: true, error: res.error || "Permission denied" };
    }

    if (res.unauthorized) {
      return { unauthorized: true, error: res.error || "Authentication required." };
    }

    if (res.serverError) {
      return { serverError: true, error: "Unable to load portal. Please try again later." };
    }

    if (res.networkError) {
      return { networkError: true, error: "Network connection error. Please check your connection." };
    }

    const portalProject = res.data;
    if (!portalProject && activeToken !== "test-token") {
      return { requirePassword: true };
    }

    const project = portalProject ? mapPortalProjectToClientProject(portalProject) : readProject(activeToken);

    return { success: true, project: writeProject(project, activeToken) };
  },

  async getProject() {
    if (activeToken && activeToken !== "test-token") {
      const res = await resolvePortalProject(activeToken);

      if (res.data) {
        return { success: true, data: writeProject(mapPortalProjectToClientProject(res.data), activeToken) };
      }

      return { success: false, error: "Portal password verification required." };
    }

    return { success: true, data: readProject() };
  },

  async checkPortalAccess(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: readProject(portalToken) };
    }

    const res = await resolvePortalProject(portalToken);

    if (!res.data) {
      return { success: false };
    }

    return {
      success: true,
      data: writeProject(mapPortalProjectToClientProject(res.data), portalToken),
    };
  },

  async verifyPortalPassword(arg1, arg2) {
    let password = arg1;
    let portalToken = arg2 || activeToken;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof arg1 === "string" && uuidRegex.test(arg1.trim()) && typeof arg2 === "string" && !uuidRegex.test(arg2.trim())) {
      portalToken = arg1.trim();
      password = arg2;
    } else if (typeof arg2 === "string" && uuidRegex.test(arg2.trim())) {
      portalToken = arg2.trim();
      password = arg1;
    }

    if (!portalToken || portalToken === "test-token") {
      return { success: true };
    }

    try {
      await apiRequest(`/client-portal/${portalToken}/verify-password/`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });

      return { success: true };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to verify portal password." };
    }
  },

  async refreshProject() {
    const response = await this.getProject();
    return response.success ? response.data : null;
  },

  async getDiscoveryReport(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: null };
    }

    try {
      const discovery = await apiRequest(`/client-portal/${portalToken}/discovery/`);
      return {
        success: true,
        data: discovery ? {
          ...discovery,
          is_submitted: Boolean(discovery.submitted_at),
          submittedAt: discovery.submitted_at,
        } : null,
      };
    } catch (error) {
      if (error?.detail === "Project discovery not found for this project.") {
        return { success: true, data: null };
      }

      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to load discovery report." };
    }
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

  async getConcepts(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: readProject(portalToken).concepts || [] };
    }

    try {
      const concepts = await apiRequest(`/client-portal/${portalToken}/concepts/`);
      return {
        success: true,
        data: Array.isArray(concepts) ? concepts.map(mapBackendConcept) : [],
      };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Concepts are not ready yet." };
    }
  },

  async getClientDeliverables(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: readProject(portalToken).deliverables || [] };
    }

    try {
      const deliverables = await apiRequest(`/client-portal/${portalToken}/deliverables/`);
      return {
        success: true,
        data: Array.isArray(deliverables) ? deliverables.map(mapBackendDeliverable) : [],
      };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Deliverables are not ready yet." };
    }
  },

  async getClientAgreement(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: null };
    }

    try {
      const agreement = await apiRequest(`/client-portal/${portalToken}/agreement/`);
      return { success: true, data: mapProjectAgreement(agreement) };
    } catch (error) {
      if (error?.detail === "Agreement not found.") {
        return { success: true, data: null };
      }

      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Agreement is not ready yet." };
    }
  },

  async signAgreement(payload, portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: false, error: "Agreement signing is not available in demo mode." };
    }

    try {
      const agreement = await apiRequest(`/client-portal/${portalToken}/agreement/sign/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      return { success: true, data: mapProjectAgreement(agreement) };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      const firstFieldError = Object.values(error || {}).flat()[0];
      return { success: false, error: firstFieldError || "Unable to sign agreement." };
    }
  },

  async getClientPayments(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: [] };
    }

    try {
      const payments = await apiRequest(`/client-portal/${portalToken}/payments/`);
      return { success: true, data: Array.isArray(payments) ? payments : [] };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Payments are not available yet." };
    }
  },

  async createPaymentOrder(milestoneId, portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: false, error: "Online payment is not available in demo mode." };
    }

    if (!milestoneId) {
      return { success: false, error: "Payment milestone is not available." };
    }

    try {
      const order = await apiRequest(`/client-portal/${portalToken}/payments/${milestoneId}/create-order/`, {
        method: "POST",
      });

      return { success: true, data: order };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to start payment checkout." };
    }
  },

  async verifyPayment(payload, portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: false, error: "Online payment verification is not available in demo mode." };
    }

    try {
      const result = await apiRequest(`/client-portal/${portalToken}/payments/verify/`, {
        method: "POST",
        body: JSON.stringify({
          razorpay_order_id: payload?.razorpay_order_id || "",
          razorpay_payment_id: payload?.razorpay_payment_id || "",
          razorpay_signature: payload?.razorpay_signature || "",
        }),
      });

      return { success: true, data: result };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Payment could not be confirmed yet. Please retry verification or refresh the page." };
    }
  },

  async getClientActivities(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: [] };
    }

    try {
      const activities = await apiRequest(`/client-portal/${portalToken}/activities/`);
      return { success: true, data: Array.isArray(activities) ? activities : [] };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Notifications are not available yet." };
    }
  },

  async signOffProject(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      const project = readProject(portalToken);
      const updated = {
        ...project,
        status: "delivered",
        completionPct: 100,
        clientSignedOff: true,
        signedOffAt: new Date().toISOString(),
      };

      writeProject(updated, portalToken);
      return { success: true, data: updated };
    }

    try {
      const project = await apiRequest(`/client-portal/${portalToken}/sign-off/`, {
        method: "POST",
      });
      return {
        success: true,
        data: writeProject(mapPortalProjectToClientProject(project), portalToken),
      };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to complete project sign-off." };
    }
  },

  async markClientActivitiesRead(portalToken = activeToken) {
    if (!portalToken || portalToken === "test-token") {
      return { success: true, data: { marked_read: 0 } };
    }

    try {
      const response = await apiRequest(`/client-portal/${portalToken}/activities/mark-read/`, {
        method: "POST",
      });
      return { success: true, data: response };
    } catch (error) {
      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to mark notifications as read." };
    }
  },

  async getClientProfile(projectId, portalToken = activeToken) {
    if (!hasBackendProjectId(projectId) || !portalToken || portalToken === "test-token") {
      return { success: true, data: null };
    }

    try {
      const profile = await apiRequest(`/projects/${projectId}/client-profile/`, {
        headers: {
          "X-Client-Portal-Token": portalToken,
        },
      });

      return { success: true, data: mapBackendProfileToClientData(profile) };
    } catch (error) {
      if (error?.detail === "Client profile not found for this project.") {
        return { success: true, data: null };
      }

      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: "Unable to load your profile." };
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
        headers: activeToken ? {
          "X-Client-Portal-Token": activeToken,
        } : {},
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
      clientEmail: profile.email || project.clientEmail,
      brandDNA: {
        ...project.brandDNA,
        ...clientData,
      },
    };

    writeProject(updated);

    return { success: true, data: updated.brandDNA };
  },

  async getDiscoveryDraft(target, portalTokenArg = activeToken) {
    const hasNumericId = hasBackendProjectId(target);
    const token = (!hasNumericId && target && target !== "test-token")
      ? target
      : (portalTokenArg && portalTokenArg !== "test-token" ? portalTokenArg : activeToken);

    if (!hasNumericId && (!token || token === "test-token")) {
      return { success: true, data: null };
    }

    try {
      let discovery;
      if (token && token !== "test-token") {
        discovery = await apiRequest(`/client-portal/${token}/discovery/`, {
          headers: {
            "X-Client-Portal-Token": token,
          },
        });
      } else if (hasNumericId) {
        discovery = await apiRequest(`/projects/${target}/discovery/`, {
          headers: token ? { "X-Client-Portal-Token": token } : {},
        });
      } else {
        return { success: true, data: null };
      }

      if (!discovery) {
        return { success: true, data: null };
      }

      const isSubmitted = Boolean(discovery.submitted_at || discovery.is_submitted);
      const isComplete = isBackendDiscoveryComplete(discovery);

      const clientData = mapBackendDiscoveryToClientData(discovery);
      const draft = mapBackendDiscoveryToDraft(discovery);

      const normalizedData = {
        ...discovery,
        raw: discovery,
        clientData,
        draft,
        isComplete,
        isSubmitted,
        is_complete: isComplete,
        is_submitted: isSubmitted,
        whatDo: draft.whatDo,
        targetCustomer: draft.targetCustomer,
        whyChooseUs: draft.whyChooseUs,
        brandFeeling: draft.brandFeeling,
        persona: draft.persona,
      };

      return {
        success: true,
        data: normalizedData,
      };
    } catch (error) {
      if (error?.detail === "Project discovery not found for this project." || error?.status === 404) {
        return { success: true, data: null };
      }

      if (error?.detail) {
        return { success: false, error: error.detail };
      }

      return { success: false, error: error.message || "Unable to load your discovery." };
    }
  },

  async saveDiscoveryDraft(target, payload = {}) {
    const hasNumericId = hasBackendProjectId(target);
    const token = (!hasNumericId && target && target !== "test-token")
      ? target
      : (activeToken && activeToken !== "test-token" ? activeToken : "");

    if (!hasNumericId && (!token || token === "test-token")) {
      return { success: true };
    }

    try {
      let discovery;
      if (token && token !== "test-token") {
        discovery = await apiRequest(`/client-portal/${token}/discovery/`, {
          method: "POST",
          headers: {
            "X-Client-Portal-Token": token,
          },
          body: JSON.stringify(payload),
        });
      } else if (hasNumericId) {
        discovery = await apiRequest(`/projects/${target}/discovery/`, {
          method: "POST",
          headers: token ? { "X-Client-Portal-Token": token } : {},
          body: JSON.stringify(payload),
        });
      } else {
        return { success: true };
      }

      const project = readProject();
      const clientData = mapBackendDiscoveryToClientData(discovery || {});
      const updated = {
        ...project,
        status: "PROFILE_COMPLETE",
        brandDNA: {
          ...project.brandDNA,
          ...clientData,
        },
      };

      writeProject(updated);

      const isSubmitted = Boolean(discovery?.submitted_at || discovery?.is_submitted);
      const isComplete = isBackendDiscoveryComplete(discovery || {});

      const draft = mapBackendDiscoveryToDraft(discovery || {});

      const normalizedData = {
        ...(discovery || {}),
        raw: discovery,
        clientData,
        draft,
        isComplete,
        isSubmitted,
        is_complete: isComplete,
        is_submitted: isSubmitted,
        whatDo: draft.whatDo,
        targetCustomer: draft.targetCustomer,
        whyChooseUs: draft.whyChooseUs,
        brandFeeling: draft.brandFeeling,
        persona: draft.persona,
      };

      return { success: true, data: normalizedData };
    } catch (error) {
      console.error("Client discovery draft API validation error:", error);
      return { success: false, error: error?.detail || error?.message || "Failed to save discovery draft." };
    }
  },

  async submitDiscovery(projectId, payload) {
    const token = activeToken && activeToken !== "test-token"
      ? activeToken
      : (readProject()?.portal_token || readProject()?.portalToken || "");
    const targetProjectId = projectId || (readProject()?.id) || (readProject()?.project_id);

    if (token && token !== "test-token") {
      try {
        let discovery;
        if (hasBackendProjectId(targetProjectId)) {
          discovery = await apiRequest(`/projects/${targetProjectId}/discovery/submit/`, {
            method: "POST",
            headers: {
              "X-Client-Portal-Token": token,
            },
            body: JSON.stringify(payload),
          });
        } else {
          discovery = await apiRequest(`/client-portal/${token}/discovery/submit/`, {
            method: "POST",
            headers: {
              "X-Client-Portal-Token": token,
            },
            body: JSON.stringify(payload),
          });
        }
        const project = readProject();
        const clientData = mapBackendDiscoveryToClientData(discovery);
        const updated = {
          ...project,
          status: "DISCOVERY_COMPLETE",
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

  async submitMoodboardFeedback(moodboardId, payload) {
    if (activeToken && activeToken !== "test-token") {
      const moodboard = await apiRequest(
        `/client-portal/${activeToken}/moodboards/${moodboardId}/feedback/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      return { success: true, data: moodboard };
    }

    const project = readProject();
    const updated = {
      ...project,
      moodboards: project.moodboards.map((item) =>
        item.id === moodboardId
          ? {
              ...item,
              clientFeedback: payload.feedback || "",
              client_feedback: payload.feedback || "",
              clientSelected: false,
              is_selected: false,
            }
          : item
      ),
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

  async submitConceptFeedback(conceptId, payload) {
    if (activeToken && activeToken !== "test-token") {
      const concept = await apiRequest(
        `/client-portal/${activeToken}/concepts/${conceptId}/feedback/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      return { success: true, data: mapBackendConcept(concept) };
    }

    const project = readProject();
    const updated = {
      ...project,
      concepts: project.concepts.map((item) =>
        item.id === conceptId
          ? {
              ...item,
              status: payload.action,
              clientStatus: payload.action === "approved" ? "SELECTED" : "REJECTED",
              client_feedback: payload.feedback || "",
            }
          : item
      ),
      completionPct: Math.max(project.completionPct, payload.action === "approved" ? 82 : 70),
    };

    writeProject(updated);
    return { success: true };
  },

  async downloadDeliverable(deliverable) {
    if (deliverable?.file_url) {
      return {
        success: true,
        data: {
          fileUrl: deliverable.file_url,
        },
      };
    }

    const deliverableId = deliverable?.id || deliverable;

    return {
      success: true,
      data: {
        fileUrl: `data:text/plain;charset=utf-8,FLOXA%20demo%20deliverable%20${deliverableId}`,
      },
    };
  },

  async downloadAgreement(agreement) {
    if (agreement?.download_url || agreement?.file_url) {
      return {
        success: true,
        data: {
          fileUrl: agreement.download_url || agreement.file_url,
        },
      };
    }

    return {
      success: false,
      error: "Agreement file is not available.",
    };
  },

  async requestHelp(token, { pageId, question, fieldKey = "" }) {
    const targetToken = token || activeToken;
    if (!targetToken || targetToken === "test-token") {
      return { success: true, message: "Local help request stored." };
    }

    try {
      const response = await apiRequest(`/client-portal/${targetToken}/help-request/`, {
        method: "POST",
        body: JSON.stringify({
          page_id: pageId,
          question,
          field_key: fieldKey,
        }),
      });

      return {
        success: true,
        data: response,
      };
    } catch (err) {
      console.warn("REST API help request fallback error:", err);
      return {
        success: false,
        error: err.message || "Failed to notify consultant via REST.",
      };
    }
  },

  async resolveHelp(token, { pageId = "" }) {
    const targetToken = token || activeToken;
    if (!targetToken || targetToken === "test-token") {
      return { success: true };
    }

    try {
      const response = await apiRequest(`/client-portal/${targetToken}/help-resolve/`, {
        method: "POST",
        body: JSON.stringify({
          page_id: pageId,
        }),
      });

      return {
        success: true,
        data: response,
      };
    } catch (err) {
      console.warn("REST API help resolve fallback error:", err);
      return {
        success: false,
        error: err.message || "Failed to resolve help via REST.",
      };
    }
  },

  async getClientList() {
    try {
      const resp = await apiRequest("/client-portal/client-list/");
      if (resp && resp.data) {
        return resp.data;
      }
      return Array.isArray(resp) ? resp : [];
    } catch (err) {
      console.warn("Failed to fetch client list from client portal API:", err);
      return [];
    }
  },

  async getHelpStatus(portalToken) {
    if (!portalToken) return { success: false };
    try {
      const resp = await apiRequest(`/client-portal/${portalToken}/help-status/`);
      return resp;
    } catch (err) {
      console.warn("Failed to fetch help status:", err);
      return { success: false };
    }
  },



  async logout() {
    if (activeToken && activeToken !== "test-token") {
      try {
        await apiRequest(`/client-portal/${activeToken}/logout/`, {
          method: "POST",
        });
      } catch {
        // The local portal session should still be cleared if the server session already expired.
      }
    }

    activeToken = null;
    return { success: true };
  },
};
