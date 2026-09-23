import mongoose, { Schema, Model } from 'mongoose';

export interface IPlatformSetting {
  key: string;
  value: any;
  updatedAt?: Date;
}

const settingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'platform_settings',
  }
);

export const PlatformSetting: Model<IPlatformSetting> =
  mongoose.models.PlatformSetting || mongoose.model<IPlatformSetting>('PlatformSetting', settingSchema);
