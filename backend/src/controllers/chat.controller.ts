import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ChatMessage, Project, Client } from '../models/index.js';
import type { AuthenticatedRequest } from '../types/express.js';
import type { PortalRequest } from '../middleware/portal.middleware.js';
import { saveFile, validateUploadedFile, getMimeType } from '../services/storage.service.js';
import { isProjectClientOnline } from '../websocket/socketServer.js';

export async function getRecentConversations(req: any, res: Response, next: NextFunction) {
  try {
    const consultantId = req.user?.id;
    if (!consultantId) {
      res.status(401).json({ detail: 'Authentication required' });
      return;
    }

    const projects = await Project.find({
      consultantId,
      isArchived: false,
    }).populate('client');

    const conversations = await Promise.all(
      projects.map(async (p) => {
        const lastMessage = await ChatMessage.findOne({ projectId: p._id })
          .sort({ createdAt: -1 })
          .lean();

        const unreadCount = await ChatMessage.countDocuments({
          projectId: p._id,
          senderRole: 'client',
          status: { $ne: 'read' },
        });

        const clientName = (p.client as any)?.name || p.companyName || 'Client';
        const isOnline = isProjectClientOnline(p.id);
        const lastSeen = p.clientLastSeenAt || lastMessage?.createdAt || p.updatedAt || p.createdAt;

        return {
          projectId: p.id,
          projectTitle: p.title,
          clientName,
          companyName: p.companyName || '',
          portalToken: p.portalToken,
          unreadCount,
          isOnline,
          lastSeen,
          lastMessage: lastMessage
            ? {
                id: lastMessage._id.toString(),
                text: lastMessage.text,
                messageType: lastMessage.messageType || 'text',
                mediaUrl: lastMessage.mediaUrl || null,
                fileName: lastMessage.fileName || null,
                senderRole: lastMessage.senderRole,
                senderName: lastMessage.senderName,
                status: lastMessage.status,
                createdAt: lastMessage.createdAt,
              }
            : null,
          updatedAt: (lastMessage?.createdAt || p.createdAt || new Date()) as Date,
        };
      })
    );

    // Sort by latest message/update time descending
    conversations.sort((a, b) => {
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json({ conversations });
  } catch (err) {
    next(err);
  }
}

export async function getProjectMessages(req: any, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id;
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ detail: 'Invalid project ID' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 200);

    const messages = await ChatMessage.find({ projectId })
      .sort({ createdAt: 1 })
      .limit(limit);

    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function markProjectMessagesRead(req: any, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id;
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ detail: 'Invalid project ID' });
      return;
    }

    const now = new Date();
    await ChatMessage.updateMany(
      {
        projectId,
        senderRole: 'client',
        status: { $ne: 'read' },
      },
      {
        $set: { status: 'read', readAt: now },
      }
    );

    res.json({ success: true, readAt: now });
  } catch (err) {
    next(err);
  }
}

