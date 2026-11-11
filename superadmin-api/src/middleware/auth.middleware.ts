import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SuperAdmin } from '../models/superadmin.model.js';

export interface AdminAuthRequest extends Request {
  admin?: any;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return secret;
}

export async function requireAdminAuth(req: AdminAuthRequest, res: Response, next: NextFunction) {
  let token: string | null = null;
  let explicitBearerProvided = false;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    explicitBearerProvided = true;
    token = authHeader.substring(7).trim();
  } else if (!explicitBearerProvided && req.cookies && req.cookies.floxa_superadmin_token) {
    token = req.cookies.floxa_superadmin_token;
  }

  if (!token) {
    res.status(401).json({ detail: 'SuperAdmin authentication credentials required.' });
    return;
  }

  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecret();
  } catch {
    res.status(500).json({ detail: 'Authentication service is misconfigured: JWT_SECRET environment variable is missing.' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
      adminId: string;
      tokenVersion?: number;
    };
    if (!payload || !payload.adminId) {
      res.status(401).json({ detail: 'Invalid SuperAdmin authentication token.' });
      return;
    }

    const admin = await SuperAdmin.findById(payload.adminId);
    if (!admin || !admin.isActive) {
      res.status(401).json({ detail: 'SuperAdmin account not found or deactivated.' });
      return;
    }

    const tokenVer = payload.tokenVersion ?? 0;
    const adminVer = admin.tokenVersion ?? 0;
    if (tokenVer !== adminVer) {
      res.status(401).json({ detail: 'SuperAdmin session has expired or been revoked.' });
      return;
    }

    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ detail: 'Invalid or expired SuperAdmin token.' });
  }
}
