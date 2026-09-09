import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { put, del } from '@vercel/blob';
import { ENV } from '../config/env.js';

export const UPLOAD_RULES = {
  moodboard_image: {
    maxSize: 4 * 1024 * 1024,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  concept_image: {
    maxSize: 5 * 1024 * 1024,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  concept_file: {
    maxSize: 10 * 1024 * 1024,
    allowedExts: ['.doc', '.docx', '.jpg', '.jpeg', '.pdf', '.png', '.ppt', '.pptx', '.webp', '.zip'],
  },
  agreement_file: {
    maxSize: 5 * 1024 * 1024,
    allowedExts: ['.pdf'],
  },
  deliverable_file: {
    maxSize: 20 * 1024 * 1024,
    allowedExts: ['.doc', '.docx', '.jpg', '.jpeg', '.pdf', '.png', '.ppt', '.pptx', '.webp', '.zip'],
  },
};

export function validateUploadedFile(
  file: Express.Multer.File,
  ruleName: keyof typeof UPLOAD_RULES
) {
  const rule = UPLOAD_RULES[ruleName];
  if (!rule) return;

  if (file.size > rule.maxSize) {
    throw new Error(`File too large. Maximum size is ${rule.maxSize / (1024 * 1024)}MB.`);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!rule.allowedExts.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

export async function optimizeImageBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ buffer: Buffer; filename: string }> {
  try {
    const ext = path.extname(filename).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return { buffer, filename };
    }

    let pipeline = sharp(buffer).rotate(); // auto-orient based on EXIF
    const metadata = await pipeline.metadata();

    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > 1600 || metadata.height > 1600)
    ) {
      pipeline = pipeline.resize(1600, 1600, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let optimizedBuffer: Buffer;
    if (ext === '.png') {
      optimizedBuffer = await pipeline.png({ quality: 82 }).toBuffer();
    } else if (ext === '.webp') {
      optimizedBuffer = await pipeline.webp({ quality: 82 }).toBuffer();
    } else {
      optimizedBuffer = await pipeline.jpeg({ quality: 82 }).toBuffer();
    }

    return { buffer: optimizedBuffer, filename };
  } catch (err) {
    // If sharp fails to parse image, return original
    return { buffer, filename };
  }
}

export async function saveFile(
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  const cleanName = `${Date.now()}_${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const relativePath = `${folder}/${cleanName}`.replace(/^\/+/, '');

  // 1. If Vercel Blob token is provided, upload to Vercel Blob
  if (ENV.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(relativePath, buffer, {
        access: 'public',
        token: ENV.BLOB_READ_WRITE_TOKEN,
        contentType: contentType || 'application/octet-stream',
      });
      return blob.url;
    } catch (err) {
      console.warn('Vercel Blob upload failed, falling back to local file system:', err);
    }
  }

  // 2. Local media file storage fallback
  const targetDir = path.join(ENV.MEDIA_ROOT, folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, cleanName);
  fs.writeFileSync(targetPath, buffer);

  return `/media/${relativePath}`;
}

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export function resolveSafeMediaPath(storedPath: string): string | null {
  if (!storedPath || typeof storedPath !== 'string') return null;

  try {
    const decoded = decodeURIComponent(storedPath);
    // Strip leading /media/, media/, /
    const cleaned = decoded.replace(/^\/?(media\/)?/, '');
    const normalized = path.normalize(cleaned);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return null;
    }

    const candidatePath = path.resolve(ENV.MEDIA_ROOT, normalized);
    if (!fs.existsSync(candidatePath)) {
      return null;
    }

    const mediaRootReal = fs.existsSync(ENV.MEDIA_ROOT)
      ? fs.realpathSync(ENV.MEDIA_ROOT)
      : path.resolve(ENV.MEDIA_ROOT);
    const candidateReal = fs.realpathSync(candidatePath);
    const relativeToRoot = path.relative(mediaRootReal, candidateReal);

    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      return null;
    }

    const stat = fs.statSync(candidateReal);
    if (!stat.isFile()) {
      return null;
    }

    return candidateReal;
  } catch {
    return null;
  }
}

export function streamLocalFile(
  filePath: string,
  res: any,
  options: {
    filename?: string;
    isAttachment?: boolean;
    contentType?: string;
  } = {}
) {
  try {
    const rawFilename = options.filename || path.basename(filePath);
    const cleanFilename = rawFilename.replace(/[^\w\.\-\_]/g, '_');
    const contentType = options.contentType || getMimeType(filePath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (options.isAttachment) {
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${cleanFilename}"`);
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ detail: 'File streaming error.' });
      }
    });

    stream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ detail: 'Error preparing file stream.' });
    }
  }
}
