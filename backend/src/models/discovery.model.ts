import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IDiscoverySlider {
  sliderKey: string;
  leftLabel?: string;
  rightLabel?: string;
  value: number;
}

export interface IDiscoveryCompetitor {
  name: string;
  rating?: string;
  reason?: string;
}

export interface IProjectDiscovery {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  whatBusinessDoes: string;
  targetCustomer: string;
  whyChooseUs: string;
  brandFeeling: string;
  audienceArchetype: string;
  submittedAt: Date | null;
  sliders: IDiscoverySlider[];
  emotions: string[];
  competitors: IDiscoveryCompetitor[];
  visualStyles: string[];
  selectedFont?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const discoverySliderSchema = new Schema<IDiscoverySlider>(
  {
    sliderKey: { type: String, required: true },
    leftLabel: { type: String, default: '' },
    rightLabel: { type: String, default: '' },
    value: { type: Number, default: 50 },
  },
  { _id: false }
);

const discoveryCompetitorSchema = new Schema<IDiscoveryCompetitor>(
  {
    name: { type: String, required: true },
    rating: { type: String, default: 'neutral' },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const projectDiscoverySchema = new Schema<IProjectDiscovery>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    whatBusinessDoes: { type: String, default: '', trim: true },
    targetCustomer: { type: String, default: '', trim: true },
    whyChooseUs: { type: String, default: '', trim: true },
    brandFeeling: { type: String, default: '', trim: true },
    audienceArchetype: { type: String, default: '', trim: true },
    submittedAt: { type: Date, default: null },
    sliders: { type: [discoverySliderSchema], default: [] },
    emotions: { type: [String], default: [] },
    competitors: { type: [discoveryCompetitorSchema], default: [] },
    visualStyles: { type: [String], default: [] },
    selectedFont: { type: String, default: '', trim: true },
  },
  {
    collection: 'project_discoveries',
    timestamps: true,
  }
);

projectDiscoverySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

projectDiscoverySchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ProjectDiscovery: Model<IProjectDiscovery> =
  mongoose.models.ProjectDiscovery ||
  mongoose.model<IProjectDiscovery>('ProjectDiscovery', projectDiscoverySchema);
