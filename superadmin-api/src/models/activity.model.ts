import mongoose, { Schema, Model } from 'mongoose';

const projectActivitySchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    consultantId: { type: Schema.Types.ObjectId, ref: 'Consultant', required: true, index: true },
    actorType: { type: String, enum: ['client', 'consultant', 'system'], required: true },
    action: { type: String, required: true },
    description: { type: String, default: '' },
    metadata: { type: String, default: '{}' },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    visibleToClient: { type: Boolean, default: false },
    clientIsRead: { type: Boolean, default: false },
    clientReadAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'project_activities',
    timestamps: false,
    strict: false,
  }
);

projectActivitySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ProjectActivity: Model<any> =
  mongoose.models.ProjectActivity || mongoose.model('ProjectActivity', projectActivitySchema);

