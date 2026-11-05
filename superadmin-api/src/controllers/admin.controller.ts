import { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';
import { sendCustomerWelcomeEmail, sendPasswordResetNoticeEmail } from '../services/email.service.js';
import type { AdminAuthRequest } from '../middleware/auth.middleware.js';

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const PLAN_PRICING: Record<string, number> = {
  free: 0,
  starter: 2499,
  pro: 6999,
  enterprise: 16999,
};

export async function getMetrics(req: AdminAuthRequest, res: Response) {
  try {
    const [
      totalConsultants,
      activeConsultants,
      suspendedConsultants,
      totalProjects,
      totalClients,
      planBreakdownRaw,
      recentConsultants,
      allConsultantsForAnalytics,
    ] = await Promise.all([
      Consultant.countDocuments(),
      Consultant.countDocuments({ isActive: true }),
      Consultant.countDocuments({ isActive: false }),
      Project.countDocuments(),
      Client.countDocuments(),
      Consultant.aggregate([
        {
          $group: {
            _id: '$subscription.plan',
            count: { $sum: 1 },
          },
        },
      ]),
      Consultant.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email company subscription isActive createdAt')
        .lean(),
      Consultant.find(
        {},
        {
          name: 1,
          email: 1,
          company: 1,
          subscription: 1,
          isActive: 1,
          aiUsage: 1,
        }
      ).lean(),
    ]);

    const planDistribution: Record<string, number> = {
      free: 0,
      starter: 0,
      pro: 0,
      enterprise: 0,
    };

    planBreakdownRaw.forEach((item) => {
      const planKey = item._id || 'free';
      planDistribution[planKey] = item.count;
    });

    // 1. Revenue Calculations
    let mrr = 0;
    let paidConsultants = 0;
    let freeConsultants = 0;
    const revenueByPlan: Record<string, number> = {
      starter: 0,
      pro: 0,
      enterprise: 0,
    };

    // 2. AI Usage & Token Burn Calculations
    let totalAiRuns = 0;
    const toolBreakdown: Record<string, number> = {
      'proposal-generator': 0,
      'enhance-brand-dna': 0,
      'moodboard-directions': 0,
      'other': 0,
    };

    interface IConsumerRecord {
      id: string;
      name: string;
      email: string;
      company: string;
      plan: string;
      totalRuns: number;
      toolRuns: Record<string, number>;
    }

    const consumerList: IConsumerRecord[] = [];

    allConsultantsForAnalytics.forEach((c: any) => {
      const plan = (c.subscription?.plan || 'free').toLowerCase();
      const price = PLAN_PRICING[plan] || 0;
      const isPaying = price > 0 && c.isActive !== false && c.subscription?.status !== 'suspended';

      if (isPaying) {
        mrr += price;
        paidConsultants += 1;
        if (revenueByPlan[plan] !== undefined) {
          revenueByPlan[plan] += price;
        }
      } else {
        freeConsultants += 1;
      }

      // Aggregate AI Tool Runs
      const toolRuns = (c.aiUsage?.toolRuns || {}) as Record<string, number>;
      let userRuns = 0;

      Object.entries(toolRuns).forEach(([toolId, count]) => {
        const num = typeof count === 'number' ? count : 0;
        userRuns += num;
        totalAiRuns += num;
        if (toolBreakdown[toolId] !== undefined) {
          toolBreakdown[toolId] += num;
        } else {
          toolBreakdown['other'] += num;
        }
      });

      if (userRuns > 0) {
        consumerList.push({
          id: c._id.toString(),
          name: c.name || 'Unnamed Agency',
          email: c.email || '',
          company: c.company || 'Independent',
          plan: c.subscription?.plan || 'free',
          totalRuns: userRuns,
          toolRuns,
        });
      }
    });

    consumerList.sort((a, b) => b.totalRuns - a.totalRuns);
    const topAiConsumers = consumerList.slice(0, 5);

    const arr = mrr * 12;
    const arpu = totalConsultants > 0 ? Number((mrr / totalConsultants).toFixed(2)) : 0;
    const conversionRate = totalConsultants > 0 ? Number(((paidConsultants / totalConsultants) * 100).toFixed(1)) : 0;
    const estimatedApiCost = Number((totalAiRuns * 3.75).toFixed(2));

    res.json({
      success: true,
      metrics: {
        totalConsultants,
        activeConsultants,
        suspendedConsultants,
        totalProjects,
        totalClients,
        planDistribution,
        recentConsultants,
        revenue: {
          mrr,
          arr,
          arpu,
          paidConsultants,
          freeConsultants,
          conversionRate,
          revenueByPlan,
          planPricing: PLAN_PRICING,
        },
        aiUsage: {
          totalRuns: totalAiRuns,
          estimatedApiCost,
          toolBreakdown,
          topConsumers: topAiConsumers,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to aggregate platform metrics.', error: err.message });
  }
}

export async function getConsultants(req: AdminAuthRequest, res: Response) {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const plan = String(req.query.plan || '').trim();
    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const rawLimit = parseInt(String(req.query.limit || '20'), 10);
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { company: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'suspended') {
      filter.isActive = false;
    }

    if (plan && ['free', 'starter', 'pro', 'enterprise'].includes(plan)) {
      filter['subscription.plan'] = plan;
    }

    const [consultants, totalCount] = await Promise.all([
      Consultant.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password')
        .lean(),
      Consultant.countDocuments(filter),
    ]);

    // Aggregate project counts for each consultant
    const consultantIds = consultants.map((c) => c._id);
    const projectCountsRaw = await Project.aggregate([
      { $match: { consultantId: { $in: consultantIds } } },
      { $group: { _id: '$consultantId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    projectCountsRaw.forEach((p) => {
      countMap.set(p._id.toString(), p.count);
    });

    const enriched = consultants.map((c: any) => ({
      ...c,
      id: c._id.toString(),
      projectsCount: countMap.get(c._id.toString()) || 0,
      subscription: c.subscription || {
        plan: 'free',
        status: c.isActive ? 'active' : 'suspended',
        maxProjects: 5,
      },
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to retrieve consultants list.', error: err.message });
  }
}

export async function getConsultantDetails(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ detail: 'Invalid consultant ID format.' });
      return;
    }

    const consultant = await Consultant.findById(id).lean();
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    const projects = await Project.find({ consultantId: consultant._id })
      .populate('clientId', 'name email companyName sector')
      .sort({ createdAt: -1 })
      .lean();

    const clientsMap = new Map<string, any>();
    const formattedProjects = projects.map((p: any) => {
      const clientData = p.clientId || null;
      if (clientData && clientData._id) {
        const cId = clientData._id.toString();
        if (!clientsMap.has(cId)) {
          clientsMap.set(cId, {
            id: cId,
            name: clientData.name,
            email: clientData.email,
            companyName: clientData.companyName,
            sector: clientData.sector,
            projectsCount: 1,
          });
        } else {
          const existing = clientsMap.get(cId);
          existing.projectsCount += 1;
        }
      }

      return {
        id: p._id.toString(),
        title: p.title,
        companyName: p.companyName || (clientData?.companyName ?? ''),
        sector: p.sector || (clientData?.sector ?? ''),
        status: p.status || 'created',
        progress: p.progress || 0,
        portalToken: p.portalToken || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        client: clientData
          ? {
              id: clientData._id.toString(),
              name: clientData.name,
              email: clientData.email,
              companyName: clientData.companyName,
            }
          : null,
      };
    });

    const clientsList = Array.from(clientsMap.values());
    const planStr = (consultant.subscription?.plan || 'free').toLowerCase();
    const mrrContribution = PLAN_PRICING[planStr] || 0;

    const toolRuns = (consultant.aiUsage?.toolRuns || {}) as Record<string, number>;
    let aiTotalRuns = 0;
    Object.values(toolRuns).forEach((count) => {
      if (typeof count === 'number') aiTotalRuns += count;
    });

    const stats = {
      totalProjects: projects.length,
      deliveredProjects: projects.filter((p: any) => p.status === 'delivered' || p.progress === 100).length,
      inProgressProjects: projects.filter((p: any) => p.status !== 'delivered' && p.progress < 100).length,
      totalClients: clientsList.length,
      aiTotalRuns,
      aiBonusCredits: consultant.aiUsage?.bonusCredits || 0,
      mrrContribution,
    };

    res.json({
      success: true,
      data: {
        consultant: {
          id: consultant._id.toString(),
          name: consultant.name,
          email: consultant.email,
          company: consultant.company,
          phone: consultant.phone,
          avatar: consultant.avatar,
          isActive: consultant.isActive,
          isStaff: consultant.isStaff,
          isSuspended: Boolean(consultant.isSuspended),
          suspendedAt: consultant.suspendedAt || null,
          suspensionReason: consultant.suspensionReason || '',
          suspendedDueToProjectId: consultant.suspendedDueToProjectId ? consultant.suspendedDueToProjectId.toString() : null,
          reactivationRequest: consultant.reactivationRequest || null,
          subscription: consultant.subscription || {
            plan: 'free',
            status: consultant.isActive ? 'active' : 'suspended',
            maxProjects: 5,
          },
          aiUsage: consultant.aiUsage || { plan: planStr, toolRuns: {} },
          createdAt: consultant.createdAt,
          updatedAt: consultant.updatedAt,
        },
        projects: formattedProjects,
        clients: clientsList,
        stats,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to retrieve consultant details.', error: err.message });
  }
}

export async function updateConsultantStatus(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ detail: 'Invalid consultant ID format.' });
      return;
    }

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ detail: 'isActive boolean field is required.' });
      return;
    }

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    consultant.isActive = isActive;
    if (isActive) {
      consultant.isSuspended = false;
      consultant.suspendedAt = null;
      consultant.suspensionReason = '';
      if (consultant.reactivationRequest) {
        consultant.reactivationRequest.status = 'resolved';
      }
      if (consultant.suspendedDueToProjectId) {
        try {
          await Project.findByIdAndUpdate(consultant.suspendedDueToProjectId, {
            deadlineFlagsCount: 0,
            deadlineBreached: false,
          });
        } catch (projErr) {
          console.warn('Failed to clear project deadline flags:', projErr);
        }
      }
      consultant.suspendedDueToProjectId = null;
    } else {
      consultant.isSuspended = true;
      consultant.suspendedAt = new Date();
      consultant.suspensionReason = req.body.reason || 'admin_manual_suspension';
    }
    consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
    if (consultant.subscription) {
      consultant.subscription.status = isActive ? 'active' : 'suspended';
    }
    await consultant.save();

    res.json({
      success: true,
      message: `Consultant account has been ${isActive ? 'activated' : 'suspended'}.`,
      consultant: {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
        isActive: consultant.isActive,
        subscription: consultant.subscription,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update consultant status.', error: err.message });
  }
}

export async function updateConsultantPlan(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { maxProjects } = req.body;
    const planStr = typeof req.body.plan === 'string' ? req.body.plan.trim() : '';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ detail: 'Invalid consultant ID format.' });
      return;
    }

    const validPlans = ['free', 'starter', 'pro', 'enterprise'];
    if (planStr && !validPlans.includes(planStr)) {
      res.status(400).json({ detail: `Invalid plan. Must be one of: ${validPlans.join(', ')}` });
      return;
    }

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    if (!consultant.subscription) {
      consultant.subscription = {
        plan: 'free',
        status: consultant.isActive ? 'active' : 'suspended',
        maxProjects: 5,
      };
    }

    if (planStr) {
      consultant.subscription.plan = planStr;
      if (maxProjects === undefined) {
        if (planStr === 'free') consultant.subscription.maxProjects = 3;
        else if (planStr === 'starter') consultant.subscription.maxProjects = 10;
        else if (planStr === 'pro') consultant.subscription.maxProjects = 30;
        else if (planStr === 'enterprise') consultant.subscription.maxProjects = 999;
      }
    }

    if (typeof maxProjects === 'number' && maxProjects >= 0) {
      consultant.subscription.maxProjects = Math.min(10000, Math.max(0, maxProjects));
    }

    await consultant.save();

    res.json({
      success: true,
      message: 'Consultant subscription plan updated successfully.',
      subscription: consultant.subscription,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update consultant plan.', error: err.message });
  }
}

export async function updateConsultantAiQuota(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { action, credits } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ detail: 'Invalid consultant ID format.' });
      return;
    }

    const validActions = ['reset', 'set-credits', 'add-credits'];
    if (!validActions.includes(action)) {
      res.status(400).json({ detail: `Invalid quota action. Must be one of: ${validActions.join(', ')}` });
      return;
    }

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    if (!consultant.aiUsage) {
      consultant.aiUsage = {
        plan: consultant.subscription?.plan || 'free',
        toolRuns: {},
      };
    }

    if (action === 'reset') {
      consultant.aiUsage.toolRuns = {};
      consultant.markModified('aiUsage');
    } else if (action === 'set-credits') {
      const bonus = Math.max(0, parseInt(String(credits || 0), 10) || 0);
      consultant.aiUsage.bonusCredits = bonus;
      consultant.markModified('aiUsage');
    } else if (action === 'add-credits') {
      const bonus = Math.max(0, parseInt(String(credits || 0), 10) || 0);
      consultant.aiUsage.bonusCredits = (consultant.aiUsage.bonusCredits || 0) + bonus;
      consultant.markModified('aiUsage');
    }

    await consultant.save();

    res.json({
      success: true,
      message: `AI quota updated successfully (${action}).`,
      aiUsage: consultant.aiUsage,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update consultant AI quota.', error: err.message });
  }
}

