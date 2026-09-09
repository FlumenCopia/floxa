import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { prisma } from '../prisma/client.js';

import type { Consultant } from '@prisma/client';
import type { AuthenticatedRequest } from '../types/express.js';
export type { AuthenticatedRequest };

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME]) {
    token = req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME];
  }

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as { userId: string };
    if (payload && payload.userId) {
      prisma.consultant
        .findUnique({
          where: { id: payload.userId },
        })
        .then((user) => {
          if (user && user.isActive) {
            req.user = user;
          }
          next();
        })
        .catch(() => next());
      return;
    }
  } catch {
    // Token invalid or expired
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME]) {
    token = req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME];
  }

  if (!token) {
    res.status(401).json({ detail: 'Authentication credentials were not provided.' });
    return;
  }

  try {
    const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as { userId: string };
    if (!payload || !payload.userId) {
      res.status(401).json({ detail: 'Given token not valid for any token type' });
      return;
    }

    prisma.consultant
      .findUnique({
        where: { id: payload.userId },
      })
      .then((user) => {
        if (!user || !user.isActive) {
          res.status(401).json({ detail: 'User not found or inactive.' });
          return;
        }
        req.user = user;
        next();
      })
      .catch((err) => {
        res.status(500).json({ detail: 'Database error during authentication.' });
      });
  } catch (err) {
    res.status(401).json({ detail: 'Given token not valid for any token type', code: 'token_not_valid' });
  }
}
