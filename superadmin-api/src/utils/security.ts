import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const ENC_PREFIX = 'enc:v1:';
const CSRF_COOKIE_NAME = 'floxa_superadmin_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getSecretsKey(): Buffer {
  const raw =
    process.env.SECRETS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    '';
  if (!raw) {
    throw new Error('SECRETS_ENCRYPTION_KEY or JWT_SECRET must be configured.');
  }
  return crypto.createHash('sha256').update(`floxa-superadmin-secrets-v1:${raw}`).digest();
}

export function encryptSecret(plainText?: string | null): string {
  const raw = typeof plainText === 'string' ? plainText.trim() : '';
  if (!raw) return '';
  if (raw.startsWith(ENC_PREFIX)) return raw;

  const key = getSecretsKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored?: string | null): string {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (!raw) return '';
  if (!raw.startsWith(ENC_PREFIX)) return raw;

  const payload = raw.slice(ENC_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) return '';

  try {
    const [ivHex, tagHex, dataHex] = parts;
    const key = getSecretsKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createCsrfMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    // Login uses no pre-existing authenticated session cookie; still enforce Origin if present
    const originHeader = (req.headers.origin || '').trim().replace(/\/+$/, '');
    if (originHeader && allowedOrigins.length > 0 && !allowedOrigins.includes(originHeader)) {
      res.status(403).json({ detail: 'CSRF verification failed: Untrusted Origin.' });
      return;
    }

    if (req.path === '/api/auth/login') {
      return next();
    }

    // Explicit verified Bearer JWT bypasses cookie CSRF (never invalid Bearer tokens)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const jwtSecret = process.env.JWT_SECRET;
      if (token && jwtSecret) {
        try {
          const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
          if (payload && payload.adminId) {
            return next();
          }
        } catch {
          res.status(401).json({ detail: 'Invalid or expired SuperAdmin token.' });
          return;
        }
      }
    }

    const cookieCsrf = (req.cookies?.[CSRF_COOKIE_NAME] || '').trim();
    const headerCsrf = (
      (req.headers['x-csrf-token'] as string) ||
      (req.headers['x-csrftoken'] as string) ||
      ''
    ).trim();

    if (!cookieCsrf || !headerCsrf || !safeEqualStrings(cookieCsrf, headerCsrf)) {
      res.status(403).json({ detail: 'CSRF verification failed: Missing or invalid CSRF token.' });
      return;
    }

    next();
  };
}

interface Bucket {
  count: number;
  resetAt: number;
}

const adminBuckets = new Map<string, Bucket>();

export function createLoginRateLimiter(max = 15, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const key = `admin_login:${ip}:${email}`;

    const entry = adminBuckets.get(key);
    if (!entry || entry.resetAt <= now) {
      adminBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      res.status(429).json({
        detail: 'Too many login attempts. Please wait before trying again.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

