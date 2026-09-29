import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { ENV } from '../config/env.js';
import type { IConsultant } from '../models/consultant.model.js';

export function generateTokens(userOrId: IConsultant | string, userEmail?: string, tokenVersion?: number) {
  const userId = typeof userOrId === 'string' ? userOrId : (userOrId as any).id || (userOrId as any)._id?.toString();
  const email = typeof userOrId === 'string' ? userEmail : userOrId.email;
  const version = typeof userOrId === 'object' && userOrId !== null
    ? ((userOrId as any).tokenVersion ?? 0)
    : (tokenVersion ?? 0);

  const access = jwt.sign(
    {
      userId,
      email,
      tokenVersion: version,
    },
    ENV.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const refresh = jwt.sign(
    {
      userId,
      tokenVersion: version,
    },
    ENV.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return {
    access,
    refresh,
    accessToken: access,
    refreshToken: refresh,
  };
}

export function setAuthCookies(res: Response, access: string, refresh?: string) {
  const isProd = ENV.NODE_ENV === 'production';

  res.cookie(ENV.AUTH_ACCESS_COOKIE_NAME, access, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });

  if (refresh) {
    res.cookie(ENV.AUTH_REFRESH_COOKIE_NAME, refresh, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }
}

export function clearAuthCookies(res: Response) {
  const isProd = ENV.NODE_ENV === 'production';

  res.clearCookie(ENV.AUTH_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });

  res.clearCookie(ENV.AUTH_REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
}


