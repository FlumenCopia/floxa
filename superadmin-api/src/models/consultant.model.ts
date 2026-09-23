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
  subscription?: {
    plan?: string;
    status?: string;
    maxProjects?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const consultantSchema = new Schema(
  {
    email: { type: String, required: true },
    name: { type: String, required: true },
    company: { type: String, default: '' },
    phone: { type: String, default: '' },
    avatar: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    isStaff: { type: Boolean, default: false },
    subscription: {
      plan: { type: String, default: 'free' },
      status: { type: String, default: 'active' },
      maxProjects: { type: Number, default: 5 },
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
