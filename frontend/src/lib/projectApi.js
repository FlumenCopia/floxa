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
  advance_paid: "Advance Paid",
  concepts: "Concepts",
  delivered: "Delivered",
  archived: "Archived",
};

const statusClasses = {
  created: "badge-muted",
  discovery: "badge-amber",
  advance_paid: "badge-green",
  concepts: "badge-blue",
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
  const status = project.status || "created";

  return {
    id: project.id,
    clientName: project.client_name || project.company_name || project.title || "",
    clientEmail: project.client_email || "",
    companyName: project.company_name || project.title || "",
    sector: project.sector || "",
    status,
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

export async function createProject(data) {
  return apiRequest("/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getProject(id) {
  return apiRequest(`/projects/${id}/`);
}

export async function getDiscoverySummary(projectId) {
  return apiRequest(`/projects/${projectId}/discovery-summary/`);
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

export async function getProjectActivities(projectId) {
  return apiRequest(`/projects/${projectId}/activities/`);
}

export async function getConsultantActivities() {
  return apiRequest("/projects/activities/");
}

export async function markProjectActivitiesRead(projectId) {
  return apiRequest(`/projects/${projectId}/activities/mark-read/`, {
    method: "POST",
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

async function uploadMoodboardRequest(projectId, formData, headers) {
  return fetch(`${API_BASE_URL}/projects/${projectId}/moodboards/`, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData,
  });
}

export async function uploadMoodboard(projectId, formData) {
  await ensureCsrfCookie();

  const csrfToken = getCsrfToken();
  const headers = csrfToken ? { "X-CSRFToken": csrfToken } : {};
  let response = await uploadMoodboardRequest(projectId, formData, headers);

  if (response.status === 401) {
    const refreshed = await refreshCookieSession();

    if (refreshed) {
      response = await uploadMoodboardRequest(projectId, formData, headers);
    }
  }

  return parseApiResponse(response);
}
