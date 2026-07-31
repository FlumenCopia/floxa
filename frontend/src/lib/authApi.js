import { API_BASE_URL, apiRequest, parseApiResponse, registerRefreshFailureCallback } from "./api";

let cachedConsultant = null;
let consultantPromise = null;
let listeners = [];

export function clearCurrentConsultantCache() {
  cachedConsultant = null;
  consultantPromise = null;
  notifyConsultantChange(null);
}

export function subscribeToConsultantChange(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyConsultantChange(consultant) {
  listeners.forEach((listener) => {
    try {
      listener(consultant);
    } catch (e) {
      console.error("Failed to notify consultant change:", e);
    }
  });
}

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
  clearCurrentConsultantCache();
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
  if (cachedConsultant) {
    return cachedConsultant;
  }
  if (consultantPromise) {
    return consultantPromise;
  }
  consultantPromise = (async () => {
    try {
      cachedConsultant = await apiRequest("/auth/me/");
      notifyConsultantChange(cachedConsultant);
      return cachedConsultant;
    } catch (error) {
      clearCurrentConsultantCache();
      throw error;
    } finally {
      consultantPromise = null;
    }
  })();
  return consultantPromise;
}

export async function updateCurrentConsultant(data) {
  const updated = await apiRequest("/auth/me/", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  cachedConsultant = updated;
  notifyConsultantChange(updated);
  return updated;
}

export async function logoutConsultant() {
  clearCurrentConsultantCache();
  return apiRequest("/auth/logout/", {
    method: "POST",
  });
}

registerRefreshFailureCallback(clearCurrentConsultantCache);
