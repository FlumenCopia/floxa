import { apiRequest, registerRefreshFailureCallback } from "./api.js";
import { invalidateConsultantActivitiesCache } from "./projectApi.js";

let cachedConsultant = null;
let consultantPromise = null;
let listeners = [];

export function clearCurrentConsultantCache() {
  cachedConsultant = null;
  consultantPromise = null;
  invalidateConsultantActivitiesCache();
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

export async function requestReactivation(email, message) {
  return apiRequest("/auth/request-reactivation/", {
    method: "POST",
    body: JSON.stringify({ email, message }),
  });
}

export async function loginConsultant(data) {
  clearCurrentConsultantCache();
  return apiRequest("/auth/login/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}


export async function getCurrentConsultant(forceRefresh = false) {
  if (!forceRefresh && cachedConsultant) {
    return cachedConsultant;
  }
  if (!forceRefresh && consultantPromise) {
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
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const updated = await apiRequest("/auth/me/", {
    method: "PATCH",
    body: isFormData ? data : JSON.stringify(data),
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

export async function changePassword(data) {
  return apiRequest("/auth/change-password/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function requestPasswordReset(data) {
  return apiRequest("/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmPasswordReset(data) {
  return apiRequest("/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

registerRefreshFailureCallback(clearCurrentConsultantCache);
