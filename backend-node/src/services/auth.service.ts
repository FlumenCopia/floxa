import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ENV } from '../config/env.js';

const googleClient = new OAuth2Client();

export function generateTokens(userOrId: string | any) {
  const userId = typeof userOrId === 'object' && userOrId !== null ? userOrId.id : String(userOrId);
  const accessToken = jwt.sign({ userId }, ENV.JWT_ACCESS_SECRET, {
    expiresIn: ENV.JWT_ACCESS_EXPIRES_IN,
  });

  const refreshToken = jwt.sign({ userId, type: 'refresh' }, ENV.JWT_REFRESH_SECRET, {
    expiresIn: ENV.JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken?: string) {
  res.cookie(ENV.AUTH_ACCESS_COOKIE_NAME, accessToken, {
    maxAge: ENV.JWT_ACCESS_EXPIRES_IN * 1000,
    httpOnly: true,
    secure: ENV.AUTH_COOKIE_SECURE,
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
    path: '/',
  });

  if (refreshToken) {
    res.cookie(ENV.AUTH_REFRESH_COOKIE_NAME, refreshToken, {
      maxAge: ENV.JWT_REFRESH_EXPIRES_IN * 1000,
      httpOnly: true,
      secure: ENV.AUTH_COOKIE_SECURE,
      sameSite: ENV.AUTH_COOKIE_SAMESITE,
      path: '/',
    });
  }
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ENV.AUTH_ACCESS_COOKIE_NAME, {
    path: '/',
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
  });
  res.clearCookie(ENV.AUTH_REFRESH_COOKIE_NAME, {
    path: '/',
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
  });
}

export async function verifyGoogleToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified) {
    throw new Error('Google account email is missing or unverified.');
  }

  return {
    email: payload.email.trim().toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
  };
}
