import { API_BASE_URL, apiRequest, parseApiResponse } from "./api";

export async function registerConsultant(data) {
  const response = await fetch(`${API_BASE_URL}/auth/register/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseApiResponse(response);
}

export async function loginConsultant(data) {
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseApiResponse(response);
}

export async function getCurrentConsultant() {
  return apiRequest("/auth/me/");
}

export async function updateCurrentConsultant(data) {
  return apiRequest("/auth/me/", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function logoutConsultant() {
  return apiRequest("/auth/logout/", {
    method: "POST",
  });
}
