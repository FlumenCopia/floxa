import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IBrandDNA {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  brandPersonalityCluster: string;
  businessSummary: string;
  targetAudienceSummary: string;
  positioningSummary: string;
  brandFeelingSummary: string;
  visualDirectionSummary: string;
  competitorSummary: string;
  generatedFromDiscovery: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const brandDNASchema = new Schema<IBrandDNA>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    brandPersonalityCluster: { type: String, default: '' },
    businessSummary: { type: String, default: '' },
    targetAudienceSummary: { type: String, default: '' },
    positioningSummary: { type: String, default: '' },
    brandFeelingSummary: { type: String, default: '' },
    visualDirectionSummary: { type: String, default: '' },
    competitorSummary: { type: String, default: '' },
    generatedFromDiscovery: { type: Boolean, default: true },
  },
  {
    collection: 'brand_dnas',
    timestamps: true,
  }
);

brandDNASchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

brandDNASchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const BrandDNA: Model<IBrandDNA> =
  mongoose.models.BrandDNA || mongoose.model<IBrandDNA>('BrandDNA', brandDNASchema);
