import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Project, type IConsultant } from '../models/index.js';
import { ENV } from '../config/env.js';
import { unsignPortalAccessToken } from '../utils/crypto.js';
import { resolveAuthenticatedConsultant } from '../services/auth.service.js';

export interface PortalRequest extends Request {
  project?: any;
  user?: IConsultant;
  isSupportMode?: boolean;
  isPortalClient?: boolean;
}

function isSupportModeRequested(req: Request): boolean {
  const supportHeader =
    (req.headers['x-support-mode'] as string) ||
    (req.headers['x-consultant-support'] as string) ||
    (req.query.support as string) ||
    (req.query.support_mode as string) ||
    (req.query.mode as string) ||
    (req.query.consultant as string) ||
    '';
  return ['true', '1', 'yes', 'consultant'].includes(supportHeader.trim().toLowerCase());
}

export async function clientPortalAccess(req: PortalRequest, res: Response, next: NextFunction) {
  const portalToken = (
    req.params.portal_token ||
    (req.headers['x-client-portal-token'] as string) ||
    ''
  ).trim();

  if (!portalToken) {
    res.status(404).json({ detail: 'Client portal link not found.' });
    return;
  }

  try {
    const project = await Project.findOne({
      portalToken,
      isArchived: false,
    })
      .populate('client')
      .populate('consultant')
      .populate('clientProfile')
      .populate('discovery')
      .populate('brandDNA')
      .populate('moodboards')
      .populate('concepts')
      .populate('deliverables')
      .populate('projectAgreement')
      .populate('paymentMilestones');

    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    req.project = project;

    // 1. If Support Mode is requested, enforce valid active, non-suspended, tokenVersion-matched owning consultant
    if (isSupportModeRequested(req)) {
      const user = req.user;
      if (!user) {
        res.status(401).json({ detail: 'Consultant authentication credentials required for support mode.' });
        return;
      }
      const ownerId = (project.consultantId as any)?._id?.toString() || project.consultantId?.toString();
      if (ownerId !== user.id.toString()) {
        res.status(403).json({ detail: 'Permission denied: you are not the assigned consultant for this project.' });
        return;
      }
      req.isSupportMode = true;
      return next();
    }

    // 2. If project has NO password set, access is public
    if (!project.portalPasswordHash) {
      if (!req.user) {
        req.isPortalClient = true;
      }
      return next();
    }

    // 3. Verify signed portal access cookie or header
    const signedValue = (
      (req.cookies && req.cookies[ENV.PORTAL_ACCESS_COOKIE_NAME]) ||
      (req.headers['x-portal-access-token'] as string) ||
      ''
    ).trim();

    if (signedValue) {
      const unsigned = unsignPortalAccessToken(signedValue, ENV.PORTAL_ACCESS_MAX_AGE);
      if (unsigned === portalToken) {
        req.isPortalClient = true;
        return next();
      }
    }

    res.status(403).json({ detail: 'Portal password verification required.' });
  } catch (error) {
    res.status(500).json({ detail: 'Internal server error validating portal access.' });
  }
}

export async function requireProjectAccess(req: PortalRequest, res: Response, next: NextFunction) {
  const projectId = (req.params.id || req.params.projectId || '').trim();
  const portalToken = ((req.headers['x-client-portal-token'] as string) || '').trim();

  if (projectId && !mongoose.isValidObjectId(projectId)) {
    res.status(404).json({ detail: 'Project not found.' });
    return;
  }

  if (portalToken) {
    try {
      const project = await Project.findOne({
        _id: projectId,
        isArchived: false,
      })
        .populate('client')
        .populate('consultant')
        .populate('clientProfile')
        .populate('discovery')
        .populate('brandDNA')
        .populate('moodboards')
        .populate('concepts')
        .populate('deliverables')
        .populate('projectAgreement')
        .populate('paymentMilestones');

      if (!project || project.portalToken !== portalToken) {
        res.status(403).json({ detail: 'Portal password verification required.' });
        return;
      }

      req.project = project;

      // 1. Support Mode: enforce valid active, non-suspended, tokenVersion-matched owning consultant
      if (isSupportModeRequested(req)) {
        let supportToken: string | null = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          supportToken = authHeader.substring(7).trim();
        } else if (req.cookies && req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME]) {
          supportToken = req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME];
        }

        if (!supportToken) {
          res.status(401).json({ detail: 'Consultant authentication credentials required for support mode.' });
          return;
        }

        const { user, errorStatus, errorBody } = await resolveAuthenticatedConsultant(supportToken);
        if (!user) {
          res.status(errorStatus || 401).json(errorBody || { detail: 'Authentication credentials were not provided.' });
          return;
        }

        const ownerId = (project.consultantId as any)?._id?.toString() || project.consultantId?.toString();
        if (ownerId !== user.id.toString()) {
          res.status(403).json({ detail: 'Permission denied: you are not the assigned consultant for this project.' });
          return;
        }

        req.user = user;
        req.isSupportMode = true;
        return next();
      }

      // 2. If project has NO password set, access is public
      if (!project.portalPasswordHash) {
        req.isPortalClient = true;
        return next();
      }

      // 3. Verify signed portal access cookie or header
      const signedValue = (
        (req.cookies && req.cookies[ENV.PORTAL_ACCESS_COOKIE_NAME]) ||
        (req.headers['x-portal-access-token'] as string) ||
        ''
      ).trim();

      if (signedValue) {
        const unsigned = unsignPortalAccessToken(signedValue, ENV.PORTAL_ACCESS_MAX_AGE);
        if (unsigned === portalToken) {
          req.isPortalClient = true;
          return next();
        }
      }

      res.status(403).json({ detail: 'Portal password verification required.' });
      return;
    } catch {
      res.status(403).json({ detail: 'Portal password verification required.' });
      return;
    }
  }

  // No portal token provided -> Consultant authentication required
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
    const { user, errorStatus, errorBody } = await resolveAuthenticatedConsultant(token);
    if (!user) {
      res.status(errorStatus || 401).json(errorBody || { detail: 'User not found or inactive.' });
      return;
    }

    const project = await Project.findOne({
      _id: projectId,
      consultantId: user.id,
      isArchived: false,
    })
      .populate('client')
      .populate('consultant');

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    req.user = user;
    req.project = project;
    next();
  } catch {
    res.status(401).json({ detail: 'Authentication credentials were not provided.' });
    return;
  }
}

export function clientOnlyAction(req: PortalRequest, res: Response, next: NextFunction) {
  if (req.isSupportMode) {
    res.status(403).json({
      detail: 'This action is reserved for the client and cannot be performed in consultant support mode.',
    });
    return;
  }

  if (req.user && !req.isPortalClient) {
    res.status(403).json({
      detail: 'This action is reserved for the client and cannot be performed in consultant support mode.',
    });
    return;
  }

  if (!req.project) {
    res.status(404).json({ detail: 'Client portal link not found.' });
    return;
  }

  if (!req.isPortalClient) {
    res.status(403).json({ detail: 'Portal password verification required.' });
    return;
  }

  next();
}
