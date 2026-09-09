import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IGeneratedAgreementSnapshot {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  version: number;
  status: string; // draft, accepted, locked
  snapshot: string;
  pdfFile?: string;
  generatedAt: Date;
  pdfGeneratedAt?: Date | null;
  acceptedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const generatedAgreementSnapshotSchema = new Schema<IGeneratedAgreementSnapshot>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    status: { type: String, default: 'draft' },
    snapshot: { type: String, default: '{}' },
    pdfFile: { type: String, default: '' },
    generatedAt: { type: Date, required: true },
    pdfGeneratedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
  },
  {
    collection: 'generated_agreement_snapshots',
    timestamps: true,
  }
);

generatedAgreementSnapshotSchema.index({ projectId: 1, version: 1 }, { unique: true });

generatedAgreementSnapshotSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

generatedAgreementSnapshotSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const GeneratedAgreementSnapshot: Model<IGeneratedAgreementSnapshot> =
  mongoose.models.GeneratedAgreementSnapshot ||
  mongoose.model<IGeneratedAgreementSnapshot>(
    'GeneratedAgreementSnapshot',
    generatedAgreementSnapshotSchema
  );
