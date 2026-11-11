import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { ENV } from '../config/env.js';
import { Consultant, type IConsultant } from '../models/consultant.model.js';

export interface AccessJwtPayload {
  userId: string;
  email?: string;
  tokenVersion?: number;
  tokenType?: 'access' | 'refresh';
}

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
      tokenType: 'access',
    },
    ENV.JWT_ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: ENV.JWT_ACCESS_EXPIRES_IN }
  );

  const refresh = jwt.sign(
    {
      userId,
      tokenVersion: version,
      tokenType: 'refresh',
    },
    ENV.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: ENV.JWT_REFRESH_EXPIRES_IN }
  );

  return {
    access,
    refresh,
    accessToken: access,
    refreshToken: refresh,
  };
}

export function verifyAccessJwt(token: string): AccessJwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessJwtPayload;
    if (!payload || !payload.userId) return null;
    if (payload.tokenType && payload.tokenType !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyRefreshJwt(token: string): AccessJwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, ENV.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as AccessJwtPayload;
    if (!payload || !payload.userId) return null;
    if (payload.tokenType && payload.tokenType !== 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function resolveAuthenticatedConsultant(token: string): Promise<{
  user: IConsultant | null;
  errorStatus?: number;
  errorBody?: Record<string, any>;
}> {
  const payload = verifyAccessJwt(token);
  if (!payload) {
    return {
      user: null,
      errorStatus: 401,
      errorBody: { detail: 'Given token not valid for any token type', code: 'token_not_valid' },
    };
  }

  const user = await Consultant.findById(payload.userId);
  if (!user || !user.isActive || user.isSuspended) {
    if (user && user.isSuspended) {
      return {
        user: null,
        errorStatus: 403,
        errorBody: {
          detail: 'Your consultant account has been suspended due to milestone deadline violations. Please contact SuperAdmin.',
          code: 'ACCOUNT_SUSPENDED_DEADLINE_BREACH',
        },
      };
    }
    return {
      user: null,
      errorStatus: 401,
      errorBody: { detail: 'User not found or inactive.' },
    };
  }

  const tokenVer = payload.tokenVersion ?? 0;
  const userVer = user.tokenVersion ?? 0;
  if (tokenVer !== userVer) {
    return {
      user: null,
      errorStatus: 401,
      errorBody: { detail: 'Given token not valid for any token type', code: 'token_not_valid' },
    };
  }

  return { user };
}

export function setAuthCookies(res: Response, access: string, refresh?: string) {
  res.cookie(ENV.AUTH_ACCESS_COOKIE_NAME, access, {
    httpOnly: true,
    secure: ENV.AUTH_COOKIE_SECURE,
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
    maxAge: ENV.JWT_ACCESS_EXPIRES_IN * 1000,
    path: '/',
  });

  if (refresh) {
    res.cookie(ENV.AUTH_REFRESH_COOKIE_NAME, refresh, {
      httpOnly: true,
      secure: ENV.AUTH_COOKIE_SECURE,
      sameSite: ENV.AUTH_COOKIE_SAMESITE,
      maxAge: ENV.JWT_REFRESH_EXPIRES_IN * 1000,
      path: '/',
    });
  }
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ENV.AUTH_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: ENV.AUTH_COOKIE_SECURE,
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
    path: '/',
  });

  res.clearCookie(ENV.AUTH_REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: ENV.AUTH_COOKIE_SECURE,
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
    path: '/',
  });
}


