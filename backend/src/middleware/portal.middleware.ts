import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Project, Consultant, type IConsultant, type IProject } from '../models/index.js';
import { ENV } from '../config/env.js';
import { unsignPortalAccessToken } from '../utils/crypto.js';

export interface PortalRequest extends Request {
  project?: any;
  user?: IConsultant;
  isSupportMode?: boolean;
  isPortalClient?: boolean;
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

    // 1. Check if authenticated consultant owns this project and is in Support Mode
    const user = req.user;
    if (user) {
      const supportHeader =
        (req.headers['x-support-mode'] as string) ||
        (req.headers['x-consultant-support'] as string) ||
        (req.query.support as string) ||
        (req.query.mode as string) ||
        (req.query.consultant as string) ||
        '';

      const norm = supportHeader.trim().toLowerCase();
      if (['true', '1', 'yes', 'consultant'].includes(norm)) {
        const ownerId = (project.consultantId as any)?._id?.toString() || project.consultantId?.toString();
        if (ownerId !== user.id.toString()) {
          res.status(403).json({ detail: 'Permission denied: you are not the assigned consultant for this project.' });
          return;
        }
        req.isSupportMode = true;
        return next();
      }
    }

    // 2. If project has NO password set, access is public
    if (!project.portalPasswordHash) {
      if (!user) {
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

      // 1. Check if authenticated consultant owns this project and is in Support Mode
      let token: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (req.cookies && req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME]) {
        token = req.cookies[ENV.AUTH_ACCESS_COOKIE_NAME];
      }

      if (token) {
        try {
          const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as { userId: string };
          if (payload?.userId) {
            const user = await Consultant.findById(payload.userId);
            const ownerId = (project.consultantId as any)?._id?.toString() || project.consultantId?.toString();
            if (user && ownerId === user.id.toString()) {
              const supportHeader =
                (req.headers['x-support-mode'] as string) ||
                (req.headers['x-consultant-support'] as string) ||
                (req.query.support as string) ||
                (req.query.mode as string) ||
                (req.query.consultant as string) ||
                '';
              const norm = supportHeader.trim().toLowerCase();
              if (['true', '1', 'yes', 'consultant'].includes(norm)) {
                req.user = user;
                req.isSupportMode = true;
                return next();
              }
            }
          }
        } catch {
          // Token invalid, proceed to password check
        }
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
    const payload = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as { userId: string };
    if (!payload || !payload.userId) {
      res.status(401).json({ detail: 'Given token not valid for any token type' });
      return;
    }

    const user = await Consultant.findById(payload.userId);

    if (!user || !user.isActive) {
      res.status(401).json({ detail: 'User not found or inactive.' });
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
