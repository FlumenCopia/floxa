import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Consultant } from '../models/consultant.model.js';
import { ENV } from '../config/env.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { generateTokens, setAuthCookies, clearAuthCookies, verifyGoogleToken } from '../services/auth.service.js';
import { generateCsrfToken, setCsrfCookie } from '../middleware/csrf.middleware.js';
import { serializeConsultant } from '../utils/serializer.js';
import { validateAndProcessAvatar, saveFile, deleteStoredFile } from '../services/storage.service.js';
import type { AuthenticatedRequest } from '../types/express.js';

export async function getCsrf(req: Request, res: Response) {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({
    detail: 'CSRF cookie set.',
    csrfToken: token,
    csrf_token: token,
  });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, company, phone } = req.body;

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanEmail) {
      res.status(400).json({ email: ['Email is required.'] });
      return;
    }
    if (!cleanName) {
      res.status(400).json({ name: ['Name is required.'] });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ password: ['Password must be at least 8 characters.'] });
      return;
    }

    const existing = await Consultant.findOne({ email: cleanEmail });
    if (existing) {
      res.status(400).json({ email: ['A consultant with this email already exists.'] });
      return;
    }

    const passwordHash = await hashPassword(password);
    const consultant = await Consultant.create({
      email: cleanEmail,
      name: cleanName,
      password: passwordHash,
      company: (company || '').trim(),
      phone: (phone || '').trim(),
    });

    const { accessToken, refreshToken } = generateTokens(consultant.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      message: 'Consultant registered successfully',
      access: accessToken,
      refresh: refreshToken,
      consultant: {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      res.status(400).json({ detail: 'Invalid email or password.' });
      return;
    }

    const consultant = await Consultant.findOne({ email: cleanEmail });
    if (!consultant) {
      res.status(400).json({ detail: 'Invalid email or password.' });
      return;
    }

    const isValid = await verifyPassword(password, consultant.password);
    if (!isValid) {
      res.status(400).json({ detail: 'Invalid email or password.' });
      return;
    }

    if (!consultant.isActive) {
      res.status(400).json({ detail: 'Consultant account is inactive.' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(consultant.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      access: accessToken,
      refresh: refreshToken,
      consultant: {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
        company: consultant.company || '',
        phone: consultant.phone || '',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function googleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ credential: ['Google credential token is required.'] });
      return;
    }

    const googleUser = await verifyGoogleToken(credential);
    let consultant = await Consultant.findOne({ email: googleUser.email });

    if (consultant) {
      if (!consultant.isActive) {
        res.status(400).json({ detail: 'Consultant account is inactive.' });
        return;
      }
    } else {
      consultant = await Consultant.create({
        email: googleUser.email,
        name: googleUser.name,
        password: await hashPassword(Math.random().toString(36)),
      });
    }

    const { accessToken, refreshToken } = generateTokens(consultant.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      access: accessToken,
      refresh: refreshToken,
      consultant: {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
      },
    });
  } catch (err: any) {
    res.status(400).json({ detail: err.message || 'Invalid Google authentication token.' });
  }
}

export async function refreshToken(req: Request, res: Response) {
  const token =
    (req.cookies && req.cookies[ENV.AUTH_REFRESH_COOKIE_NAME]) ||
    req.body?.refresh ||
    '';

  if (!token) {
    res.status(400).json({ detail: 'Refresh token is required.' });
    return;
  }

  try {
    const payload = jwt.verify(token, ENV.JWT_REFRESH_SECRET) as { userId: string };
    const { accessToken } = generateTokens(payload.userId);
    setAuthCookies(res, accessToken);

    res.json({ detail: 'Token refreshed successfully.' });
  } catch {
    res.status(400).json({ detail: 'Invalid refresh token.' });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json(serializeConsultant(req.user, baseUrl));
}

export async function updateMe(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: Response,
  next: NextFunction
) {
  try {
    const { name, company, phone } = req.body as { name?: string; company?: string; phone?: string };
    const updateData: Record<string, any> = {};

    if (name !== undefined) {
      const clean = name.trim();
      if (!clean) {
        res.status(400).json({ name: ['Name cannot be empty.'] });
        return;
      }
      updateData.name = clean;
    }

    if (company !== undefined) updateData.company = company.trim();
    if (phone !== undefined) {
      const cleanPhone = phone.trim();
      if (cleanPhone && !/^[\d+\-\s()]{7,20}$/.test(cleanPhone)) {
        res.status(400).json({ phone: ['Please provide a valid phone number.'] });
        return;
      }
      updateData.phone = cleanPhone;
    }

    let newlySavedAvatar: string | null = null;
    const oldAvatar = req.user?.avatar;

    if (req.file) {
      const { buffer, filename, contentType } = await validateAndProcessAvatar(req.file);
      newlySavedAvatar = await saveFile('consultant_avatars', filename, buffer, contentType);
      updateData.avatar = newlySavedAvatar;
    } else if (
      req.body.avatar === '' ||
      req.body.avatar === null ||
      req.body.avatar === 'null' ||
      req.body.remove_avatar === 'true' ||
      req.body.remove_avatar === true
    ) {
      updateData.avatar = null;
    }

    let updated: any;
    try {
      updated = await Consultant.findByIdAndUpdate(req.user!.id, updateData, { new: true });
    } catch (dbErr) {
      if (newlySavedAvatar) {
        await deleteStoredFile(newlySavedAvatar);
      }
      throw dbErr;
    }

    // Only delete previous avatar if replacement succeeded or avatar was removed
    if (newlySavedAvatar && oldAvatar && oldAvatar !== newlySavedAvatar) {
      await deleteStoredFile(oldAvatar);
    } else if (updateData.avatar === null && oldAvatar) {
      await deleteStoredFile(oldAvatar);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeConsultant(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response) {
  clearAuthCookies(res);
  res.json({ detail: 'Logout successful.' });
}