export async function getPortalMessages(req: any, res: Response, next: NextFunction) {
  try {
    const project = req.project;
    if (!project) {
      res.status(404).json({ detail: 'Project not found' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 200);

    const messages = await ChatMessage.find({ projectId: project.id })
      .sort({ createdAt: 1 })
      .limit(limit);

    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function markPortalMessagesRead(req: any, res: Response, next: NextFunction) {
  try {
    const project = req.project;
    if (!project) {
      res.status(404).json({ detail: 'Project not found' });
      return;
    }

    const now = new Date();
    Project.updateOne({ _id: project.id }, { $set: { clientLastSeenAt: now } }).catch(() => {});
    await ChatMessage.updateMany(
      {
        projectId: project.id,
        senderRole: 'consultant',
        status: { $ne: 'read' },
      },
      {
        $set: { status: 'read', readAt: now },
      }
    );

    res.json({ success: true, readAt: now });
  } catch (err) {
    next(err);
  }
}

export async function uploadProjectAttachment(req: any, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ detail: 'No file uploaded' });
      return;
    }

    validateUploadedFile(file, 'chat_attachment');

    const mime = file.mimetype || getMimeType(file.originalname);
    const mediaUrl = await saveFile('chat_attachments', file.originalname, file.buffer, mime);

    let messageType: 'voice' | 'image' | 'file' = 'file';
    if (mime.startsWith('audio/') || file.originalname.match(/\.(webm|ogg|mp3|wav|m4a)$/i)) {
      messageType = 'voice';
    } else if (mime.startsWith('image/') || file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      messageType = 'image';
    }

    const duration = req.body.duration ? Number(req.body.duration) : null;

    res.json({
      mediaUrl,
      mediaMimeType: mime,
      fileName: file.originalname,
      fileSize: file.size,
      messageType,
      mediaDuration: duration,
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadPortalAttachment(req: any, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ detail: 'No file uploaded' });
      return;
    }

    validateUploadedFile(file, 'chat_attachment');

    const mime = file.mimetype || getMimeType(file.originalname);
    const mediaUrl = await saveFile('chat_attachments', file.originalname, file.buffer, mime);

    let messageType: 'voice' | 'image' | 'file' = 'file';
    if (mime.startsWith('audio/') || file.originalname.match(/\.(webm|ogg|mp3|wav|m4a)$/i)) {
      messageType = 'voice';
    } else if (mime.startsWith('image/') || file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      messageType = 'image';
    }

    const duration = req.body.duration ? Number(req.body.duration) : null;

    res.json({
      mediaUrl,
      mediaMimeType: mime,
      fileName: file.originalname,
      fileSize: file.size,
      messageType,
      mediaDuration: duration,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendProjectMessageFallback(req: any, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id;
    const text = String(req.body.text || '').trim();
    const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl) : null;
    const messageType = ['text', 'voice', 'image', 'file'].includes(req.body.messageType)
      ? req.body.messageType
      : (mediaUrl ? 'file' : 'text');

    if (!text && !mediaUrl) {
      res.status(400).json({ detail: 'Message text or attachment is required' });
      return;
    }

    const msg = await ChatMessage.create({
      projectId,
      consultantId: req.user.id,
      senderRole: 'consultant',
      senderName: req.user.name || 'Consultant',
      text,
      messageType,
      mediaUrl,
      mediaMimeType: req.body.mediaMimeType || null,
      mediaDuration: req.body.mediaDuration ? Number(req.body.mediaDuration) : null,
      fileName: req.body.fileName || null,
      fileSize: req.body.fileSize ? Number(req.body.fileSize) : null,
      status: 'sent',
      clientTempId: req.body.clientTempId || null,
      createdAt: new Date(),
    });

    res.status(201).json({ message: msg });
  } catch (err) {
    next(err);
  }
}

export async function sendPortalMessageFallback(req: any, res: Response, next: NextFunction) {
  try {
    const project = req.project;
    const text = String(req.body.text || '').trim();
    const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl) : null;
    const messageType = ['text', 'voice', 'image', 'file'].includes(req.body.messageType)
      ? req.body.messageType
      : (mediaUrl ? 'file' : 'text');

    if (!text && !mediaUrl) {
      res.status(400).json({ detail: 'Message text or attachment is required' });
      return;
    }

    const clientName = (project.client as any)?.name || project.companyName || 'Client';
    Project.updateOne({ _id: project.id }, { $set: { clientLastSeenAt: new Date() } }).catch(() => {});

    const msg = await ChatMessage.create({
      projectId: project.id,
      consultantId: project.consultantId,
      senderRole: 'client',
      senderName: clientName,
      text,
      messageType,
      mediaUrl,
      mediaMimeType: req.body.mediaMimeType || null,
      mediaDuration: req.body.mediaDuration ? Number(req.body.mediaDuration) : null,
      fileName: req.body.fileName || null,
      fileSize: req.body.fileSize ? Number(req.body.fileSize) : null,
      status: 'sent',
      clientTempId: req.body.clientTempId || null,
      createdAt: new Date(),
    });

    res.status(201).json({ message: msg });
  } catch (err) {
    next(err);
  }
}
