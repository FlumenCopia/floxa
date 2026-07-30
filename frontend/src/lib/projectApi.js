import {
  API_BASE_URL,
  apiRequest,
  ensureCsrfCookie,
  getCsrfToken,
  parseApiResponse,
} from "./api";

const statusLabels = {
  created: "Created",
  discovery: "Discovery",
  advance_payment: "Advance Payment",
  advance_paid: "Advance Paid",
  brand_dna: "Brand DNA",
  moodboards: "Moodboards",
  concepts: "Concepts",
  agreement: "Agreement",
  deliverables: "Deliverables",
  final_paid: "Final Paid",
  delivered: "Delivered",
  archived: "Archived",
};

const statusClasses = {
  created: "badge-muted",
  discovery: "badge-amber",
  advance_payment: "badge-amber",
  advance_paid: "badge-green",
  brand_dna: "badge-blue",
  moodboards: "badge-blue",
  concepts: "badge-blue",
  agreement: "badge-amber",
  deliverables: "badge-green",
  final_paid: "badge-green",
  delivered: "badge-green",
  archived: "badge-muted",
};

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatProjectValue(value) {
  const amount = Number(value || 0);

  if (Number.isNaN(amount)) {
    return "Rs0";
  }

  return `Rs${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export function normalizeProject(project) {
  const status = project.workflow_status || project.status || "created";

  return {
    id: project.id,
    clientName: project.client_name || project.company_name || project.title || "",
    clientEmail: project.client_email || "",
    companyName: project.company_name || project.title || "",
    sector: project.sector || "",
    status: project.status || "created",
    workflow_status: status,
    statusLabel: statusLabels[status] || status,
    statusClass: statusClasses[status] || "badge-muted",
    projectValue: project.project_value,
    valueLabel: formatProjectValue(project.project_value),
    progress: Number(project.progress || 0),
    isArchived: Boolean(project.is_archived),
    createdAt: project.created_at || "",
    updatedAt: project.updated_at || "",
    createdLabel: formatDate(project.created_at),
    updatedLabel: formatDate(project.updated_at),
    portalToken: project.portal_token,
  };
}

export async function getProjects(search = "") {
  const params = new URLSearchParams();
  const searchValue = search.trim();

  if (searchValue) {
    params.set("search", searchValue);
  }

  const queryString = params.toString();

  return apiRequest(`/projects/${queryString ? `?${queryString}` : ""}`);
}

export async function getAnalytics() {
  return apiRequest("/projects/analytics/");
}

export async function createProject(data) {
  return apiRequest("/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getProject(id) {
  return apiRequest(`/projects/${id}/`);
}

export async function askProjectAssistant(projectId, message) {
  return apiRequest(`/projects/${projectId}/assistant/chat/`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getDiscoverySummary(projectId) {
  return apiRequest(`/projects/${projectId}/discovery-summary/?_=${Date.now()}`);
}

export async function getBrandDNA(projectId) {
  return apiRequest(`/projects/${projectId}/brand-dna/`);
}

export async function generateBrandDNA(projectId) {
  return apiRequest(`/projects/${projectId}/brand-dna/generate/`, {
    method: "POST",
  });
}

export async function getMoodboards(projectId) {
  return apiRequest(`/projects/${projectId}/moodboards/`);
}

export async function getConcepts(projectId) {
  return apiRequest(`/projects/${projectId}/concepts/`);
}

export async function getDeliverables(projectId) {
  return apiRequest(`/projects/${projectId}/deliverables/`);
}

export async function getAgreement(projectId) {
  return apiRequest(`/projects/${projectId}/agreement/`);
}

export async function generateAgreement(projectId) {
  return apiRequest(`/projects/${projectId}/agreement/generate/`, {
    method: "POST",
  });
}

export async function shareAgreement(projectId, { resend = false } = {}) {
  return apiRequest(`/projects/${projectId}/agreement/share/`, {
    method: "POST",
    body: JSON.stringify({ resend }),
  });
}

export async function requestAgreementSignature(projectId, { resend = false } = {}) {
  return apiRequest(`/projects/${projectId}/agreement/request-signature/`, {
    method: "POST",
    body: JSON.stringify({ resend }),
  });
}

export async function retrySignedAgreementEmail(projectId) {
  return apiRequest(`/projects/${projectId}/agreement/retry-signed-email/`, {
    method: "POST",
  });
}

export async function getGeneratedAgreement(projectId) {
  return apiRequest(`/projects/${projectId}/generated-agreement/`);
}

export async function regenerateGeneratedAgreement(projectId) {
  return apiRequest(`/projects/${projectId}/generated-agreement/pdf/regenerate/`, {
    method: "POST",
  });
}

export async function shareGeneratedAgreement(projectId) {
  return apiRequest(`/projects/${projectId}/generated-agreement/share/`, {
    method: "POST",
  });
}

export async function getPaymentMilestones(projectId) {
  return apiRequest(`/projects/${projectId}/payments/`);
}

export async function initializePaymentMilestones(projectId) {
  return apiRequest(`/projects/${projectId}/payments/`, {
    method: "POST",
  });
}

export async function getProjectActivities(projectId) {
  return apiRequest(`/projects/${projectId}/activities/`);
}

export async function getConsultantActivities() {
  return apiRequest("/projects/activities/");
}

export async function markProjectActivitiesRead(projectId, actions = []) {
  return apiRequest(`/projects/${projectId}/activities/mark-read/`, {
    method: "POST",
    body: JSON.stringify({ actions }),
  });
}

export async function markConsultantActivitiesRead() {
  return apiRequest("/projects/activities/mark-read/", {
    method: "POST",
  });
}

async function refreshCookieSession() {
  const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.ok;
}

async function uploadProjectFormDataRequest(endpoint, formData, headers, method = "POST") {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    credentials: "include",
    headers,
    body: formData,
  });
}

export async function uploadMoodboard(projectId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/moodboards/`, formData);
}

