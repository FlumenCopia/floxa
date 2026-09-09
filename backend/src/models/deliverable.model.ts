import mongoose, { Schema, Model, Types } from 'mongoose';

export type DeliverableStatus = 'draft' | 'shared';

export interface IDeliverable {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  title: string;
  description: string;
  file: string;
  status: DeliverableStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const deliverableSchema = new Schema<IDeliverable>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    file: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'shared'],
      default: 'draft',
    },
  },
  {
    collection: 'deliverables',
    timestamps: true,
  }
);

deliverableSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

deliverableSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Deliverable: Model<IDeliverable> =
  mongoose.models.Deliverable || mongoose.model<IDeliverable>('Deliverable', deliverableSchema);
