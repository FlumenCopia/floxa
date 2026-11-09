import { logProjectActivity } from '../services/project.service.js';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Consultant } from '../models/consultant.model.js';
import { DeviceToken } from '../models/deviceToken.model.js';
import { ENV } from '../config/env.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { generateTokens, setAuthCookies, clearAuthCookies } from '../services/auth.service.js';
import { generateCsrfToken, setCsrfCookie } from '../middleware/csrf.middleware.js';
import { serializeConsultant } from '../utils/serializer.js';
import { validateAndProcessAvatar, saveFile, deleteStoredFile } from '../services/storage.service.js';
import { sendPasswordResetEmail } from '../services/email.service.js';
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
      if (consultant.isSuspended) {
        res.status(403).json({
          detail: 'Your consultant account has been automatically suspended due to milestone deadline violations. Please contact SuperAdmin.',
          code: 'ACCOUNT_SUSPENDED_DEADLINE_BREACH',
          suspendedAt: consultant.suspendedAt,
          suspensionReason: consultant.suspensionReason,
        });
        return;
      }
      res.status(400).json({ detail: 'Consultant account is inactive.' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(consultant.id, consultant.email, consultant.tokenVersion || 0);
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
    const payload = jwt.verify(token, ENV.JWT_REFRESH_SECRET) as { userId: string; tokenVersion?: number };
    const user = await Consultant.findById(payload.userId);
    if (!user || !user.isActive) {
      if (user && user.isSuspended) {
        res.status(403).json({
          detail: 'Your consultant account has been suspended due to milestone deadline violations. Please contact SuperAdmin.',
          code: 'ACCOUNT_SUSPENDED_DEADLINE_BREACH',
        });
        return;
      }
      res.status(401).json({ detail: 'User not found or inactive.' });
      return;
    }

    if (
      payload.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      res.status(401).json({ detail: 'Refresh token has expired due to password change.' });
      return;
    }

    const { accessToken } = generateTokens(user.id, user.email, user.tokenVersion || 0);
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

export async function changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string' ||
      !currentPassword.trim() ||
      !newPassword.trim() ||
      !confirmPassword.trim()
    ) {
      res.status(400).json({ detail: 'Current password, new password, and confirmation are required.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ detail: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ detail: 'New password and confirmation do not match.' });
      return;
    }

    const consultant = await Consultant.findById(req.user!.id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    const isCurrentValid = await verifyPassword(currentPassword, consultant.password);
    if (!isCurrentValid) {
      res.status(400).json({ detail: 'Current password is incorrect.' });
      return;
    }

    const isSameAsCurrent = await verifyPassword(newPassword, consultant.password);
    if (isSameAsCurrent) {
      res.status(400).json({ detail: 'New password cannot be the same as your current password.' });
      return;
    }

    const hashedPassword = await hashPassword(newPassword);
    const newVersion = (consultant.tokenVersion || 0) + 1;

    consultant.password = hashedPassword;
    consultant.tokenVersion = newVersion;
    consultant.passwordResetToken = null;
    consultant.passwordResetExpires = null;
    await consultant.save();

    // Issue refreshed auth cookies with incremented tokenVersion for the active session
    const { accessToken, refreshToken: newRefresh } = generateTokens(consultant.id, consultant.email, newVersion);
    setAuthCookies(res, accessToken, newRefresh);

    res.json({ detail: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body || {};
    const GENERIC_RESPONSE = { detail: 'If an account exists for this email, a password reset link has been sent.' };

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ detail: 'Email address is required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const consultant = await Consultant.findOne({ email: cleanEmail });

    if (consultant && consultant.isActive) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      consultant.passwordResetToken = hashedToken;
      consultant.passwordResetExpires = expires;
      await consultant.save();

      try {
        const origin = req.get('origin') || req.headers?.origin || req.headers?.referer;
        const baseUrlOverride = origin && typeof origin === 'string' && !origin.includes('localhost')
          ? origin.replace(/\/reset-password.*|\/forgot-password.*|\/login.*|\/$/, '')
          : undefined;
        await sendPasswordResetEmail(consultant, rawToken, baseUrlOverride);
      } catch (err: any) {
        console.warn('[AUTH] Could not send password reset email:', err?.message || err);
      }
    }

    res.json(GENERIC_RESPONSE);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};

    if (!token || typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ detail: 'Password reset token is required.' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ detail: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ detail: 'New password and confirmation do not match.' });
      return;
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const consultant = await Consultant.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!consultant) {
      res.status(400).json({ detail: 'Password reset link is invalid or has expired.' });
      return;
    }

    const isSameAsCurrent = await verifyPassword(newPassword, consultant.password);
    if (isSameAsCurrent) {
      res.status(400).json({ detail: 'New password cannot be the same as your current password.' });
      return;
    }

    consultant.password = await hashPassword(newPassword);
    consultant.passwordResetToken = null;
    consultant.passwordResetExpires = null;
    consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
    await consultant.save();

    // Clear existing auth cookies to ensure complete session revocation
    clearAuthCookies(res);

    res.json({ detail: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
}


export async function requestReactivation(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, message } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      res.status(400).json({ detail: 'Consultant email is required.' });
      return;
    }

    const consultant = await Consultant.findOne({ email: cleanEmail });
    if (!consultant) {
      res.status(404).json({ detail: 'No consultant found with this email address.' });
      return;
    }

    const userMsg = (message || 'My deliverable is ready. Please review and reactivate my account.').trim();

    consultant.reactivationRequest = {
      requestedAt: new Date(),
      message: userMsg,
      status: 'pending',
    };
    await consultant.save();

    if (consultant.suspendedDueToProjectId) {
      try {
        await logProjectActivity({
          projectId: consultant.suspendedDueToProjectId.toString(),
          consultantId: String(consultant._id),
          actorType: 'consultant',
          action: 'reactivation_requested',
          description: `Reactivation request submitted to SuperAdmin: "${userMsg}"`,
          visibleToClient: false,
          isRead: true,
        });
      } catch (actErr) {
        console.warn('Failed to log project activity for reactivation:', actErr);
      }
    }

    res.json({
      success: true,
      message: 'Account reactivation request dispatched to SuperAdmin.',
      reactivationRequest: consultant.reactivationRequest,
    });
  } catch (err) {
    next(err);
  }
}

