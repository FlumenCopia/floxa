import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const defaultMediaRoot = path.resolve(__dirname, '../../media');

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://127.0.0.1:27018/floxa_db?replicaSet=rs0&directConnection=true',

  SECRET_KEY: process.env.SECRET_KEY || 'floxa_default_secret_key_change_me_in_prod',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'floxa_jwt_access_secret_2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'floxa_jwt_refresh_secret_2026',
  JWT_ACCESS_EXPIRES_IN: parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '3600', 10),
  JWT_REFRESH_EXPIRES_IN: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800', 10),

  PORTAL_ACCESS_SALT: process.env.PORTAL_ACCESS_SALT || 'floxa.client-portal-access',
  PORTAL_ACCESS_MAX_AGE: parseInt(process.env.PORTAL_ACCESS_MAX_AGE || '86400', 10),

  AUTH_ACCESS_COOKIE_NAME: process.env.AUTH_ACCESS_COOKIE_NAME || 'floxa_access',
  AUTH_REFRESH_COOKIE_NAME: process.env.AUTH_REFRESH_COOKIE_NAME || 'floxa_refresh',
  PORTAL_ACCESS_COOKIE_NAME: process.env.PORTAL_ACCESS_COOKIE_NAME || 'floxa_portal_access',
  CSRF_COOKIE_NAME: process.env.CSRF_COOKIE_NAME || 'csrftoken',

  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE === 'true' || process.env.AUTH_COOKIE_SECURE === '1',
  AUTH_COOKIE_SAMESITE: ((process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase()) as 'lax' | 'none' | 'strict',
  CSRF_COOKIE_SECURE: process.env.CSRF_COOKIE_SECURE === 'true' || process.env.CSRF_COOKIE_SECURE === '1',
  CSRF_COOKIE_SAMESITE: ((process.env.CSRF_COOKIE_SAMESITE || 'lax').toLowerCase()) as 'lax' | 'none' | 'strict',

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

  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '651024427645-q6otcoe5o0u84ac6355g2romi6gd2g11.apps.googleusercontent.com',
  MEDIA_ROOT: process.env.MEDIA_ROOT
    ? path.resolve(process.env.MEDIA_ROOT)
    : defaultMediaRoot,
};
