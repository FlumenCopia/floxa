import mongoose, { Schema, Model } from 'mongoose';

export interface IConsultantAdminView {
  _id?: any;
  id: string;
  email: string;
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
  subscription?: {
    plan?: string;
    status?: string;
    maxProjects?: number;
  };
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  tokenVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const consultantSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    password: { type: String, required: true },
    passwordResetToken: { type: String, default: null, index: true },
    passwordResetExpires: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true },
    company: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    avatar: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    isStaff: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: '', trim: true },
    suspendedDueToProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    reactivationRequest: {
      requestedAt: { type: Date, default: null },
      message: { type: String, default: '' },
      status: { type: String, enum: ['pending', 'resolved', 'none'], default: 'none' },
    },
    subscription: {
      plan: { type: String, default: 'free' },
      status: { type: String, default: 'active' },
      maxProjects: { type: Number, default: 5 },
    },
    aiUsage: {
      plan: { type: String, default: 'free' },
      toolRuns: { type: Schema.Types.Mixed, default: {} },
    },
  },
  {
    collection: 'consultants',
    timestamps: true,
    strict: false,
  }
);

consultantSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const Consultant: Model<any> =
  mongoose.models.Consultant || mongoose.model('Consultant', consultantSchema);
