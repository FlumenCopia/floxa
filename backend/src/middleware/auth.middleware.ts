import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ENV } from '../config/env.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
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
      Consultant.findById(payload.userId)
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

    Consultant.findById(payload.userId)
      .then((user) => {
        if (!user || !user.isActive) {
          res.status(401).json({ detail: 'User not found or inactive.' });
          return;
        }
        req.user = user;
        next();
      })
      .catch(() => {
        res.status(500).json({ detail: 'Database error during authentication.' });
      });
  } catch (err) {
    res.status(401).json({ detail: 'Given token not valid for any token type', code: 'token_not_valid' });
  }
}

export async function requireProjectOwnership(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const projectId = (req.params.id || req.params.projectId || '').trim();

  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    res.status(404).json({ detail: 'Project not found.' });
    return;
  }

  const userId = req.user?.id || (req.user as any)?._id?.toString();
  if (!userId) {
    res.status(401).json({ detail: 'Authentication credentials were not provided.' });
    return;
  }

  try {
    const project = await Project.findOne({
      _id: projectId,
      consultantId: userId,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    (req as any).project = project;
    next();
  } catch (err) {
    res.status(500).json({ detail: 'Database error validating project ownership.' });
  }
}
