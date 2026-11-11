import express from 'express';
import type http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { ENV } from './config/env.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import routes from './routes/index.js';
import { resolveAuthenticatedConsultant } from './services/auth.service.js';
import { unsignPortalAccessToken } from './utils/crypto.js';
import { ChatMessage } from './models/chatMessage.model.js';
import { Project } from './models/project.model.js';

export const app = express();

const TRUSTED_CORS_ORIGINS = new Set(
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://floxa.flumenx.in',
    ...ENV.CORS_ALLOWED_ORIGINS,
    ...(ENV.FRONTEND_BASE_URL ? [ENV.FRONTEND_BASE_URL] : []),
  ]
    .map((o) => (o ? o.trim().replace(/\/+$/, '') : ''))
    .filter(Boolean)
);

// 1. CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const cleanOrigin = origin.trim().replace(/\/+$/, '');
      if (TRUSTED_CORS_ORIGINS.has(cleanOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-csrftoken',
      'x-csrf-token',
      'x-client-portal-token',
      'x-portal-access-token',
      'x-support-mode',
      'x-consultant-support',
      'x-razorpay-signature',
    ],
  })
);

// 2. Body Parsing (Capture raw body for Razorpay webhook signature verification)
app.use(
  express.json({
    limit: '25mb',
    verify: (req: http.IncomingMessage & { rawBody?: Buffer }, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// 3. Static Media Files (Strictly restricted: only public directories allowed without auth; chat_attachments gated)
const ALLOWED_PUBLIC_MEDIA_DIRS = ['consultant_avatars', 'public'];

app.use('/media', async (req, res) => {
  try {
    const decodedPath = decodeURIComponent(req.path);
    const normalized = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    const topFolder = segments[0];

    const isChatAttachment = topFolder === 'chat_attachments';

    // Default to private: only explicitly public dirs or authenticated chat_attachments allowed
    if (!topFolder || (!ALLOWED_PUBLIC_MEDIA_DIRS.includes(topFolder) && !isChatAttachment)) {
      res.status(403).json({ detail: 'Direct access to private media files is restricted.' });
      return;
    }

    const candidatePath = path.resolve(ENV.MEDIA_ROOT, ...segments);
    if (!fs.existsSync(candidatePath)) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    const mediaRootReal = fs.existsSync(ENV.MEDIA_ROOT)
      ? fs.realpathSync(ENV.MEDIA_ROOT)
      : path.resolve(ENV.MEDIA_ROOT);
    const candidateReal = fs.realpathSync(candidatePath);
    const relativeToRoot = path.relative(mediaRootReal, candidateReal);

    // Reject escaping root
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      res.status(403).json({ detail: 'Direct access to private media files is restricted.' });
      return;
    }

    const realSegments = relativeToRoot.split(/[\\/]/).filter(Boolean);
    const realTopFolder = realSegments[0];

    if (realTopFolder === 'chat_attachments') {
      const canonicalMediaUrl = `/media/${realSegments.join('/')}`;
      const chatMsg = await ChatMessage.findOne({
        mediaUrl: { $in: [canonicalMediaUrl, canonicalMediaUrl.slice(1), realSegments.join('/')] },
      }).lean();

      const folderProjectId =
        realSegments.length >= 3 && mongoose.Types.ObjectId.isValid(realSegments[1])
          ? realSegments[1]
          : null;

      const targetProjectId = chatMsg?.projectId || folderProjectId;
      if (!targetProjectId) {
        res.status(403).json({ detail: 'Chat attachment access denied.' });
        return;
      }

      const project = await Project.findById(targetProjectId)
        .select('consultantId portalToken portalPasswordHash isArchived')
        .lean();

      if (!project || project.isArchived) {
        res.status(403).json({ detail: 'Chat attachment access denied.' });
        return;
      }

      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : '';
      const cookieJwt = req.cookies?.[ENV.AUTH_ACCESS_COOKIE_NAME] || '';
      const consultantToken = bearerToken || (!bearerToken ? cookieJwt : '');

      let authorized = false;

      if (consultantToken) {
        const { user } = await resolveAuthenticatedConsultant(consultantToken);
        if (user && String(project.consultantId) === String(user._id)) {
          authorized = true;
        }
      }

      if (!authorized) {
        const signedAccess =
          (req.headers['x-portal-access-token'] as string) ||
          req.cookies?.[ENV.PORTAL_ACCESS_COOKIE_NAME] ||
          '';
        const verifiedPortal = signedAccess
          ? unsignPortalAccessToken(signedAccess, ENV.PORTAL_ACCESS_MAX_AGE)
          : null;

        if (verifiedPortal && verifiedPortal === project.portalToken) {
          authorized = true;
        } else if (!project.portalPasswordHash) {
          const headerPortal = (req.headers['x-client-portal-token'] as string) || '';
          if (headerPortal && headerPortal.trim() === project.portalToken) {
            authorized = true;
          }
        }
      }

      if (!authorized) {
        res.status(403).json({ detail: 'Authentication required to access chat attachment.' });
        return;
      }

      const stat = fs.statSync(candidateReal);
      if (!stat.isFile()) {
        res.status(404).json({ detail: 'File not found.' });
        return;
      }

      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(candidateReal);
      return;
    }

    // Verify real file is inside an allowed public folder
    if (!realTopFolder || !ALLOWED_PUBLIC_MEDIA_DIRS.includes(realTopFolder)) {
      res.status(403).json({ detail: 'Direct access to private media files is restricted.' });
      return;
    }

    const stat = fs.statSync(candidateReal);
    if (!stat.isFile()) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    res.sendFile(candidateReal);
  } catch {
    res.status(403).json({ detail: 'Direct access to private media files is restricted.' });
  }
});

// 4. CSRF Protection
app.use(csrfProtection);

// 5. Mount API Routes
app.use('/api', routes);

// 6. Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'floxa-backend-node', database: 'mongodb' });
});

// 7. Global Error Handler
app.use(errorHandler);
