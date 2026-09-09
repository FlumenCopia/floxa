import mongoose, { Schema, Model, Types } from 'mongoose';

export type AgreementStatus =
  | 'draft'
  | 'shared'
  | 'signature_requested'
  | 'signed'
  | 'locked';

export type SignatureMethod = 'drawn' | 'typed' | 'uploaded';

export {
  GeneratedAgreementSnapshot,
  type IGeneratedAgreementSnapshot,
} from './generatedAgreement.model.js';

export interface IProjectAgreementAppendix {
  eventType: string;
  title: string;
  content: string;
  createdAt: Date;
}

export interface IProjectAgreement {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  status: AgreementStatus;
  basicPdfFile: string;
  signedPdfFile: string;
  originalSignedPdfFile: string;
  generatedAt: Date | null;
  sharedAt: Date | null;
  signatureRequestedAt: Date | null;
  signatureRequestEmailFailedAt: Date | null;
  signatureRequestEmailError: string;
  signedAt: Date | null;
  signedEmailFailedAt: Date | null;
  signedEmailError: string;
  signerName: string;
  signatureMethod: string;
  signatureImage: string;
  signatureMetadata: string;
  appendices: IProjectAgreementAppendix[];
  createdAt?: Date;
  updatedAt?: Date;

  project?: any;
}

const appendixSchema = new Schema<IProjectAgreementAppendix>(
  {
    eventType: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, default: '{}' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const projectAgreementSchema = new Schema<IProjectAgreement>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'shared', 'signature_requested', 'signed', 'locked'],
      default: 'draft',
    },
    basicPdfFile: { type: String, default: '' },
    signedPdfFile: { type: String, default: '' },
    originalSignedPdfFile: { type: String, default: '' },
    generatedAt: { type: Date, default: null },
    sharedAt: { type: Date, default: null },
    signatureRequestedAt: { type: Date, default: null },
    signatureRequestEmailFailedAt: { type: Date, default: null },
    signatureRequestEmailError: { type: String, default: '' },
    signedAt: { type: Date, default: null },
    signedEmailFailedAt: { type: Date, default: null },
    signedEmailError: { type: String, default: '' },
    signerName: { type: String, default: '' },
    signatureMethod: { type: String, default: '' },
    signatureImage: { type: String, default: '' },
    signatureMetadata: { type: String, default: '{}' },
    appendices: { type: [appendixSchema], default: [] },
  },
  {
    collection: 'project_agreements',
    timestamps: true,
  }
);

projectAgreementSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

projectAgreementSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

projectAgreementSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ProjectAgreement: Model<IProjectAgreement> =
  mongoose.models.ProjectAgreement ||
  mongoose.model<IProjectAgreement>('ProjectAgreement', projectAgreementSchema);
