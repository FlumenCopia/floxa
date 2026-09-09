import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IMoodboard {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  title: string;
  description: string;
  image: string;
  isSelected: boolean;
  isShared: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const moodboardSchema = new Schema<IMoodboard>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, required: true },
    isSelected: { type: Boolean, default: false },
    isShared: { type: Boolean, default: true },
  },
  {
    collection: 'moodboards',
    timestamps: true,
  }
);

moodboardSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

moodboardSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Moodboard: Model<IMoodboard> =
  mongoose.models.Moodboard || mongoose.model<IMoodboard>('Moodboard', moodboardSchema);
