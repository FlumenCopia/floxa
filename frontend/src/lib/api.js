export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getAuthHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (typeof window === "undefined") {
    return headers;
  }

  const token = localStorage.getItem("access_token");

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function parseApiResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data;
}

async function refreshAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  const refreshToken = localStorage.getItem("refresh_token");

  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh: refreshToken,
    }),
  });

  if (!response.ok) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("consultant");
    return null;
  }

  const data = await response.json();

  localStorage.setItem("access_token", data.access);

  return data.access;
}

export async function apiRequest(endpoint, options = {}) {
  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    const newAccessToken = await refreshAccessToken();

    if (!newAccessToken) {
      throw {
        detail: "Session expired. Please login again.",
      };
    }

    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newAccessToken}`,
        ...(options.headers || {}),
      },
    });
  }

  return parseApiResponse(response);
}
