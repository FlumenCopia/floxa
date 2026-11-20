import mongoose from 'mongoose';
import { SubscriptionPlan, type ISubscriptionPlan } from '../models/subscriptionPlan.model.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';

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
      semiAnnual: { price: 12745, discountPct: 15 },
      yearly: { price: 20990, discountPct: 30 },
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
      semiAnnual: { price: 35695, discountPct: 15 },
      yearly: { price: 58790, discountPct: 30 },
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
      maxProjects: -1,
      maxClients: -1,
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

export async function ensureDefaultSubscriptionPlans(): Promise<void> {
  for (const defPlan of DEFAULT_PLANS) {
    const existing = await SubscriptionPlan.findOne({ slug: defPlan.slug });
    if (!existing) {
      await SubscriptionPlan.create(defPlan);
    }
  }
}

export async function getConsultantUsageMetrics(consultantId: string) {
  const [activeProjectsCount, distinctClientIds] = await Promise.all([
    Project.countDocuments({ consultantId, isArchived: { $ne: true } }),
    Project.distinct('clientId', { consultantId, isArchived: { $ne: true } }),
  ]);

  return {
    projectsCount: activeProjectsCount,
    clientsCount: distinctClientIds.length,
  };
}
