import mongoose, { Schema, Model } from 'mongoose';

export type WebhookProcessingStatus = 'received' | 'processed' | 'ignored' | 'failed';

export interface IRazorpayWebhookEvent {
  _id?: any;
  id: string;
  razorpayEventId: string;
  eventType: string;
  payload: string;
  processingStatus: WebhookProcessingStatus;
  paymentId?: string;
  orderId?: string;
  processedAt?: Date | null;
  failureReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const razorpayWebhookEventSchema = new Schema<IRazorpayWebhookEvent>(
  {
    razorpayEventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    payload: { type: String, default: '{}' },
    processingStatus: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      default: 'received',
    },
    paymentId: { type: String, default: '' },
    orderId: { type: String, default: '' },
    processedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
  },
  {
    collection: 'razorpay_webhook_events',
    timestamps: true,
  }
);

razorpayWebhookEventSchema.index({ eventType: 1, processingStatus: 1 });

razorpayWebhookEventSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

razorpayWebhookEventSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const RazorpayWebhookEvent: Model<IRazorpayWebhookEvent> =
  mongoose.models.RazorpayWebhookEvent ||
  mongoose.model<IRazorpayWebhookEvent>('RazorpayWebhookEvent', razorpayWebhookEventSchema);
