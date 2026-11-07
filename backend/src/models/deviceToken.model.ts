import mongoose, { Schema, Model } from 'mongoose';

export type DevicePlatform = 'ios' | 'android' | 'web';
export type DeviceUserRole = 'consultant' | 'client';

export interface IDeviceToken {
  _id?: any;
  id: string;
  token: string;
  platform: DevicePlatform;
  role: DeviceUserRole;
  userId?: any;
  portalToken?: string;
  voipToken?: string;
  deviceName?: string;
  appVersion?: string;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'android',
    },
    role: {
      type: String,
      enum: ['consultant', 'client'],
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultant',
      default: null,
      index: true,
    },
    portalToken: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    voipToken: {
      type: String,
      default: null,
      trim: true,
    },
    deviceName: {
      type: String,
      default: '',
    },
    appVersion: {
      type: String,
      default: '1.0.0',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

deviceTokenSchema.index({ userId: 1, isActive: 1 });
deviceTokenSchema.index({ portalToken: 1, isActive: 1 });

export const DeviceToken: Model<IDeviceToken> =
  mongoose.models.DeviceToken || mongoose.model<IDeviceToken>('DeviceToken', deviceTokenSchema);

