import mongoose, { Schema, Model } from 'mongoose';

export interface IConsultantIntegrations {
  geminiApiKey?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
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
  aiUsage?: {
    plan?: string;
    toolRuns?: Record<string, number>;
  };
  integrations?: IConsultantIntegrations;
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
