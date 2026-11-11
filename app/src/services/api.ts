import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { storage } from './storage';

// Live production backend address
export const LIVE_API_URL = 'https://floxa.flumenx.in/api';

export let API_BASE_URL = LIVE_API_URL;

export async function initApiBaseUrl(): Promise<string> {
  const custom = await storage.getItem(storage.KEYS.API_BASE_URL);
  if (custom && custom.trim() && !custom.includes('localhost') && !custom.includes('10.0.2.2')) {
    API_BASE_URL = custom.trim().replace(/\/+$/, '');
  } else {
    API_BASE_URL = LIVE_API_URL;
    await storage.setItem(storage.KEYS.API_BASE_URL, LIVE_API_URL);
  }
  api.defaults.baseURL = API_BASE_URL;
  return API_BASE_URL;
}

export async function setCustomApiBaseUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  API_BASE_URL = clean;
  api.defaults.baseURL = clean;
  await storage.setItem(storage.KEYS.API_BASE_URL, clean);
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

let cachedCsrfToken: string | null = null;
let pendingCsrfPromise: Promise<string> | null = null;

export async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }
  if (!forceRefresh) {
    const stored = await storage.getItem(storage.KEYS.CSRF_TOKEN);
    if (stored) {
      cachedCsrfToken = stored;
      return stored;
    }
  }
  if (!forceRefresh && pendingCsrfPromise) {
    return pendingCsrfPromise;
  }

  pendingCsrfPromise = (async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/auth/csrf/`, {
        timeout: 10000,
        headers: { Accept: 'application/json' },
      });
      const token =
        res.data?.csrfToken ||
        res.data?.csrf_token ||
        (typeof res.data === 'string' ? res.data : '');
      if (token) {
        cachedCsrfToken = token;
        await storage.setItem(storage.KEYS.CSRF_TOKEN, token);
      }
      return token || '';
    } catch {
      return '';
    } finally {
      pendingCsrfPromise = null;
    }
  })();

  return pendingCsrfPromise;
}

// Request interceptor injecting Bearer token, Portal Token, and CSRF token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
    const portalToken = await storage.getItem(storage.KEYS.PORTAL_TOKEN);
    const portalAccessToken = await storage.getItem(storage.KEYS.PORTAL_ACCESS_TOKEN);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (portalToken) {
      config.headers['x-client-portal-token'] = portalToken;
    }
    if (portalAccessToken && !config.headers['x-portal-access-token']) {
      config.headers['x-portal-access-token'] = portalAccessToken;
    }

    // Inject CSRF tokens for mutating methods
    const method = (config.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrf = await ensureCsrfToken();
      if (csrf) {
        config.headers['X-CSRFToken'] = csrf;
        config.headers['x-csrftoken'] = csrf;
        config.headers['x-csrf-token'] = csrf;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh and CSRF retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    // 1. Handle CSRF failure retry
    if (
      error.response?.status === 403 &&
      !originalRequest._csrfRetried &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes((originalRequest.method || 'GET').toUpperCase()) &&
      JSON.stringify(error.response?.data || '').toLowerCase().includes('csrf')
    ) {
      originalRequest._csrfRetried = true;
      try {
        const freshCsrf = await ensureCsrfToken(true);
        if (freshCsrf) {
          originalRequest.headers['X-CSRFToken'] = freshCsrf;
          originalRequest.headers['x-csrftoken'] = freshCsrf;
          originalRequest.headers['x-csrf-token'] = freshCsrf;
          return api(originalRequest);
        }
      } catch {
        // Fall through
      }
    }

    // 2. Handle 401 token refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login/') &&
      !originalRequest.url?.includes('/auth/token/refresh/')
    ) {
      originalRequest._retry = true;
      try {
        const refreshToken = await storage.getItem(storage.KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/token/refresh/`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccess = refreshRes.data?.access;
        const newRefresh = refreshRes.data?.refresh;
        if (newAccess) {
          await storage.setItem(storage.KEYS.ACCESS_TOKEN, newAccess);
          if (newRefresh) {
            await storage.setItem(storage.KEYS.REFRESH_TOKEN, newRefresh);
          }
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        // Clear invalid tokens
        await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
        await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
        await storage.removeItem(storage.KEYS.USER_ROLE);
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

