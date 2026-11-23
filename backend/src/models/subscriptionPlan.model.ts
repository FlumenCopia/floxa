import mongoose, { Schema, Model } from 'mongoose';

export interface IPlanPricing {
  monthly: { price: number; discountPct: number };
  semiAnnual: { price: number; discountPct: number };
  yearly: { price: number; discountPct: number };
  currency: string;
}

export interface IPlanLimits {
  maxProjects: number;
  maxClients: number;
  maxAiRunsPerMonth: number;
  maxStorageMb: number;
  maxTeamMembers: number;
}

export interface IPlanFeatures {
  slaMonitoring: boolean;
  customBranding: boolean;
  customDomain: boolean;
  liveSpecimenPreview: boolean;
  aiProposalGenerator: boolean;
  brandDnaMoodboards: boolean;
  prioritySupport: boolean;
  analyticsExport: boolean;
  featureBulletPoints: string[];
}

export interface ISubscriptionPlan {
  _id?: any;
  id: string;
  name: string;
  slug: string;
  description: string;
  badge?: string;
  pricing: IPlanPricing;
  limits: IPlanLimits;
  features: IPlanFeatures;
  isActive: boolean;
  isPublic: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    badge: {
      type: String,
      default: '',
      trim: true,
    },
    pricing: {
      monthly: {
        price: { type: Number, default: 0, min: 0 },
        discountPct: { type: Number, default: 0, min: 0, max: 100 },
      },
      semiAnnual: {
        price: { type: Number, default: 0, min: 0 },
        discountPct: { type: Number, default: 15, min: 0, max: 100 },
      },
      yearly: {
        price: { type: Number, default: 0, min: 0 },
        discountPct: { type: Number, default: 30, min: 0, max: 100 },
      },
      currency: {
        type: String,
        default: 'INR',
        uppercase: true,
        trim: true,
      },
    },
    limits: {
      maxProjects: {
        type: Number,
        default: 5, // -1 represents unlimited
      },
      maxClients: {
        type: Number,
        default: 10, // -1 represents unlimited
      },
      maxAiRunsPerMonth: {
        type: Number,
        default: 50,
      },
      maxStorageMb: {
        type: Number,
        default: 1024, // 1 GB
      },
      maxTeamMembers: {
        type: Number,
        default: 1,
      },
    },
    features: {
      slaMonitoring: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
      customDomain: { type: Boolean, default: false },
      liveSpecimenPreview: { type: Boolean, default: false },
      aiProposalGenerator: { type: Boolean, default: false },
      brandDnaMoodboards: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      analyticsExport: { type: Boolean, default: false },
      featureBulletPoints: {
        type: [String],
        default: [],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: 'subscription_plans',
    timestamps: true,
  }
);

subscriptionPlanSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const SubscriptionPlan: Model<ISubscriptionPlan> =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);
