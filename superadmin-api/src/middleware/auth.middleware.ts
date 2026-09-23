import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SuperAdmin } from '../models/superadmin.model.js';

export interface AdminAuthRequest extends Request {
  admin?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'floxa_superadmin_secret_key_84920481239';

export async function requireAdminAuth(req: AdminAuthRequest, res: Response, next: NextFunction) {
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.floxa_superadmin_token) {
    token = req.cookies.floxa_superadmin_token;
  }

  if (!token) {
    res.status(401).json({ detail: 'SuperAdmin authentication credentials required.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { adminId: string };
    if (!payload || !payload.adminId) {
      res.status(401).json({ detail: 'Invalid SuperAdmin authentication token.' });
      return;
    }

    const admin = await SuperAdmin.findById(payload.adminId);
    if (!admin || !admin.isActive) {
      res.status(401).json({ detail: 'SuperAdmin account not found or deactivated.' });
      return;
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ detail: 'Invalid or expired SuperAdmin token.' });
  }
}
