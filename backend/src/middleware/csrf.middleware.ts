import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ENV } from '../config/env.js';
import { verifyAccessJwt } from '../services/auth.service.js';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(ENV.CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by client JS to set X-CSRFToken header
    secure: ENV.CSRF_COOKIE_SECURE,
    sameSite: ENV.CSRF_COOKIE_SAMESITE,
    path: '/',
  });
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe methods do not require CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    return next();
  }

  // Webhooks do not require CSRF (they have their own signature verification)
  if (req.path.startsWith('/api/payments/razorpay/webhook')) {
    return next();
  }

  // Only exempt from CSRF if an actual valid Authorization Bearer JWT is present (non-cookie API client).
  // Never exempt based on raw header existence or unverified x-client-portal-token when cookies exist.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken && verifyAccessJwt(bearerToken)) {
      return next();
    }
  }

  // If authenticated via cookie (consultant access/refresh or client portal), require double-submit CSRF token
  const hasAuthCookie = Boolean(
    req.cookies &&
      (req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME] ||
        req.cookies[ENV.AUTH_REFRESH_COOKIE_NAME] ||
        req.cookies[ENV.PORTAL_ACCESS_COOKIE_NAME])
  );
  if (!hasAuthCookie) {
    return next();
  }

  const cookieToken = typeof req.cookies[ENV.CSRF_COOKIE_NAME] === 'string' ? req.cookies[ENV.CSRF_COOKIE_NAME] : '';
  const rawHeaderToken = req.headers['x-csrftoken'] || req.headers['x-csrf-token'];
  const headerToken = Array.isArray(rawHeaderToken) ? rawHeaderToken[0] : (rawHeaderToken || '');

  if (!cookieToken || !headerToken || !safeEqualStrings(cookieToken, headerToken)) {
    res.status(403).json({ detail: 'CSRF Failed: CSRF token missing or incorrect.' });
    return;
  }

  next();
}
