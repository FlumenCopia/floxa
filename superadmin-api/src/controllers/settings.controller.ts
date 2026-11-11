import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SuperAdmin } from '../models/superadmin.model.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import { PlatformSetting } from '../models/setting.model.js';
import type { AdminAuthRequest } from '../middleware/auth.middleware.js';
import { encryptSecret, decryptSecret } from '../utils/security.js';

// 1. Get SuperAdmin Profile
export async function getAdminProfile(req: AdminAuthRequest, res: Response) {
  try {
    const admin = await SuperAdmin.findById(req.admin._id).select('-password');
    if (!admin) {
      res.status(404).json({ detail: 'SuperAdmin account not found.' });
      return;
    }
    res.json({ success: true, admin });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to fetch admin profile.', error: err.message });
  }
}

// 2. Update SuperAdmin Profile (Name, Email)
export async function updateAdminProfile(req: AdminAuthRequest, res: Response) {
  try {
    const { name, email } = req.body;
    const admin = await SuperAdmin.findById(req.admin._id);
    if (!admin) {
      res.status(404).json({ detail: 'SuperAdmin account not found.' });
      return;
    }

    if (name && typeof name === 'string') admin.name = name.trim();
    if (email && typeof email === 'string') {
      const emailTrimmed = email.trim().toLowerCase();
      // Check if email already taken by another admin
      const existing = await SuperAdmin.findOne({ email: emailTrimmed, _id: { $ne: admin._id } });
      if (existing) {
        res.status(400).json({ detail: 'Email is already in use by another admin.' });
        return;
      }
      admin.email = emailTrimmed;
    }

    await admin.save();
    res.json({
      success: true,
      message: 'Profile updated successfully.',
      admin: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update admin profile.', error: err.message });
  }
}

// 3. Change SuperAdmin Password
export async function changeAdminPassword(req: AdminAuthRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ detail: 'Current password and new password are required.' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ detail: 'New password must be at least 8 characters long.' });
      return;
    }

    const admin = await SuperAdmin.findById(req.admin._id);
    if (!admin) {
      res.status(404).json({ detail: 'SuperAdmin account not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      res.status(401).json({ detail: 'Current password does not match.' });
      return;
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();

    const jwtSecret = process.env.JWT_SECRET;
    let rotatedToken: string | undefined;
    if (jwtSecret) {
      rotatedToken = jwt.sign(
        {
          adminId: admin.id,
          email: admin.email,
          role: 'superadmin',
          tokenVersion: admin.tokenVersion,
        },
        jwtSecret,
        { algorithm: 'HS256', expiresIn: '7d' }
      );
      res.cookie('floxa_superadmin_token', rotatedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    res.json({
      success: true,
      message: 'Password updated successfully.',
      ...(rotatedToken ? { token: rotatedToken } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update password.', error: err.message });
  }
}

// 4. Get Global Announcement
export async function getAnnouncement(req: AdminAuthRequest, res: Response) {
  try {
    const setting = await PlatformSetting.findOne({ key: 'global_announcement' });
    const defaultData = {
      message: '',
      type: 'info',
      isActive: false,
      updatedAt: null,
    };
    res.json({
      success: true,
      announcement: setting ? setting.value : defaultData,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to retrieve announcement.', error: err.message });
  }
}

// 5. Update Global Announcement
export async function updateAnnouncement(req: AdminAuthRequest, res: Response) {
  try {
    const { message, type, isActive } = req.body;
    const value = {
      message: String(message || '').trim(),
      type: ['info', 'warning', 'success'].includes(type) ? type : 'info',
      isActive: Boolean(isActive),
      updatedAt: new Date(),
    };

    const setting = await PlatformSetting.findOneAndUpdate(
      { key: 'global_announcement' },
      { value },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Global announcement updated.',
      announcement: setting.value,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update announcement.', error: err.message });
  }
}

export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

// 6. CSV Export: Consultants Directory
export async function exportConsultantsCsv(req: AdminAuthRequest, res: Response) {
  try {
    const [consultants, projectCountsRaw] = await Promise.all([
      Consultant.find().sort({ createdAt: -1 }).lean(),
      Project.aggregate([
        { $match: { isArchived: { $ne: true } } },
        { $group: { _id: '$consultantId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map<string, number>();
    projectCountsRaw.forEach((p) => {
      countMap.set(p._id.toString(), p.count);
    });

    const headers = [
      'Consultant ID',
      'Full Name',
      'Email Address',
      'Agency Company',
      'Phone Number',
      'Subscription Plan',
      'Account Status',
      'Projects Count',
      'Total AI Tool Runs',
      'Registration Date',
    ];

    const rows = consultants.map((c: any) => {
      const toolRuns = (c.aiUsage?.toolRuns || {}) as Record<string, number>;
      let aiTotalRuns = 0;
      Object.values(toolRuns).forEach((n) => {
        if (typeof n === 'number') aiTotalRuns += n;
      });

      return [
        sanitizeCsvCell(c._id.toString()),
        sanitizeCsvCell(c.name || ''),
        sanitizeCsvCell(c.email || ''),
        sanitizeCsvCell(c.company || 'Independent'),
        sanitizeCsvCell(c.phone || ''),
        sanitizeCsvCell(c.subscription?.plan || 'free'),
        sanitizeCsvCell(c.isActive !== false ? 'Active' : 'Suspended'),
        countMap.get(c._id.toString()) || 0,
        aiTotalRuns,
        sanitizeCsvCell(c.createdAt ? new Date(c.createdAt).toISOString() : ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="floxa-consultants-export.csv"');
    res.status(200).send(csvContent);
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to generate consultants CSV export.', error: err.message });
  }
}

// 7. CSV Export: Platform Projects
export async function exportProjectsCsv(req: AdminAuthRequest, res: Response) {
  try {
    const projects = await Project.find()
      .populate('consultantId', 'name email company')
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      'Project ID',
      'Project Title',
      'Client Company',
      'Agency Name',
      'Consultant Email',
      'Stage',
      'Progress %',
      'Portal Token',
      'Created Date',
    ];

    const rows = projects.map((p: any) => [
      sanitizeCsvCell(p._id.toString()),
      sanitizeCsvCell(p.title || ''),
      sanitizeCsvCell(p.companyName || ''),
      sanitizeCsvCell(p.consultantId?.name || ''),
      sanitizeCsvCell(p.consultantId?.email || ''),
      sanitizeCsvCell(p.status || 'created'),
      p.progress || 0,
      sanitizeCsvCell(p.portalToken || ''),
      sanitizeCsvCell(p.createdAt ? new Date(p.createdAt).toISOString() : ''),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="floxa-projects-export.csv"');
    res.status(200).send(csvContent);
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to generate projects CSV export.', error: err.message });
  }
}

// 8. Integrations & Real API Keys
function maskKey(key: string, showStart = 6, showEnd = 4): string {
  if (!key || key.length <= showStart + showEnd) return key ? '••••••••' : '';
  return `${key.slice(0, showStart)}••••••••${key.slice(-showEnd)}`;
}

export async function getIntegrations(req: AdminAuthRequest, res: Response) {
  try {
    const setting = await PlatformSetting.findOne({ key: 'platform_integrations' });
    const raw = setting?.value || {};

    const geminiKey = decryptSecret(raw.geminiApiKey || '') || process.env.GEMINI_API_KEY || '';
    const razorpayKey = raw.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
    const razorpaySecret = decryptSecret(raw.razorpayKeySecret || '') || process.env.RAZORPAY_KEY_SECRET || '';
    const smtpUser = raw.smtpUser || process.env.EMAIL_HOST_USER || '';
    const smtpHost = raw.smtpHost || process.env.EMAIL_HOST || '';

    res.json({
      success: true,
      integrations: {
        geminiApiKeyMasked: maskKey(geminiKey),
        geminiConfigured: Boolean(geminiKey),
        razorpayKeyId: razorpayKey,
        razorpayKeySecretMasked: maskKey(razorpaySecret),
        razorpayConfigured: Boolean(razorpayKey && razorpaySecret),
        smtpUser,
        smtpHost,
        smtpConfigured: Boolean(smtpUser && smtpHost),
        updatedAt: setting?.updatedAt || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to fetch platform integrations.', error: err.message });
  }
}

export async function updateIntegrations(req: AdminAuthRequest, res: Response) {
  try {
    const { geminiApiKey, razorpayKeyId, razorpayKeySecret, smtpUser, smtpHost } = req.body;

    const existing = await PlatformSetting.findOne({ key: 'platform_integrations' });
    const current = existing?.value || {};

    const updated: Record<string, any> = {
      ...current,
      ...(typeof razorpayKeyId === 'string' ? { razorpayKeyId: razorpayKeyId.trim() } : {}),
      ...(typeof smtpUser === 'string' ? { smtpUser: smtpUser.trim() } : {}),
      ...(typeof smtpHost === 'string' ? { smtpHost: smtpHost.trim() } : {}),
    };

    if (typeof geminiApiKey === 'string') {
      const val = geminiApiKey.trim();
      if (!val.includes('•')) {
        updated.geminiApiKey = val ? encryptSecret(val) : '';
      }
    }

    if (typeof razorpayKeySecret === 'string') {
      const val = razorpayKeySecret.trim();
      if (!val.includes('•')) {
        updated.razorpayKeySecret = val ? encryptSecret(val) : '';
      }
    }

    const saved = await PlatformSetting.findOneAndUpdate(
      { key: 'platform_integrations' },
      { value: updated },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Platform API Keys & Integrations updated successfully.',
      updatedAt: saved.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update integrations.', error: err.message });
  }
}

export async function testGeminiConnection(req: AdminAuthRequest, res: Response) {
  try {
    const setting = await PlatformSetting.findOne({ key: 'platform_integrations' });
    const rawSubmitted = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const apiKey =
      (rawSubmitted && !rawSubmitted.includes('•') ? rawSubmitted : '') ||
      decryptSecret(setting?.value?.geminiApiKey || '') ||
      process.env.GEMINI_API_KEY ||
      '';

    if (!apiKey) {
      res.status(400).json({ detail: 'No Gemini API Key provided or configured.' });
      return;
    }

    const startTime = Date.now();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - startTime;

    if (response.ok) {
      const data: any = await response.json();
      res.json({
        success: true,
        message: 'Google Gemini API is active & verified!',
        latencyMs: latency,
        modelsCount: Array.isArray(data.models) ? data.models.length : 0,
      });
    } else {
      const errData: any = await response.json().catch(() => ({}));
      res.status(400).json({
        success: false,
        detail: errData.error?.message || `Google API returned status ${response.status}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to connect to Google Gemini API.', error: err.message });
  }
}

// 9. Purge Demo Agencies
export async function purgeDemoData(req: AdminAuthRequest, res: Response) {
  try {
    // Explicit known demo agency account emails (strictly excluding admin@floxa.com or platform accounts)
    const KNOWN_DEMO_EMAILS = [
      'sarah@novadesign.agency',
      'alex@studiobrand.com',
      'marcus@craftedidentity.io',
      'elena@freelance.dev',
    ];

    const protectedEmails = [
      'admin@floxa.com',
      (process.env.SUPERADMIN_EMAIL || '').toLowerCase().trim(),
    ].filter(Boolean);

    // Explicitly target only verified demo accounts:
    // 1. isDemo: true, OR
    // 2. Exact match in KNOWN_DEMO_EMAILS
    // NEVER match protected platform/admin accounts, any @floxa.com email, or staff accounts
    const demoConsultants = await Consultant.find({
      $and: [
        {
          $or: [
            { isDemo: true },
            { email: { $in: KNOWN_DEMO_EMAILS } },
          ],
        },
        { email: { $nin: protectedEmails } },
        { email: { $not: /@floxa\.com$/i } },
        { isStaff: { $ne: true } },
      ],
    }).select('_id email');

    if (demoConsultants.length === 0) {
      res.json({
        success: true,
        message: 'No demo agencies found to purge. All existing accounts are protected real accounts.',
        deletedConsultantsCount: 0,
        deletedProjectsCount: 0,
      });
      return;
    }

    const demoIds = demoConsultants.map((c: any) => c._id);

    // Delete demo projects associated with purged demo consultants
    const deletedProjects = await Project.deleteMany({ consultantId: { $in: demoIds } });

    // Delete demo consultants
    const deletedConsultants = await Consultant.deleteMany({ _id: { $in: demoIds } });

    res.json({
      success: true,
      message: 'Demo agencies safely purged. Platform admin and real consultant accounts were preserved.',
      deletedConsultantsCount: deletedConsultants.deletedCount,
      deletedProjectsCount: deletedProjects.deletedCount,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to purge demo data.', error: err.message });
  }
}
