import mongoose, { Schema, Model } from 'mongoose';

const clientSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    companyName: { type: String, default: '' },
    sector: { type: String, default: '' },
  },
  {
    collection: 'clients',
    timestamps: true,
    strict: false,
  }
);

export const Client: Model<any> =
  mongoose.models.Client || mongoose.model('Client', clientSchema);
