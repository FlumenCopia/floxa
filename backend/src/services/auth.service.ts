import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ENV } from '../config/env.js';
import type { IConsultant } from '../models/consultant.model.js';

const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

export function generateTokens(userOrId: IConsultant | string, userEmail?: string) {
  const userId = typeof userOrId === 'string' ? userOrId : (userOrId as any).id || (userOrId as any)._id?.toString();
  const email = typeof userOrId === 'string' ? userEmail : userOrId.email;

  const access = jwt.sign(
    {
      userId,
      email,
    },
    ENV.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );

  const refresh = jwt.sign(
    {
      userId,
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

export async function verifyGoogleToken(token: string) {
  if (!ENV.GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured on the server.');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: ENV.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Invalid Google token payload.');
  }

  return {
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    sub: payload.sub,
    picture: payload.picture,
  };
}
