import mongoose, { Schema, Model, Types } from 'mongoose';

export type ActorType = 'client' | 'consultant' | 'system';

export interface IProjectActivity {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  consultantId: Types.ObjectId | string;
  actorType: ActorType;
  action: string;
  description: string;
  metadata: string;
  isRead: boolean;
  readAt: Date | null;
  visibleToClient: boolean;
  clientIsRead: boolean;
  clientReadAt: Date | null;
  createdAt: Date;

  project?: any;
  consultant?: any;
}

const projectActivitySchema = new Schema<IProjectActivity>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    consultantId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultant',
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ['client', 'consultant', 'system'],
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    metadata: {
      type: String,
      default: '{}',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    visibleToClient: {
      type: Boolean,
      default: false,
    },
    clientIsRead: {
      type: Boolean,
      default: false,
    },
    clientReadAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'project_activities',
    timestamps: false,
  }
);

projectActivitySchema.index({ projectId: 1, createdAt: -1 });
projectActivitySchema.index({ consultantId: 1, isRead: 1 });

projectActivitySchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

projectActivitySchema.virtual('consultant', {
  ref: 'Consultant',
  localField: 'consultantId',
  foreignField: '_id',
  justOne: true,
});

projectActivitySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

projectActivitySchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ProjectActivity: Model<IProjectActivity> =
  mongoose.models.ProjectActivity ||
  mongoose.model<IProjectActivity>('ProjectActivity', projectActivitySchema);
