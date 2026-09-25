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

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail) {
      res.status(400).json({ email: ['Email is required.'] });
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ email: ['Please enter a valid email address.'] });
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
    const cleanEmail = (googleUser.email || '').trim().toLowerCase();

    const escapedEmail = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let consultant = await Consultant.findOne({
      email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
    });

    if (consultant) {
      if (!consultant.isActive) {
        res.status(400).json({ detail: 'Consultant account is inactive.' });
        return;
      }
    } else {
      consultant = await Consultant.create({
        email: cleanEmail,
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
    const { name, company, phone, integrations } = req.body as {
      name?: string;
      company?: string;
      phone?: string;
      integrations?: any;
    };
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

    // Support updating consultant integrations (Gemini, Razorpay)
    let parsedIntegrations = integrations;
    if (typeof integrations === 'string') {
      try {
        parsedIntegrations = JSON.parse(integrations);
      } catch {}
    }

    const rawBody = req.body || {};
    const hasIntegrationData =
      (parsedIntegrations && typeof parsedIntegrations === 'object') ||
      rawBody.gemini_api_key !== undefined ||
      rawBody.geminiApiKey !== undefined ||
      rawBody.razorpay_key_id !== undefined ||
      rawBody.razorpayKeyId !== undefined ||
      rawBody.razorpay_key_secret !== undefined ||
      rawBody.razorpayKeySecret !== undefined ||
      rawBody.razorpay_webhook_secret !== undefined ||
      rawBody.razorpayWebhookSecret !== undefined;

    if (hasIntegrationData) {
      const existing = req.user?.integrations || {};
      const newIntegrations: Record<string, string> = {
        geminiApiKey: existing.geminiApiKey || '',
        razorpayKeyId: existing.razorpayKeyId || '',
        razorpayKeySecret: existing.razorpayKeySecret || '',
        razorpayWebhookSecret: existing.razorpayWebhookSecret || '',
      };

      const gKey =
        parsedIntegrations?.gemini_api_key ??
        parsedIntegrations?.geminiApiKey ??
        rawBody.gemini_api_key ??
        rawBody.geminiApiKey;
      if (gKey !== undefined) {
        const val = String(gKey).trim();
        if (!val.includes('•')) newIntegrations.geminiApiKey = val;
      }

      const rId =
        parsedIntegrations?.razorpay_key_id ??
        parsedIntegrations?.razorpayKeyId ??
        rawBody.razorpay_key_id ??
        rawBody.razorpayKeyId;
      if (rId !== undefined) {
        newIntegrations.razorpayKeyId = String(rId).trim();
      }

      const rSec =
        parsedIntegrations?.razorpay_key_secret ??
        parsedIntegrations?.razorpayKeySecret ??
        rawBody.razorpay_key_secret ??
        rawBody.razorpayKeySecret;
      if (rSec !== undefined) {
        const val = String(rSec).trim();
        if (!val.includes('•')) newIntegrations.razorpayKeySecret = val;
      }

      const rWh =
        parsedIntegrations?.razorpay_webhook_secret ??
        parsedIntegrations?.razorpayWebhookSecret ??
        rawBody.razorpay_webhook_secret ??
        rawBody.razorpayWebhookSecret;
      if (rWh !== undefined) {
        const val = String(rWh).trim();
        if (!val.includes('•')) newIntegrations.razorpayWebhookSecret = val;
      }

      updateData.integrations = newIntegrations;
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
