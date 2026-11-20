import mongoose, { Schema, Model } from 'mongoose';

export interface ISubscriptionTransaction {
  _id?: any;
  id: string;
  consultantId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  planSlug: string;
  billingCycle: 'monthly' | 'semi_annual' | 'yearly' | 'custom';
  amount: number;
  currency: string;
  paymentGateway: 'razorpay' | 'manual_superadmin';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  periodStart: Date;
  periodEnd: Date;
  invoiceNumber: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const subscriptionTransactionSchema = new Schema<ISubscriptionTransaction>(
  {
    consultantId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
      index: true,
    },
    planSlug: {
      type: String,
      required: true,
      trim: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'semi_annual', 'yearly', 'custom'],
      default: 'monthly',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    paymentGateway: {
      type: String,
      enum: ['razorpay', 'manual_superadmin'],
      default: 'razorpay',
    },
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: 'subscription_transactions',
    timestamps: true,
  }
);

subscriptionTransactionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const SubscriptionTransaction: Model<ISubscriptionTransaction> =
  mongoose.models.SubscriptionTransaction ||
  mongoose.model<ISubscriptionTransaction>('SubscriptionTransaction', subscriptionTransactionSchema);
