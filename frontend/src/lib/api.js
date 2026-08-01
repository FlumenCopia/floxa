export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }

  const cookies = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = cookies.find((item) => item.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(cookie.slice(prefix.length));
}

export function getCsrfToken() {
  return getCookie("csrftoken");
}

let pendingCsrfPromise = null;
let pendingRefreshPromise = null;
let onRefreshFailure = null;

export function registerRefreshFailureCallback(callback) {
  onRefreshFailure = callback;
}

export async function ensureCsrfCookie() {
  if (getCsrfToken()) {
    return;
  }

  if (pendingCsrfPromise) {
    return pendingCsrfPromise;
  }

  pendingCsrfPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/csrf/`, {
        method: "GET",
        credentials: "include",
      });
      return await parseApiResponse(response);
    } finally {
      pendingCsrfPromise = null;
    }
  })();

  return pendingCsrfPromise;
}

export function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

function isUnsafeMethod(method = "GET") {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

async function getRequestHeaders(options = {}, { includeAuth = true } = {}) {
  const headers = includeAuth
    ? {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      }
    : {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };

  if (!includeAuth) {
    delete headers.Authorization;
    delete headers.authorization;
  }

  if (isUnsafeMethod(options.method)) {
    await ensureCsrfCookie();
    const csrfToken = getCsrfToken();

    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }

  return headers;
}

export async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson
    ? await response.json()
    : {
        detail: response.ok
          ? "Unexpected response from server."
          : "Server returned an unexpected response. Please try again.",
      };

  if (!response.ok) {
    throw {
      ...data,
      status: response.status,
    };
  }

  return data;
}

async function refreshAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  if (pendingRefreshPromise) {
    return pendingRefreshPromise;
  }

  pendingRefreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        localStorage.removeItem("consultant");
        if (onRefreshFailure) {
          try {
            onRefreshFailure();
          } catch (e) {
            console.error("Refresh failure callback error:", e);
          }
        }
        return null;
      }

      return true;
    } catch {
      localStorage.removeItem("consultant");
      if (onRefreshFailure) {
        try {
          onRefreshFailure();
        } catch (e) {
          console.error("Refresh failure callback error:", e);
        }
      }
      return null;
    } finally {
      pendingRefreshPromise = null;
    }
  })();

  return pendingRefreshPromise;
}

export async function apiRequest(endpoint, options = {}) {
  const headers = await getRequestHeaders(options);

  if (isUnsafeMethod(options.method || "GET")) {
    const match = endpoint.match(/^\/client-portal\/([a-f0-9-]+)/i);
    if (match) {
      headers["X-Client-Portal-Token"] = match[1];
    }
  }

  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  const isAuthRoute =
    endpoint.includes("/auth/login/") ||
    endpoint.includes("/auth/logout/") ||
    endpoint.includes("/auth/token/refresh/") ||
    endpoint.includes("/auth/register/");

  if (response.status === 401 && !isAuthRoute) {
    const refreshed = await refreshAccessToken();

    if (!refreshed) {
      throw {
        detail: "Session expired. Please login again.",
        status: 401,
      };
    }

    const retryHeaders = await getRequestHeaders(options);
    if (isUnsafeMethod(options.method || "GET")) {
      const match = endpoint.match(/^\/client-portal\/([a-f0-9-]+)/i);
      if (match) {
        retryHeaders["X-Client-Portal-Token"] = match[1];
      }
    }

    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: retryHeaders,
    });
  }

  return parseApiResponse(response);
}
