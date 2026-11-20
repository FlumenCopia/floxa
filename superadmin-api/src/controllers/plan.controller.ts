import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SubscriptionPlan, type ISubscriptionPlan } from '../models/subscriptionPlan.model.js';
import { Consultant } from '../models/consultant.model.js';
import { ensureDefaultSubscriptionPlans, getConsultantUsageMetrics } from '../services/subscription.service.js';
import type { AdminAuthRequest } from '../middleware/auth.middleware.js';

/**
 * List all subscription plans with active subscriber metrics.
 */
export async function listPlans(req: AdminAuthRequest, res: Response) {
  try {
    await ensureDefaultSubscriptionPlans();

    const [plans, subscriberBreakdown] = await Promise.all([
      SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: 1 }).lean(),
      Consultant.aggregate([
        {
          $group: {
            _id: '$subscription.plan',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const subscriberMap: Record<string, number> = {};
    subscriberBreakdown.forEach((s) => {
      if (s._id) subscriberMap[String(s._id).toLowerCase()] = s.count;
    });

    const enrichedPlans = plans.map((plan: any) => ({
      ...plan,
      id: plan._id.toString(),
      subscribersCount: subscriberMap[plan.slug.toLowerCase()] || 0,
    }));

    res.json({
      plans: enrichedPlans,
      total: enrichedPlans.length,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to fetch subscription plans.', error: err.message });
  }
}

/**
 * Get details of a single plan.
 */
export async function getPlan(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    let plan = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      plan = await SubscriptionPlan.findById(id).lean();
    } else {
      plan = await SubscriptionPlan.findOne({ slug: id.toLowerCase() }).lean();
    }

    if (!plan) {
      res.status(404).json({ detail: 'Subscription plan not found.' });
      return;
    }

    const subscriberCount = await Consultant.countDocuments({
      'subscription.plan': plan.slug,
    });

    res.json({
      ...plan,
      id: plan._id.toString(),
      subscribersCount: subscriberCount,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to retrieve plan details.', error: err.message });
  }
}

/**
 * Create a new dynamic subscription plan.
 */
export async function createPlan(req: AdminAuthRequest, res: Response) {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    let slug = String(body.slug || '').trim().toLowerCase();

    if (!name) {
      res.status(400).json({ detail: 'Plan name is required.' });
      return;
    }

    if (!slug) {
      slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const existing = await SubscriptionPlan.findOne({ slug });
    if (existing) {
      res.status(400).json({ detail: `A subscription plan with slug '${slug}' already exists.` });
      return;
    }

    // Pricing parsing & discount auto-calculation if needed
    const monthlyPrice = Number(body.pricing?.monthly?.price ?? body.monthlyPrice ?? 0);
    let semiAnnualPrice = Number(body.pricing?.semiAnnual?.price ?? body.semiAnnualPrice);
    let yearlyPrice = Number(body.pricing?.yearly?.price ?? body.yearlyPrice);

    // Auto-calculate 6M (15% discount) and 1Y (30% discount) if not provided
    if (isNaN(semiAnnualPrice) || semiAnnualPrice <= 0) {
      semiAnnualPrice = Math.round(monthlyPrice * 6 * 0.85);
    }
    if (isNaN(yearlyPrice) || yearlyPrice <= 0) {
      yearlyPrice = Math.round(monthlyPrice * 12 * 0.70);
    }

    const pricing = {
      monthly: {
        price: monthlyPrice,
        discountPct: Number(body.pricing?.monthly?.discountPct ?? 0),
      },
      semiAnnual: {
        price: semiAnnualPrice,
        discountPct: Number(body.pricing?.semiAnnual?.discountPct ?? 15),
      },
      yearly: {
        price: yearlyPrice,
        discountPct: Number(body.pricing?.yearly?.discountPct ?? 30),
      },
      currency: String(body.pricing?.currency || 'INR').toUpperCase(),
    };

    const limits = {
      maxProjects: Number(body.limits?.maxProjects ?? body.maxProjects ?? 5),
      maxClients: Number(body.limits?.maxClients ?? body.maxClients ?? 10),
      maxAiRunsPerMonth: Number(body.limits?.maxAiRunsPerMonth ?? body.maxAiRunsPerMonth ?? 50),
      maxStorageMb: Number(body.limits?.maxStorageMb ?? body.maxStorageMb ?? 1024),
      maxTeamMembers: Number(body.limits?.maxTeamMembers ?? body.maxTeamMembers ?? 1),
    };

    const features = {
      slaMonitoring: Boolean(body.features?.slaMonitoring),
      customBranding: Boolean(body.features?.customBranding),
      customDomain: Boolean(body.features?.customDomain),
      liveSpecimenPreview: Boolean(body.features?.liveSpecimenPreview),
      aiProposalGenerator: Boolean(body.features?.aiProposalGenerator ?? true),
      brandDnaMoodboards: Boolean(body.features?.brandDnaMoodboards),
      prioritySupport: Boolean(body.features?.prioritySupport),
      analyticsExport: Boolean(body.features?.analyticsExport),
      featureBulletPoints: Array.isArray(body.features?.featureBulletPoints)
        ? body.features.featureBulletPoints.filter(Boolean)
        : [],
    };

    const plan = await SubscriptionPlan.create({
      name,
      slug,
      description: String(body.description || '').trim(),
      badge: String(body.badge || '').trim(),
      pricing,
      limits,
      features,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : true,
      isDefault: Boolean(body.isDefault),
      sortOrder: Number(body.sortOrder ?? 0),
    });

    res.status(201).json(plan);
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to create subscription plan.', error: err.message });
  }
}

/**
 * Update an existing dynamic subscription plan.
 */
export async function updatePlan(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      res.status(404).json({ detail: 'Subscription plan not found.' });
      return;
    }

    if (body.name !== undefined) plan.name = String(body.name).trim();
    if (body.description !== undefined) plan.description = String(body.description).trim();
    if (body.badge !== undefined) plan.badge = String(body.badge).trim();
    if (body.isActive !== undefined) plan.isActive = Boolean(body.isActive);
    if (body.isPublic !== undefined) plan.isPublic = Boolean(body.isPublic);
    if (body.isDefault !== undefined) plan.isDefault = Boolean(body.isDefault);
    if (body.sortOrder !== undefined) plan.sortOrder = Number(body.sortOrder);

    if (body.pricing) {
      if (body.pricing.monthly?.price !== undefined) {
        plan.pricing.monthly.price = Number(body.pricing.monthly.price);
      }
      if (body.pricing.semiAnnual?.price !== undefined) {
        plan.pricing.semiAnnual.price = Number(body.pricing.semiAnnual.price);
      }
      if (body.pricing.yearly?.price !== undefined) {
        plan.pricing.yearly.price = Number(body.pricing.yearly.price);
      }
    }

    if (body.limits) {
      if (body.limits.maxProjects !== undefined) plan.limits.maxProjects = Number(body.limits.maxProjects);
      if (body.limits.maxClients !== undefined) plan.limits.maxClients = Number(body.limits.maxClients);
      if (body.limits.maxAiRunsPerMonth !== undefined) plan.limits.maxAiRunsPerMonth = Number(body.limits.maxAiRunsPerMonth);
      if (body.limits.maxStorageMb !== undefined) plan.limits.maxStorageMb = Number(body.limits.maxStorageMb);
      if (body.limits.maxTeamMembers !== undefined) plan.limits.maxTeamMembers = Number(body.limits.maxTeamMembers);
    }

    if (body.features) {
      if (body.features.slaMonitoring !== undefined) plan.features.slaMonitoring = Boolean(body.features.slaMonitoring);
      if (body.features.customBranding !== undefined) plan.features.customBranding = Boolean(body.features.customBranding);
      if (body.features.customDomain !== undefined) plan.features.customDomain = Boolean(body.features.customDomain);
      if (body.features.liveSpecimenPreview !== undefined) plan.features.liveSpecimenPreview = Boolean(body.features.liveSpecimenPreview);
      if (body.features.aiProposalGenerator !== undefined) plan.features.aiProposalGenerator = Boolean(body.features.aiProposalGenerator);
      if (body.features.brandDnaMoodboards !== undefined) plan.features.brandDnaMoodboards = Boolean(body.features.brandDnaMoodboards);
      if (body.features.prioritySupport !== undefined) plan.features.prioritySupport = Boolean(body.features.prioritySupport);
      if (body.features.analyticsExport !== undefined) plan.features.analyticsExport = Boolean(body.features.analyticsExport);
      if (Array.isArray(body.features.featureBulletPoints)) {
        plan.features.featureBulletPoints = body.features.featureBulletPoints.filter(Boolean);
      }
    }

    await plan.save();
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to update subscription plan.', error: err.message });
  }
}

/**
 * Adjust consultant's subscription timeline (grant grace period, extend expiry, or set custom date).
 */
export async function adjustConsultantTimeline(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { daysToAdd, reason, explicitExpiryDate } = req.body || {};

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    const now = new Date();
    const currentEnd = consultant.subscription?.currentPeriodEnd
      ? new Date(consultant.subscription.currentPeriodEnd)
      : now;

    let newEnd: Date;
    if (explicitExpiryDate && !isNaN(new Date(explicitExpiryDate).getTime())) {
      newEnd = new Date(explicitExpiryDate);
    } else {
      const added = Number(daysToAdd || 30);
      const baseDate = currentEnd > now ? currentEnd : now;
      newEnd = new Date(baseDate.getTime() + added * 24 * 60 * 60 * 1000);
    }

    const newGraceEnd = new Date(newEnd.getTime() + 5 * 24 * 60 * 60 * 1000);

    if (!consultant.subscription) {
      consultant.subscription = {
        plan: 'free',
        status: 'active',
        billingCycle: 'monthly',
      };
    }

    const adjustments = consultant.subscription.timelineAdjustments || [];
    adjustments.push({
      adjustedAt: new Date(),
      adjustedBy: req.admin?.email || 'superadmin',
      previousPeriodEnd: currentEnd,
      newPeriodEnd: newEnd,
      daysAdded: Number(daysToAdd || 0),
      reason: String(reason || 'Timeline adjusted by administrator').trim(),
    });

    consultant.subscription.timelineAdjustments = adjustments;
    consultant.subscription.currentPeriodEnd = newEnd;
    consultant.subscription.gracePeriodEnd = newGraceEnd;
    consultant.subscription.status = 'active';

    consultant.markModified('subscription');
    await consultant.save();

    res.json({
      message: 'Subscription timeline updated successfully.',
      subscription: consultant.subscription,
      newPeriodEnd: newEnd,
      gracePeriodEnd: newGraceEnd,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to adjust timeline.', error: err.message });
  }
}

/**
 * Override quotas for a specific consultant (e.g. increase maxProjects from 5 to 15).
 */
export async function overrideConsultantQuota(req: AdminAuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { maxProjects, maxClients, maxAiRunsPerMonth } = req.body || {};

    const consultant = await Consultant.findById(id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    if (!consultant.subscription) {
      consultant.subscription = {
        plan: 'free',
        status: 'active',
        billingCycle: 'monthly',
      };
    }

    const currentOverrides = consultant.subscription.customLimitOverrides || {};
    consultant.subscription.customLimitOverrides = {
      maxProjects: maxProjects !== undefined ? (maxProjects === null ? null : Number(maxProjects)) : currentOverrides.maxProjects,
      maxClients: maxClients !== undefined ? (maxClients === null ? null : Number(maxClients)) : currentOverrides.maxClients,
      maxAiRunsPerMonth: maxAiRunsPerMonth !== undefined ? (maxAiRunsPerMonth === null ? null : Number(maxAiRunsPerMonth)) : currentOverrides.maxAiRunsPerMonth,
    };

    consultant.markModified('subscription');
    await consultant.save();

    res.json({
      message: 'Quota overrides updated successfully.',
      subscription: consultant.subscription,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to override quota.', error: err.message });
  }
}
