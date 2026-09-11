import mongoose, { Schema, Model, Types } from 'mongoose';

export type ConceptStatus = 'draft' | 'shared' | 'approved' | 'changes_requested';

export interface IConcept {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  title: string;
  description: string;
  image: string | null;
  watermarkImage?: string | null;
  file: string | null;
  version: number;
  status: ConceptStatus;
  clientFeedback: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const conceptSchema = new Schema<IConcept>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, default: null },
    watermarkImage: { type: String, default: null },
    file: { type: String, default: null },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['draft', 'shared', 'approved', 'changes_requested'],
      default: 'draft',
    },
    clientFeedback: { type: String, default: '' },
  },
  {
    collection: 'concepts',
    timestamps: true,
  }
);

conceptSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

conceptSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Concept: Model<IConcept> =
  mongoose.models.Concept || mongoose.model<IConcept>('Concept', conceptSchema);
