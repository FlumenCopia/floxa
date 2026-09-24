import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SuperAdmin } from '../models/superadmin.model.js';
import type { AdminAuthRequest } from '../middleware/auth.middleware.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables.');
  }
  return secret;
}

export async function adminLogin(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      res.status(400).json({ detail: 'Email and password are required.' });
      return;
    }

    let jwtSecret: string;
    try {
      jwtSecret = getJwtSecret();
    } catch {
      res.status(500).json({ detail: 'Authentication service is misconfigured: JWT_SECRET environment variable is missing.' });
      return;
    }

    const admin = await SuperAdmin.findOne({ email: cleanEmail });
    if (!admin) {
      res.status(401).json({ detail: 'Invalid SuperAdmin email or password.' });
      return;
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      res.status(401).json({ detail: 'Invalid SuperAdmin email or password.' });
      return;
    }

    if (!admin.isActive) {
      res.status(403).json({ detail: 'SuperAdmin account has been deactivated.' });
      return;
    }

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: 'superadmin' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('floxa_superadmin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Internal server error during SuperAdmin login.', error: err.message });
  }
}

export async function getAdminMe(req: AdminAuthRequest, res: Response) {
  res.json({
    success: true,
    admin: {
      id: req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
    },
  });
}

export async function adminLogout(req: Request, res: Response) {
  res.clearCookie('floxa_superadmin_token');
  res.json({ success: true, message: 'SuperAdmin logged out successfully.' });
}