export async function uploadConcept(projectId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/concepts/`, formData);
}

export async function updateConcept(projectId, conceptId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/concepts/${conceptId}/`, formData, "PATCH");
}

export async function uploadDeliverable(projectId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/deliverables/`, formData);
}

export async function updateDeliverable(projectId, deliverableId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/deliverables/${deliverableId}/`, formData, "PATCH");
}

export async function uploadAgreement(projectId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/agreement/`, formData);
}

export async function updateAgreement(projectId, formData) {
  return uploadProjectFormData(`/projects/${projectId}/agreement/`, formData, "PATCH");
}

export async function deleteConcept(projectId, conceptId) {
  await ensureCsrfCookie();

  const endpoint = `/projects/${projectId}/concepts/${conceptId}/`;
  const csrfToken = getCsrfToken();
  const headers = csrfToken ? { "X-CSRFToken": csrfToken } : {};
  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    const refreshed = await refreshCookieSession();

    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
    }
  }

  if (response.status === 204) {
    return { success: true };
  }

  return parseApiResponse(response);
}

export async function deleteDeliverable(projectId, deliverableId) {
  await ensureCsrfCookie();

  const endpoint = `/projects/${projectId}/deliverables/${deliverableId}/`;
  const csrfToken = getCsrfToken();
  const headers = csrfToken ? { "X-CSRFToken": csrfToken } : {};
  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    const refreshed = await refreshCookieSession();

    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
    }
  }

  if (response.status === 204) {
    return { success: true };
  }

  return parseApiResponse(response);
}

export async function deleteAgreement(projectId) {
  await ensureCsrfCookie();

  const endpoint = `/projects/${projectId}/agreement/`;
  const csrfToken = getCsrfToken();
  const headers = csrfToken ? { "X-CSRFToken": csrfToken } : {};
  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "DELETE",
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    const refreshed = await refreshCookieSession();

    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
    }
  }

  if (response.status === 204) {
    return { success: true };
  }

  return parseApiResponse(response);
}

export async function shareConcept(projectId, conceptId) {
  return apiRequest(`/projects/${projectId}/concepts/${conceptId}/share/`, {
    method: "PATCH",
  });
}

export async function shareDeliverable(projectId, deliverableId) {
  return apiRequest(`/projects/${projectId}/deliverables/${deliverableId}/share/`, {
    method: "PATCH",
  });
}

export async function requestPaymentMilestone(projectId, milestoneId) {
  return apiRequest(`/projects/${projectId}/payments/${milestoneId}/request/`, {
    method: "POST",
  });
}

export async function markPaymentMilestonePaid(projectId, milestoneId) {
  return apiRequest(`/projects/${projectId}/payments/${milestoneId}/mark-paid/`, {
    method: "POST",
  });
}

async function uploadProjectFormData(endpoint, formData, method = "POST") {
  await ensureCsrfCookie();

  const csrfToken = getCsrfToken();
  const headers = csrfToken ? { "X-CSRFToken": csrfToken } : {};
  let response = await uploadProjectFormDataRequest(endpoint, formData, headers, method);

  if (response.status === 401) {
    const refreshed = await refreshCookieSession();

    if (refreshed) {
      response = await uploadProjectFormDataRequest(endpoint, formData, headers, method);
    }
  }

  return parseApiResponse(response);
}
