export function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "/api";
  }
  const configured =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "/api";
  return configured.replace(/\/+$/, "");
}

export const API_BASE_URL = getApiBaseUrl();

export function buildApiUrl(endpoint = "") {
  const base = getApiBaseUrl();
  let path = String(endpoint || "").trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const urlObj = new URL(path);
      path = urlObj.pathname + urlObj.search;
    } catch {
      path = path.replace(/^https?:\/\/[^\/]+/i, "");
    }
  }

  const cleanEndpoint = path.startsWith("/") ? path : `/${path}`;

  let finalUrl =
    cleanEndpoint.startsWith("/api/") && base.endsWith("/api")
      ? `${base.slice(0, -4)}${cleanEndpoint}`
      : `${base}${cleanEndpoint}`;

  // Preserve trailing slashes as required by Django URL routing
  return finalUrl;
}

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

let cachedCsrfToken = null;

export function getCsrfToken() {
  return cachedCsrfToken || getCookie("csrftoken") || "";
}

let pendingCsrfPromise = null;
let pendingRefreshPromise = null;
let onRefreshFailure = null;

export function registerRefreshFailureCallback(callback) {
  onRefreshFailure = callback;
}

export async function ensureCsrfCookie(forceRefresh = false) {
  if (!forceRefresh && getCsrfToken()) {
    return getCsrfToken();
  }

  if (!forceRefresh && pendingCsrfPromise) {
    return pendingCsrfPromise;
  }

  pendingCsrfPromise = (async () => {
    try {
      const response = await fetch(buildApiUrl("/auth/csrf/"), {
        method: "GET",
        credentials: "include",
      });
      const data = await parseApiResponse(response);
      const token = data?.csrfToken || data?.csrf_token || getCookie("csrftoken") || "";
      if (token) {
        cachedCsrfToken = token;
      }
      return token;
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

  if (typeof FormData !== "undefined" && options.body instanceof FormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  if (isUnsafeMethod(options.method)) {
    const csrfToken = await ensureCsrfCookie();

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
      const response = await fetch(buildApiUrl("/auth/token/refresh/"), {
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

  let response = await fetch(buildApiUrl(endpoint), {
    ...options,
    credentials: "include",
    headers,
  });

  const isAuthRoute =
    endpoint.includes("/auth/login/") ||
    endpoint.includes("/auth/logout/") ||
    endpoint.includes("/auth/token/refresh/") ||
    endpoint.includes("/auth/register/");

  if (response.status === 403 && isUnsafeMethod(options.method || "GET") && !options._csrfRetried) {
    const newCsrfToken = await ensureCsrfCookie(true);
    const retryHeaders = await getRequestHeaders(options);

    if (newCsrfToken) {
      retryHeaders["X-CSRFToken"] = newCsrfToken;
    }
    if (isUnsafeMethod(options.method || "GET")) {
      const match = endpoint.match(/^\/client-portal\/([a-f0-9-]+)/i);
      if (match) {
        retryHeaders["X-Client-Portal-Token"] = match[1];
      }
    }

    response = await fetch(buildApiUrl(endpoint), {
      ...options,
      _csrfRetried: true,
      credentials: "include",
      headers: retryHeaders,
    });
  }

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

    response = await fetch(buildApiUrl(endpoint), {
      ...options,
      credentials: "include",
      headers: retryHeaders,
    });
  }

  return parseApiResponse(response);
}

export async function fetchProtectedAssetBlob(assetUrl, options = {}) {
  if (!assetUrl) {
    throw { detail: "No asset URL provided.", status: 400 };
  }

  const targetUrl = buildApiUrl(assetUrl);

  const headers = await getRequestHeaders(options, { includeAuth: true });
  delete headers["Content-Type"];

  let response = await fetch(targetUrl, {
    ...options,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = await getRequestHeaders(options, { includeAuth: true });
      delete retryHeaders["Content-Type"];
      response = await fetch(targetUrl, {
        ...options,
        credentials: "include",
        headers: retryHeaders,
      });
    }
  }

  if (!response.ok) {
    let detail = "Failed to fetch asset.";
    if (response.status === 401 || response.status === 403) {
      detail = "Authentication or permission failure accessing asset.";
    } else if (response.status === 404) {
      detail = "Asset not found.";
    } else if (response.status === 503) {
      detail = "Storage service temporarily unavailable.";
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[fetchProtectedAssetBlob] Asset fetch failed (${response.status}): ${detail}`);
    }
    throw { detail, status: response.status };
  }

  const blob = await response.blob();
  const contentType = response.headers.get("content-type") || blob.type || "application/octet-stream";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[fetchProtectedAssetBlob] Asset fetched successfully (${response.status}), Content-Type: ${contentType}, Size: ${blob.size} bytes`);
  }

  return { blob, contentType };
}

export async function downloadProtectedAsset(assetUrl, defaultFilename = "download") {
  const { blob } = await fetchProtectedAssetBlob(assetUrl);
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
