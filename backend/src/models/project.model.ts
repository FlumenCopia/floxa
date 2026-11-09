import mongoose, { Schema, Model, Types } from 'mongoose';

export type ProjectStatus =
  | 'created'
  | 'discovery'
  | 'advance_paid'
  | 'concepts'
  | 'delivered'
  | 'archived';

export interface IProject {
  _id?: Types.ObjectId;
  id: string;
  consultantId: Types.ObjectId | string;
  clientId: Types.ObjectId | string;
  title: string;
  companyName: string;
  sector: string;
  status: ProjectStatus;
  projectValue: number;
  advancePercentage: number;
  midPercentage: number;
  finalPercentage: number;
  revisionLimit: string;
  portalToken: string;
  portalPasswordHash?: string;
  progress: number;
  clientSignedOff: boolean;
  signedOffAt: Date | null;
  clientLastSeenAt?: Date | null;
  clientSubmittedAt?: Date | null;
  deliveryDeadline?: Date | null;
  deadlineSetAt?: Date | null;
  deadlineFlagsCount?: number;
  deadlineBreached?: boolean;
  deadlineNote?: string;
  slaPausedAt?: Date | null;
  totalClientWaitMs?: number;
  isArchived: boolean;
  createdAt?: Date;
  updatedAt?: Date;

  // Populated fields
  client?: any;
  consultant?: any;
  clientProfile?: any;
  discovery?: any;
  brandDNA?: any;
  moodboards?: any[];
  concepts?: any[];
  deliverables?: any[];
  projectAgreement?: any;
  paymentMilestones?: any[];
  paymentTransactions?: any[];
  activities?: any[];
}

const projectSchema = new Schema<IProject>(
  {
    consultantId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    sector: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['created', 'discovery', 'advance_paid', 'concepts', 'delivered', 'archived'],
      default: 'created',
    },
    projectValue: { type: Number, default: 0 },
    advancePercentage: { type: Number, default: 50 },
    midPercentage: { type: Number, default: 25 },
    finalPercentage: { type: Number, default: 25 },
    revisionLimit: { type: String, default: '3 revisions' },
    portalToken: { type: String, required: true, unique: true, index: true },
    portalPasswordHash: { type: String, default: '' },
    progress: { type: Number, default: 0 },
    clientSignedOff: { type: Boolean, default: false },
    signedOffAt: { type: Date, default: null },
    clientLastSeenAt: { type: Date, default: null },
    clientSubmittedAt: { type: Date, default: null },
    deliveryDeadline: { type: Date, default: null },
    deadlineSetAt: { type: Date, default: null },
    deadlineFlagsCount: { type: Number, default: 0 },
    deadlineBreached: { type: Boolean, default: false },
    deadlineNote: { type: String, default: '' },
    slaPausedAt: { type: Date, default: null },
    totalClientWaitMs: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
  },
  {
    collection: 'projects',
    timestamps: true,
  }
);

projectSchema.index({ consultantId: 1, isArchived: 1 });

projectSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true,
});

projectSchema.virtual('consultant', {
  ref: 'Consultant',
  localField: 'consultantId',
  foreignField: '_id',
  justOne: true,
});

projectSchema.virtual('clientProfile', {
  ref: 'ClientProfile',
  localField: '_id',
  foreignField: 'projectId',
  justOne: true,
});

projectSchema.virtual('discovery', {
  ref: 'ProjectDiscovery',
  localField: '_id',
  foreignField: 'projectId',
  justOne: true,
});

projectSchema.virtual('brandDNA', {
  ref: 'BrandDNA',
  localField: '_id',
  foreignField: 'projectId',
  justOne: true,
});

projectSchema.virtual('moodboards', {
  ref: 'Moodboard',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.virtual('concepts', {
  ref: 'Concept',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.virtual('deliverables', {
  ref: 'Deliverable',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.virtual('projectAgreement', {
  ref: 'ProjectAgreement',
  localField: '_id',
  foreignField: 'projectId',
  justOne: true,
});

projectSchema.virtual('paymentMilestones', {
  ref: 'PaymentMilestone',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.virtual('paymentTransactions', {
  ref: 'PaymentTransaction',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.virtual('activities', {
  ref: 'ProjectActivity',
  localField: '_id',
  foreignField: 'projectId',
});

projectSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

projectSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Project: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>('Project', projectSchema);
