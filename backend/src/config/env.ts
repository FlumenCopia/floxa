import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const defaultMediaRoot = path.resolve(__dirname, '../../media');
const NODE_ENV = process.env.NODE_ENV || 'development';

const INSECURE_SECRET_DEFAULTS = new Set([
  'floxa_default_secret_key_change_me_in_prod',
  'floxa_jwt_access_secret_2026',
  'floxa_jwt_refresh_secret_2026',
  'floxa.client-portal-access',
]);

function requireProdSecret(envName: string, devFallback: string): string {
  const val = (process.env[envName] || '').trim();
  if (NODE_ENV === 'production') {
    if (!val || INSECURE_SECRET_DEFAULTS.has(val) || val.length < 16) {
      throw new Error(`CRITICAL CONFIG ERROR: ${envName} must be set to a strong secret (>=16 chars) in production.`);
    }
    return val;
  }
  return val || devFallback;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://127.0.0.1:27018/floxa_db?replicaSet=rs0&directConnection=true',

  SECRET_KEY: requireProdSecret('SECRET_KEY', 'floxa_default_secret_key_change_me_in_prod'),
  JWT_ACCESS_SECRET: requireProdSecret('JWT_ACCESS_SECRET', 'floxa_jwt_access_secret_2026'),
  JWT_REFRESH_SECRET: requireProdSecret('JWT_REFRESH_SECRET', 'floxa_jwt_refresh_secret_2026'),
  JWT_ACCESS_EXPIRES_IN: parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '900', 10),
  JWT_REFRESH_EXPIRES_IN: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800', 10),
  SECRETS_ENCRYPTION_KEY: (process.env.SECRETS_ENCRYPTION_KEY || '').trim(),

  PORTAL_ACCESS_SALT: requireProdSecret('PORTAL_ACCESS_SALT', 'floxa.client-portal-access'),
  PORTAL_ACCESS_MAX_AGE: parseInt(process.env.PORTAL_ACCESS_MAX_AGE || '86400', 10),

  AUTH_ACCESS_COOKIE_NAME: process.env.AUTH_ACCESS_COOKIE_NAME || 'floxa_access',
  AUTH_REFRESH_COOKIE_NAME: process.env.AUTH_REFRESH_COOKIE_NAME || 'floxa_refresh',
  PORTAL_ACCESS_COOKIE_NAME: process.env.PORTAL_ACCESS_COOKIE_NAME || 'floxa_portal_access',
  CSRF_COOKIE_NAME: process.env.CSRF_COOKIE_NAME || 'csrftoken',

  AUTH_COOKIE_SECURE: NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === 'true' || process.env.AUTH_COOKIE_SECURE === '1',
  AUTH_COOKIE_SAMESITE: ((process.env.AUTH_COOKIE_SAMESITE || (NODE_ENV === 'production' ? 'none' : 'lax')).toLowerCase()) as 'lax' | 'none' | 'strict',
  CSRF_COOKIE_SECURE: NODE_ENV === 'production' || process.env.CSRF_COOKIE_SECURE === 'true' || process.env.CSRF_COOKIE_SECURE === '1',
  CSRF_COOKIE_SAMESITE: ((process.env.CSRF_COOKIE_SAMESITE || (NODE_ENV === 'production' ? 'none' : 'lax')).toLowerCase()) as 'lax' | 'none' | 'strict',

  CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || 'http://localhost:3000',

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  RAZORPAY_CURRENCY: process.env.RAZORPAY_CURRENCY || 'INR',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODELS: (process.env.GEMINI_MODELS || 'gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.6-flash,gemini-3.7-flash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
  GEMINI_TIMEOUT_SECONDS: parseInt(process.env.GEMINI_TIMEOUT_SECONDS || '12', 10),
  GEMINI_MAX_OUTPUT_TOKENS: parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '1200', 10),

  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT || '587', 10),
  EMAIL_HOST_USER: (process.env.EMAIL_HOST_USER || '').trim(),
  EMAIL_HOST_PASSWORD: (process.env.EMAIL_HOST_PASSWORD || '').replace(/\s+/g, ''),
  EMAIL_USE_TLS: process.env.EMAIL_USE_TLS !== 'false',
  DEFAULT_FROM_EMAIL: process.env.DEFAULT_FROM_EMAIL || 'FLOXA',
  MEDIA_ROOT: process.env.MEDIA_ROOT
    ? path.resolve(process.env.MEDIA_ROOT)
    : defaultMediaRoot,
};

export function getTrustedOriginsSet(): Set<string> {
  return new Set(
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://floxa.flumenx.in',
      ...ENV.CORS_ALLOWED_ORIGINS,
      ...(ENV.FRONTEND_BASE_URL ? [ENV.FRONTEND_BASE_URL] : []),
    ]
      .map((o) => (o ? o.trim().replace(/\/+$/, '') : ''))
      .filter(Boolean)
  );
}

/**
 * Resolves a safe frontend base URL ONLY from an explicitly allowlisted Origin/Referer,
 * preventing Origin/Host header poisoning in password reset and invite emails.
 */
export function resolveSafeFrontendOrigin(rawOriginOrReferer?: string | string[]): string | undefined {
  const raw = Array.isArray(rawOriginOrReferer) ? rawOriginOrReferer[0] : rawOriginOrReferer;
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    const parsed = new URL(raw.trim());
    const origin = `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
    const trusted = getTrustedOriginsSet();
    if (trusted.has(origin) && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
