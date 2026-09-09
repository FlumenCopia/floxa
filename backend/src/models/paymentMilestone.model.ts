import mongoose, { Schema, Model, Types } from 'mongoose';

export type PaymentMilestoneType = 'advance' | 'mid' | 'final';
export type PaymentMilestoneStatus = 'pending' | 'requested' | 'paid' | 'ready' | 'locked';
export type MilestoneType = PaymentMilestoneType;
export type MilestoneStatus = PaymentMilestoneStatus;

export interface IPaymentMilestone {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  type: PaymentMilestoneType;
  percentage: number;
  amount: number;
  status: PaymentMilestoneStatus;
  requestedAt: Date | null;
  paidAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;

  project?: any;
  transactions?: any[];
}

const paymentMilestoneSchema = new Schema<IPaymentMilestone>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['advance', 'mid', 'final'],
      required: true,
    },
    percentage: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'requested', 'paid', 'ready', 'locked'],
      default: 'pending',
    },
    requestedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  {
    collection: 'payment_milestones',
    timestamps: true,
  }
);

paymentMilestoneSchema.index({ projectId: 1, type: 1 }, { unique: true });

paymentMilestoneSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

paymentMilestoneSchema.virtual('transactions', {
  ref: 'PaymentTransaction',
  localField: '_id',
  foreignField: 'milestoneId',
});

paymentMilestoneSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

paymentMilestoneSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const PaymentMilestone: Model<IPaymentMilestone> =
  mongoose.models.PaymentMilestone ||
  mongoose.model<IPaymentMilestone>('PaymentMilestone', paymentMilestoneSchema);
