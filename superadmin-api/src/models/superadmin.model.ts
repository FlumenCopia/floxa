import mongoose, { Schema, Model } from 'mongoose';

export interface ISuperAdmin {
  _id?: any;
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'superadmin';
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const superAdminSchema = new Schema<ISuperAdmin>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: 'FLOXA Platform SuperAdmin',
      trim: true,
    },
    role: {
      type: String,
      default: 'superadmin',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'superadmins',
  }
);

superAdminSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const SuperAdmin: Model<ISuperAdmin> =
  mongoose.models.SuperAdmin || mongoose.model<ISuperAdmin>('SuperAdmin', superAdminSchema);
