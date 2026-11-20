import mongoose from 'mongoose';
import { SubscriptionPlan, type ISubscriptionPlan } from '../models/subscriptionPlan.model.js';
import { Consultant, type IConsultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';

export const DEFAULT_PLANS: Partial<ISubscriptionPlan>[] = [
  {
    name: 'Free Starter',
    slug: 'free',
    description: 'Essential portal setup for independent freelance creatives.',
    badge: 'Free Tier',
    pricing: {
      monthly: { price: 0, discountPct: 0 },
      semiAnnual: { price: 0, discountPct: 0 },
      yearly: { price: 0, discountPct: 0 },
      currency: 'INR',
    },
    limits: {
      maxProjects: 2,
      maxClients: 2,
      maxAiRunsPerMonth: 20,
      maxStorageMb: 500,
      maxTeamMembers: 1,
    },
    features: {
      slaMonitoring: false,
      customBranding: false,
      customDomain: false,
      liveSpecimenPreview: false,
      aiProposalGenerator: true,
      brandDnaMoodboards: false,
      prioritySupport: false,
      analyticsExport: false,
      featureBulletPoints: [
        'Up to 2 active client projects',
        'Up to 2 onboarded clients',
        'Standard client portal access',
        '20 AI tool runs per month',
        'Milestone payment tracking',
      ],
    },
    isActive: true,
    isPublic: true,
    isDefault: true,
    sortOrder: 1,
  },
  {
    name: 'Studio Starter',
    slug: 'starter',
    description: 'Ideal for boutique design studios scaling client onboarding.',
    badge: 'Popular',
    pricing: {
      monthly: { price: 2499, discountPct: 0 },
      semiAnnual: { price: 12745, discountPct: 15 }, // ~2124/mo
      yearly: { price: 20990, discountPct: 30 },     // ~1749/mo
      currency: 'INR',
    },
    limits: {
      maxProjects: 5,
      maxClients: 10,
      maxAiRunsPerMonth: 100,
      maxStorageMb: 2048,
      maxTeamMembers: 2,
    },
    features: {
      slaMonitoring: false,
      customBranding: false,
      customDomain: false,
      liveSpecimenPreview: true,
      aiProposalGenerator: true,
      brandDnaMoodboards: true,
      prioritySupport: false,
      analyticsExport: true,
      featureBulletPoints: [
        'Up to 5 active client projects',
        'Up to 10 onboarded clients',
        'Live font & specimen preview',
        '100 AI tool runs per month',
        'Brand DNA & Moodboard suite',
        'CSV & report exports',
      ],
    },
    isActive: true,
    isPublic: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    name: 'Agency Pro',
    slug: 'pro',
    description: 'High-velocity design agencies managing demanding client deliverables.',
    badge: 'Best Value',
    pricing: {
      monthly: { price: 6999, discountPct: 0 },
      semiAnnual: { price: 35695, discountPct: 15 }, // ~5949/mo
      yearly: { price: 58790, discountPct: 30 },     // ~4899/mo
      currency: 'INR',
    },
    limits: {
      maxProjects: 20,
      maxClients: 50,
      maxAiRunsPerMonth: 500,
      maxStorageMb: 10240,
      maxTeamMembers: 5,
    },
    features: {
      slaMonitoring: true,
      customBranding: true,
      customDomain: false,
      liveSpecimenPreview: true,
      aiProposalGenerator: true,
      brandDnaMoodboards: true,
      prioritySupport: true,
      analyticsExport: true,
      featureBulletPoints: [
        'Up to 20 active client projects',
        'Up to 50 onboarded clients',
        'Automated SLA monitoring & alerts',
        'White-label portal branding',
        'Live font specimen preview',
        '500 AI tool runs per month',
        'Priority support',
      ],
    },
    isActive: true,
    isPublic: true,
    isDefault: false,
    sortOrder: 3,
  },
  {
    name: 'Enterprise Scale',
    slug: 'enterprise',
    description: 'For large agencies requiring unlimited scale and bespoke infrastructure.',
    badge: 'Unlimited',
    pricing: {
      monthly: { price: 16999, discountPct: 0 },
      semiAnnual: { price: 86695, discountPct: 15 },
      yearly: { price: 142790, discountPct: 30 },
      currency: 'INR',
    },
    limits: {
      maxProjects: -1, // Unlimited
      maxClients: -1,  // Unlimited
      maxAiRunsPerMonth: -1,
      maxStorageMb: 102400,
      maxTeamMembers: 20,
    },
    features: {
      slaMonitoring: true,
      customBranding: true,
      customDomain: true,
      liveSpecimenPreview: true,
      aiProposalGenerator: true,
      brandDnaMoodboards: true,
      prioritySupport: true,
      analyticsExport: true,
      featureBulletPoints: [
        'Unlimited client projects',
        'Unlimited onboarded clients',
        'Dedicated SLA escalation monitoring',
        'Custom domain (CNAME) & branding',
        'Unlimited AI generation runs',
        '24/7 Dedicated enterprise support',
      ],
    },
    isActive: true,
    isPublic: true,
    isDefault: false,
    sortOrder: 4,
  },
];

/**
 * Ensures baseline subscription plans exist in the DB.
 */
export async function ensureDefaultSubscriptionPlans(): Promise<void> {
  for (const defPlan of DEFAULT_PLANS) {
    const existing = await SubscriptionPlan.findOne({ slug: defPlan.slug });
    if (!existing) {
      await SubscriptionPlan.create(defPlan);
    }
  }
}

export interface IConsultantQuotaUsage {
  plan: ISubscriptionPlan;
  status: 'active' | 'grace_period' | 'expired' | 'suspended';
  billingCycle: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  gracePeriodEnd: Date;
  daysRemaining: number;
  isGracePeriod: boolean;
  isExpired: boolean;
  projects: {
    current: number;
    max: number;
    percentage: number;
    isLimitReached: boolean;
  };
  clients: {
    current: number;
    max: number;
    percentage: number;
    isLimitReached: boolean;
  };
  features: ISubscriptionPlan['features'];
}

/**
 * Resolves full subscription status and quota metrics for a consultant.
 */
export async function getConsultantSubscriptionDetails(
  consultantId: string | mongoose.Types.ObjectId
): Promise<IConsultantQuotaUsage | null> {
  await ensureDefaultSubscriptionPlans();

  const consultant = await Consultant.findById(consultantId).lean();
  if (!consultant) return null;

  const planSlug = (consultant.subscription?.plan || 'free').toLowerCase();
  let plan = await SubscriptionPlan.findOne({ slug: planSlug, isActive: true }).lean();

  if (!plan) {
    plan = await SubscriptionPlan.findOne({ isDefault: true }).lean();
  }
  if (!plan) {
    plan = await SubscriptionPlan.findOne({ slug: 'free' }).lean();
  }
  if (!plan) {
    throw new Error('Default subscription plan not found');
  }

  // Calculate effective quotas taking custom overrides into account
  const overrides = consultant.subscription?.customLimitOverrides || {};
  const effectiveMaxProjects =
    typeof overrides.maxProjects === 'number'
      ? overrides.maxProjects
      : (consultant.subscription?.maxProjects ?? plan.limits.maxProjects);

  const effectiveMaxClients =
    typeof overrides.maxClients === 'number'
      ? overrides.maxClients
      : (consultant.subscription?.maxClients ?? plan.limits.maxClients);

  // Active projects count (non-archived)
  const activeProjectsCount = await Project.countDocuments({
    consultantId: consultant._id,
    isArchived: { $ne: true },
  });

  // Unique clients count
  const distinctClientIds = await Project.distinct('clientId', {
    consultantId: consultant._id,
    isArchived: { $ne: true },
  });
  const activeClientsCount = distinctClientIds.length;

  // Timeline & status evaluations
  const now = new Date();
  const periodEnd = consultant.subscription?.currentPeriodEnd
    ? new Date(consultant.subscription.currentPeriodEnd)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const gracePeriodEnd = consultant.subscription?.gracePeriodEnd
    ? new Date(consultant.subscription.gracePeriodEnd)
    : new Date(periodEnd.getTime() + 5 * 24 * 60 * 60 * 1000);

  const isExpired = now > gracePeriodEnd;
  const isGracePeriod = !isExpired && now > periodEnd;

  let computedStatus: 'active' | 'grace_period' | 'expired' | 'suspended' = 'active';
  if (consultant.isActive === false || consultant.isSuspended) {
    computedStatus = 'suspended';
  } else if (isExpired) {
    computedStatus = 'expired';
  } else if (isGracePeriod) {
    computedStatus = 'grace_period';
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  const projectPct =
    effectiveMaxProjects === -1
      ? 0
      : Math.min(100, Math.round((activeProjectsCount / effectiveMaxProjects) * 100));

  const clientPct =
    effectiveMaxClients === -1
      ? 0
      : Math.min(100, Math.round((activeClientsCount / effectiveMaxClients) * 100));

  return {
    plan: plan as ISubscriptionPlan,
    status: computedStatus,
    billingCycle: consultant.subscription?.billingCycle || 'monthly',
    currentPeriodStart: consultant.subscription?.currentPeriodStart
      ? new Date(consultant.subscription.currentPeriodStart)
      : now,
    currentPeriodEnd: periodEnd,
    gracePeriodEnd,
    daysRemaining,
    isGracePeriod,
    isExpired,
    projects: {
      current: activeProjectsCount,
      max: effectiveMaxProjects,
      percentage: projectPct,
      isLimitReached: effectiveMaxProjects !== -1 && activeProjectsCount >= effectiveMaxProjects,
    },
    clients: {
      current: activeClientsCount,
      max: effectiveMaxClients,
      percentage: clientPct,
      isLimitReached: effectiveMaxClients !== -1 && activeClientsCount >= effectiveMaxClients,
    },
    features: plan.features,
  };
}

/**
 * Checks whether consultant can create a project.
 */
export async function checkConsultantProjectQuota(
  consultantId: string | mongoose.Types.ObjectId
): Promise<{
  allowed: boolean;
  current: number;
  max: number;
  planName: string;
  reason?: string;
  code?: string;
}> {
  const details = await getConsultantSubscriptionDetails(consultantId);
  if (!details) {
    return { allowed: false, current: 0, max: 0, planName: 'None', reason: 'Consultant not found' };
  }

  if (details.status === 'suspended') {
    return {
      allowed: false,
      current: details.projects.current,
      max: details.projects.max,
      planName: details.plan.name,
      reason: 'Your account is suspended. Please contact platform support.',
      code: 'ACCOUNT_SUSPENDED',
    };
  }

  if (details.isExpired) {
    return {
      allowed: false,
      current: details.projects.current,
      max: details.projects.max,
      planName: details.plan.name,
      reason: `Your subscription has expired. Please renew your plan (${details.plan.name}) to onboard more projects.`,
      code: 'SUBSCRIPTION_EXPIRED',
    };
  }

  if (details.projects.isLimitReached) {
    return {
      allowed: false,
      current: details.projects.current,
      max: details.projects.max,
      planName: details.plan.name,
      reason: `You have reached your project limit (${details.projects.current}/${details.projects.max}) for the ${details.plan.name} plan. Upgrade or renew your subscription to onboard more projects.`,
      code: 'SUBSCRIPTION_LIMIT_REACHED',
    };
  }

  return {
    allowed: true,
    current: details.projects.current,
    max: details.projects.max,
    planName: details.plan.name,
  };
}

/**
 * Checks whether consultant can onboard a new client.
 */
export async function checkConsultantClientQuota(
  consultantId: string | mongoose.Types.ObjectId
): Promise<{
  allowed: boolean;
  current: number;
  max: number;
  planName: string;
  reason?: string;
  code?: string;
}> {
  const details = await getConsultantSubscriptionDetails(consultantId);
  if (!details) {
    return { allowed: false, current: 0, max: 0, planName: 'None', reason: 'Consultant not found' };
  }

  if (details.status === 'suspended') {
    return {
      allowed: false,
      current: details.clients.current,
      max: details.clients.max,
      planName: details.plan.name,
      reason: 'Your account is suspended. Please contact platform support.',
      code: 'ACCOUNT_SUSPENDED',
    };
  }

  if (details.isExpired) {
    return {
      allowed: false,
      current: details.clients.current,
      max: details.clients.max,
      planName: details.plan.name,
      reason: `Your subscription has expired. Please renew your plan to onboard new clients.`,
      code: 'SUBSCRIPTION_EXPIRED',
    };
  }

  if (details.clients.isLimitReached) {
    return {
      allowed: false,
      current: details.clients.current,
      max: details.clients.max,
      planName: details.plan.name,
      reason: `You have reached your client onboarding limit (${details.clients.current}/${details.clients.max}) for the ${details.plan.name} plan. Upgrade to a higher tier to onboard more clients.`,
      code: 'SUBSCRIPTION_CLIENT_LIMIT_REACHED',
    };
  }

  return {
    allowed: true,
    current: details.clients.current,
    max: details.clients.max,
    planName: details.plan.name,
  };
}

/**
 * SuperAdmin action: Adjusts consultant's subscription timeline (adds days or sets custom date).
 */
export async function adjustConsultantTimeline(
  consultantId: string,
  daysToAdd: number,
  reason: string,
  adjustedBy: string,
  explicitExpiryDate?: Date
): Promise<{ success: boolean; newPeriodEnd: Date; gracePeriodEnd: Date }> {
  const consultant = await Consultant.findById(consultantId);
  if (!consultant) throw new Error('Consultant not found');

  const now = new Date();
  const currentEnd = consultant.subscription?.currentPeriodEnd
    ? new Date(consultant.subscription.currentPeriodEnd)
    : now;

  let newEnd: Date;
  if (explicitExpiryDate && !isNaN(new Date(explicitExpiryDate).getTime())) {
    newEnd = new Date(explicitExpiryDate);
  } else {
    const baseDate = currentEnd > now ? currentEnd : now;
    newEnd = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  }

  const newGraceEnd = new Date(newEnd.getTime() + 5 * 24 * 60 * 60 * 1000);

  if (!consultant.subscription) {
    consultant.subscription = {
      plan: 'free',
      status: 'active',
      billingCycle: 'monthly',
      timelineAdjustments: [],
    };
  }

  if (!consultant.subscription.timelineAdjustments) {
    consultant.subscription.timelineAdjustments = [];
  }

  consultant.subscription.timelineAdjustments.push({
    adjustedAt: new Date(),
    adjustedBy: adjustedBy || 'superadmin',
    previousPeriodEnd: currentEnd,
    newPeriodEnd: newEnd,
    daysAdded: daysToAdd,
    reason: reason || 'Timeline adjusted by administrator',
  });

  consultant.subscription.currentPeriodEnd = newEnd;
  consultant.subscription.gracePeriodEnd = newGraceEnd;
  consultant.subscription.status = 'active';

  await consultant.save();

  return {
    success: true,
    newPeriodEnd: newEnd,
    gracePeriodEnd: newGraceEnd,
  };
}

/**
 * SuperAdmin action: Set custom quota overrides for a specific consultant.
 */
export async function overrideConsultantQuota(
  consultantId: string,
  overrides: { maxProjects?: number | null; maxClients?: number | null; maxAiRunsPerMonth?: number | null }
): Promise<any> {
  const consultant = await Consultant.findById(consultantId);
  if (!consultant) throw new Error('Consultant not found');

  if (!consultant.subscription) {
    consultant.subscription = {
      plan: 'free',
      status: 'active',
      billingCycle: 'monthly',
    };
  }

  consultant.subscription.customLimitOverrides = {
    maxProjects: overrides.maxProjects !== undefined ? overrides.maxProjects : consultant.subscription.customLimitOverrides?.maxProjects,
    maxClients: overrides.maxClients !== undefined ? overrides.maxClients : consultant.subscription.customLimitOverrides?.maxClients,
    maxAiRunsPerMonth: overrides.maxAiRunsPerMonth !== undefined ? overrides.maxAiRunsPerMonth : consultant.subscription.customLimitOverrides?.maxAiRunsPerMonth,
  };

  await consultant.save();
  return consultant.subscription;
}
