import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ENV } from '../config/env.js';
import { Project } from '../models/project.model.js';
import { resolveAuthenticatedConsultant } from '../services/auth.service.js';
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

  resolveAuthenticatedConsultant(token)
    .then(({ user }) => {
      if (user) {
        req.user = user;
      }
      next();
    })
    .catch(() => next());
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

  resolveAuthenticatedConsultant(token)
    .then(({ user, errorStatus, errorBody }) => {
      if (!user) {
        res.status(errorStatus || 401).json(errorBody || { detail: 'User not found or inactive.' });
        return;
      }

      req.user = user;
      next();
    })
    .catch(() => {
      res.status(500).json({ detail: 'Database error during authentication.' });
    });
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
