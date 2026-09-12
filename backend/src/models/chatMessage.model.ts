import mongoose, { Schema, Model, Types } from 'mongoose';

export type ChatSenderRole = 'client' | 'consultant';
export type ChatMessageStatus = 'sent' | 'delivered' | 'read';
export type ChatMessageType = 'text' | 'voice' | 'image' | 'file';

export interface IChatMessage {
  _id?: Types.ObjectId;
  id: string;
  projectId: Types.ObjectId | string;
  consultantId: Types.ObjectId | string;
  senderRole: ChatSenderRole;
  senderName: string;
  text?: string;
  messageType: ChatMessageType;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaDuration?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  status: ChatMessageStatus;
  readAt: Date | null;
  clientTempId?: string;
  createdAt: Date;

  project?: any;
  consultant?: any;
}

const chatMessageSchema = new Schema<IChatMessage>(
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
    senderRole: {
      type: String,
      enum: ['client', 'consultant'],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    messageType: {
      type: String,
      enum: ['text', 'voice', 'image', 'file'],
      default: 'text',
      index: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaMimeType: {
      type: String,
      default: null,
    },
    mediaDuration: {
      type: Number,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readAt: {
      type: Date,
      default: null,
    },
    clientTempId: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'chat_messages',
    timestamps: false,
  }
);

chatMessageSchema.index({ projectId: 1, createdAt: 1 });
chatMessageSchema.index({ consultantId: 1, senderRole: 1, status: 1 });
chatMessageSchema.index({ projectId: 1, senderRole: 1, status: 1 });

chatMessageSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

chatMessageSchema.virtual('consultant', {
  ref: 'Consultant',
  localField: 'consultantId',
  foreignField: '_id',
  justOne: true,
});

chatMessageSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

chatMessageSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    delete ret.__v;
    return ret;
  },
});

export const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage ||
  mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