export async function registerDeviceToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { token, platform, role, portalToken, voipToken, deviceName, appVersion } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ detail: 'Device token is required.' });
      return;
    }

    const deviceRole = role === 'client' ? 'client' : 'consultant';
    const userId = req.user ? req.user._id : null;
    const cleanPortalToken = typeof portalToken === 'string' ? portalToken.trim() : undefined;
    const platformStr = String(platform || '').toLowerCase();
    const validPlatform = (platformStr === 'ios' || platformStr === 'android' || platformStr === 'web') ? platformStr : 'android';

    const updated = await DeviceToken.findOneAndUpdate(
      { token: token.trim() },
      {
        token: token.trim(),
        platform: validPlatform,
        role: deviceRole,
        userId: deviceRole === 'consultant' ? userId : null,
        portalToken: deviceRole === 'client' ? cleanPortalToken : null,
        voipToken: voipToken ? String(voipToken).trim() : null,
        deviceName: deviceName ? String(deviceName).trim() : '',
        appVersion: appVersion ? String(appVersion).trim() : '1.0.0',
        isActive: true,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, message: 'Device token registered successfully.', deviceTokenId: updated._id });
  } catch (err) {
    next(err);
  }
}

export async function unregisterDeviceToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ detail: 'Device token is required.' });
      return;
    }

    await DeviceToken.deleteOne({ token: String(token).trim() });
    res.json({ success: true, message: 'Device token unregistered successfully.' });
  } catch (err) {
    next(err);
  }
}

