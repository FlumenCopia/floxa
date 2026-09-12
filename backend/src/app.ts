import express from 'express';
import type http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { ENV } from './config/env.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import routes from './routes/index.js';

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

// 3. Static Media Files (Strictly restricted: only public directories allowed, symlinks and private paths blocked)
const ALLOWED_PUBLIC_MEDIA_DIRS = ['consultant_avatars', 'public', 'chat_attachments'];

app.use('/media', (req, res) => {
  try {
    const decodedPath = decodeURIComponent(req.path);
    const normalized = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    const topFolder = segments[0];

    // Default to private: if topFolder is not explicitly allowed, block direct static access
    if (!topFolder || !ALLOWED_PUBLIC_MEDIA_DIRS.includes(topFolder)) {
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

    // Verify real file is inside an allowed public folder
    const realSegments = relativeToRoot.split(/[\\/]/).filter(Boolean);
    const realTopFolder = realSegments[0];
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
