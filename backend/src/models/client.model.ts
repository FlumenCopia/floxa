import mongoose, { Schema, Model } from 'mongoose';

export interface IClient {
  _id?: any;
  id: string;
  name: string;
  email: string;
  companyName: string;
  sector: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const clientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },
    sector: { type: String, required: true, trim: true },
  },
  {
    collection: 'clients',
    timestamps: true,
  }
);

clientSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

clientSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Client: Model<IClient> =
  mongoose.models.Client || mongoose.model<IClient>('Client', clientSchema);
