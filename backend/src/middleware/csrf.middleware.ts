import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ENV } from '../config/env.js';

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

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe methods do not require CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    return next();
  }

  // Webhooks do not require CSRF (they have their own signature verification)
  if (req.path.startsWith('/api/payments/razorpay/webhook')) {
    return next();
  }

  // If using Authorization Bearer token header or Client Portal token header, CSRF is not enforced (token-based API authentication)
  const authHeader = req.headers.authorization;
  const portalHeader = req.headers['x-client-portal-token'];
  if ((authHeader && authHeader.startsWith('Bearer ')) || portalHeader) {
    return next();
  }

  // If authenticated via cookie, check CSRF token (for either consultant or client portal sessions)
  const hasAuthCookie = Boolean(
    req.cookies &&
      (req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME] || req.cookies[ENV.PORTAL_ACCESS_COOKIE_NAME])
  );
  if (!hasAuthCookie) {
    // Unauthenticated requests (e.g. login, register, password verify) do not require CSRF enforcement in DRF
    return next();
  }

  const cookieToken = req.cookies[ENV.CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrftoken'] || req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ detail: 'CSRF Failed: CSRF token missing or incorrect.' });
    return;
  }

  next();
}
