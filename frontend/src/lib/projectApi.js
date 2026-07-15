import { apiRequest } from "./api";

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
