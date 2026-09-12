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
  posterConcepts?: Array<{
    angle: string;
    conceptName: string;
    description: string;
    visualHook: string;
  }>;
  copywritingHooks?: Array<{
    headline: string;
    subline: string;
    cta: string;
  }>;
  colorPalette?: Array<{
    role: string;
    name: string;
    hex: string;
    usage: string;
  }>;
  typographyDirectives?: {
    headlineStyle: string;
    bodyStyle: string;
    pairingRationale: string;
  };
  artDirection?: {
    composition: string;
    lightingAndTexture: string;
    focalPoint: string;
  };
  designRules?: {
    dos: string[];
    donts: string[];
  };
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
    posterConcepts: [
      {
        angle: { type: String, default: '' },
        conceptName: { type: String, default: '' },
        description: { type: String, default: '' },
        visualHook: { type: String, default: '' },
      },
    ],
    copywritingHooks: [
      {
        headline: { type: String, default: '' },
        subline: { type: String, default: '' },
        cta: { type: String, default: '' },
      },
    ],
    colorPalette: [
      {
        role: { type: String, default: '' },
        name: { type: String, default: '' },
        hex: { type: String, default: '' },
        usage: { type: String, default: '' },
      },
    ],
    typographyDirectives: {
      headlineStyle: { type: String, default: '' },
      bodyStyle: { type: String, default: '' },
      pairingRationale: { type: String, default: '' },
    },
    artDirection: {
      composition: { type: String, default: '' },
      lightingAndTexture: { type: String, default: '' },
      focalPoint: { type: String, default: '' },
    },
    designRules: {
      dos: [{ type: String }],
      donts: [{ type: String }],
    },
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
