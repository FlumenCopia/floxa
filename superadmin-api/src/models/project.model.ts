import mongoose, { Schema, Model } from 'mongoose';

const projectSchema = new Schema(
  {
    title: { type: String, required: true },
    companyName: { type: String, default: '' },
    sector: { type: String, default: '' },
    status: { type: String, default: 'created' },
    progress: { type: Number, default: 0 },
    portalToken: { type: String, default: '' },
    consultantId: { type: Schema.Types.ObjectId, ref: 'Consultant' },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    isArchived: { type: Boolean, default: false },
  },
  {
    collection: 'projects',
    timestamps: true,
    strict: false,
  }
);

projectSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const Project: Model<any> =
  mongoose.models.Project || mongoose.model('Project', projectSchema);
