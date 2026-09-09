import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IClientProfile {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  clientName: string;
  companyName: string;
  industry: string;
  yearStarted: number | null;
  location: string;
  phone: string;
  email: string;
  website: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const clientProfileSchema = new Schema<IClientProfile>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    clientName: { type: String, default: '', trim: true },
    companyName: { type: String, default: '', trim: true },
    industry: { type: String, default: '', trim: true },
    yearStarted: { type: Number, default: null },
    location: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    website: { type: String, default: '', trim: true },
  },
  {
    collection: 'client_profiles',
    timestamps: true,
  }
);

clientProfileSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

clientProfileSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ClientProfile: Model<IClientProfile> =
  mongoose.models.ClientProfile ||
  mongoose.model<IClientProfile>('ClientProfile', clientProfileSchema);
