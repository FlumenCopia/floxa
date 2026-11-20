import mongoose, { Schema, Model } from 'mongoose';

export interface IConsultantIntegrations {
  geminiApiKey?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
}

export interface ITimelineAdjustment {
  adjustedAt: Date;
  adjustedBy: string;
  previousPeriodEnd: Date;
  newPeriodEnd: Date;
  daysAdded: number;
  reason: string;
}

export interface IConsultantSubscription {
  planId?: any;
  plan?: string;
  status?: string;
  billingCycle?: 'monthly' | 'semi_annual' | 'yearly' | 'custom';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  gracePeriodEnd?: Date;
  autoRenew?: boolean;
  maxProjects?: number;
  maxClients?: number;
  customLimitOverrides?: {
    maxProjects?: number | null;
    maxClients?: number | null;
    maxAiRunsPerMonth?: number | null;
  };
  timelineAdjustments?: ITimelineAdjustment[];
  lastPaymentId?: string;
}

export interface IConsultant {
  _id?: any;
  id: string;
  email: string;
  password: string;
  name: string;
  company: string;
  phone: string;
  avatar: string | null;
  isActive: boolean;
  isStaff: boolean;
  isSuspended?: boolean;
  suspendedAt?: Date | null;
  suspensionReason?: string;
  suspendedDueToProjectId?: any;
  reactivationRequest?: {
    requestedAt?: Date | null;
    message?: string;
    status?: 'pending' | 'resolved' | 'none';
  };
  aiUsage?: {
    plan?: string;
    toolRuns?: Record<string, number>;
  };
  subscription?: IConsultantSubscription;
  integrations?: IConsultantIntegrations;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  tokenVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const consultantSchema = new Schema<IConsultant>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    passwordResetToken: {
      type: String,
      default: null,
      index: true,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isStaff: {
      type: Boolean,
      default: false,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspensionReason: {
      type: String,
      default: '',
      trim: true,
    },
    suspendedDueToProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    reactivationRequest: {
      requestedAt: { type: Date, default: null },
      message: { type: String, default: '' },
      status: { type: String, enum: ['pending', 'resolved', 'none'], default: 'none' },
    },
    subscription: {
      planId: {
        type: Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
        default: null,
      },
      plan: {
        type: String,
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'grace_period', 'expired', 'suspended'],
        default: 'active',
      },
      billingCycle: {
        type: String,
        enum: ['monthly', 'semi_annual', 'yearly', 'custom'],
        default: 'monthly',
      },
      currentPeriodStart: {
        type: Date,
        default: Date.now,
      },
      currentPeriodEnd: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      },
      gracePeriodEnd: {
        type: Date,
        default: () => new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // +5 days grace period
      },
      autoRenew: {
        type: Boolean,
        default: true,
      },
      maxProjects: {
        type: Number,
        default: 5,
      },
      maxClients: {
        type: Number,
        default: 10,
      },
      customLimitOverrides: {
        maxProjects: { type: Number, default: null },
        maxClients: { type: Number, default: null },
        maxAiRunsPerMonth: { type: Number, default: null },
      },
      timelineAdjustments: {
        type: [
          {
            adjustedAt: { type: Date, default: Date.now },
            adjustedBy: { type: String, default: 'superadmin' },
            previousPeriodEnd: { type: Date },
            newPeriodEnd: { type: Date },
            daysAdded: { type: Number, default: 0 },
            reason: { type: String, default: '' },
          },
        ],
        default: [],
      },
      lastPaymentId: {
        type: String,
        default: null,
      },
    },
    aiUsage: {
      plan: {
        type: String,
        default: 'free',
      },
      toolRuns: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },
    integrations: {
      geminiApiKey: {
        type: String,
        default: '',
        trim: true,
      },
      razorpayKeyId: {
        type: String,
        default: '',
        trim: true,
      },
      razorpayKeySecret: {
        type: String,
        default: '',
        trim: true,
      },
      razorpayWebhookSecret: {
        type: String,
        default: '',
        trim: true,
      },
    },
  },
  {
    timestamps: true,
    collection: 'consultants',
  }
);

consultantSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

consultantSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Consultant: Model<IConsultant> =
  mongoose.models.Consultant || mongoose.model<IConsultant>('Consultant', consultantSchema);
