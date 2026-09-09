import mongoose, { Schema, Model, Types } from 'mongoose';

export type PaymentTransactionStatus = 'initiated' | 'completed' | 'failed' | 'created' | 'verified';
export type TransactionStatus = PaymentTransactionStatus;

export interface IPaymentTransaction {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  milestoneId: Types.ObjectId | string;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentTransactionStatus;
  paymentSource: string;
  failureReason?: string;
  createdAt?: Date;
  updatedAt?: Date;

  milestone?: any;
  project?: any;
}

const paymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    milestoneId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentMilestone',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
    status: {
      type: String,
      enum: ['initiated', 'completed', 'failed', 'created', 'verified'],
      default: 'initiated',
    },
    paymentSource: { type: String, default: 'razorpay_checkout' },
    failureReason: { type: String, default: '' },
  },
  {
    collection: 'payment_transactions',
    timestamps: true,
  }
);

paymentTransactionSchema.virtual('milestone', {
  ref: 'PaymentMilestone',
  localField: 'milestoneId',
  foreignField: '_id',
  justOne: true,
});

paymentTransactionSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

paymentTransactionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

paymentTransactionSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const PaymentTransaction: Model<IPaymentTransaction> =
  mongoose.models.PaymentTransaction ||
  mongoose.model<IPaymentTransaction>('PaymentTransaction', paymentTransactionSchema);