export async function resetConsultantPassword(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ detail: 'Invalid consultant ID format.' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
      res.status(400).json({ detail: 'New password is required and must be at least 8 characters.' });
      return;
    }

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    consultant.password = hashedPassword;
    consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
    consultant.passwordResetToken = null;
    consultant.passwordResetExpires = null;
    await consultant.save();

    let emailDispatched = false;
    try {
      const emailResult = await sendPasswordResetNoticeEmail({
        name: consultant.name,
        email: consultant.email,
        rawPassword: newPassword.trim(),
      });
      emailDispatched = emailResult.success;
    } catch (emailErr) {
      console.warn('[superadmin-api] Error dispatching password reset notice email:', emailErr);
    }

    res.json({
      success: true,
      message: emailDispatched
        ? `Password reset and email notification sent to ${consultant.email}.`
        : `Password successfully reset for ${consultant.name}.`,
      emailDispatched,
      consultant: {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to reset customer password.', error: err.message });
  }
}

export async function getProjects(req: AdminAuthRequest, res: Response) {
  try {
    const search = String(req.query.search || '').trim();
    const rawPage = parseInt(String(req.query.page || '1'), 10);
    const rawLimit = parseInt(String(req.query.limit || '20'), 10);
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { companyName: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [projects, totalCount] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('consultantId', 'name email company')
        .lean(),
      Project.countDocuments(filter),
    ]);

    const formatted = projects.map((p: any) => ({
      id: p._id.toString(),
      title: p.title,
      company: p.companyName || p.company_name || '',
      stage: p.status || p.stage || 'discovery',
      progress: p.progress || 0,
      portalToken: p.portalToken || p.portal_token || '',
      consultant: p.consultantId
        ? {
            id: p.consultantId._id?.toString(),
            name: p.consultantId.name,
            email: p.consultantId.email,
            company: p.consultantId.company,
          }
        : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to list platform projects.', error: err.message });
  }
}

export async function getSystemStatus(req: AdminAuthRequest, res: Response) {
  try {
    const dbStateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const readyState = mongoose.connection.readyState;
    const dbStatus = dbStateMap[readyState] || 'unknown';

    let dbPingMs = -1;
    if (readyState === 1 && mongoose.connection.db) {
      const startPing = Date.now();
      await mongoose.connection.db.admin().ping();
      dbPingMs = Date.now() - startPing;
    }

    const mem = process.memoryUsage();

    res.json({
      success: true,
      service: 'floxa-superadmin-api',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        readyState,
        pingMs: dbPingMs,
      },
      server: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, detail: 'Failed to retrieve system status.', error: err.message });
  }
}

export async function createConsultant(req: AdminAuthRequest, res: Response) {
  try {
    const { name, email, password, company, phone, plan, maxProjects } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const cleanPassword = String(password || '').trim();
    const cleanCompany = String(company || '').trim();
    const cleanPhone = String(phone || '').trim();

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanName) {
      res.status(400).json({ detail: 'Customer name is required.' });
      return;
    }

    if (!cleanEmail) {
      res.status(400).json({ detail: 'Email address is required.' });
      return;
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ detail: 'Please enter a valid email address.' });
      return;
    }

    if (!cleanPassword || cleanPassword.length < 8) {
      res.status(400).json({ detail: 'Temporary password must be at least 8 characters long.' });
      return;
    }

    // Check if consultant already exists
    const existing = await Consultant.findOne({ email: cleanEmail });
    if (existing) {
      res.status(409).json({ detail: 'A customer account with this email address already exists.' });
      return;
    }

    const validPlans = ['free', 'starter', 'pro', 'enterprise'];
    const chosenPlan = validPlans.includes(plan) ? plan : 'free';

    let defaultMaxProjects = 5;
    if (chosenPlan === 'free') defaultMaxProjects = 3;
    else if (chosenPlan === 'starter') defaultMaxProjects = 10;
    else if (chosenPlan === 'pro') defaultMaxProjects = 30;
    else if (chosenPlan === 'enterprise') defaultMaxProjects = 999;

    const chosenMaxProjects =
      typeof maxProjects === 'number' && maxProjects >= 0
        ? Math.min(10000, maxProjects)
        : defaultMaxProjects;

    const passwordHash = await bcrypt.hash(cleanPassword, 10);

    const consultant = await Consultant.create({
      name: cleanName,
      email: cleanEmail,
      password: passwordHash,
      company: cleanCompany,
      phone: cleanPhone,
      isActive: true,
      isStaff: false,
      subscription: {
        plan: chosenPlan,
        status: 'active',
        maxProjects: chosenMaxProjects,
      },
      aiUsage: {
        plan: chosenPlan,
        toolRuns: {},
      },
    });

    let emailDispatched = false;
    try {
      const emailResult = await sendCustomerWelcomeEmail({
        name: cleanName,
        email: cleanEmail,
        rawPassword: cleanPassword,
      });
      emailDispatched = emailResult.success;
    } catch (emailErr) {
      console.warn('[superadmin-api] Error dispatching welcome email:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: emailDispatched
        ? `Customer account created and welcome email sent to ${consultant.email}.`
        : 'Customer account created successfully.',
      emailDispatched,
      consultant: {
        id: consultant._id.toString(),
        name: consultant.name,
        email: consultant.email,
        company: consultant.company,
        phone: consultant.phone,
        isActive: consultant.isActive,
        subscription: consultant.subscription,
        createdAt: consultant.createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to create B2B Customer account.', error: err.message });
  }
}


