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
  consultant_avatar: {
    maxSize: 5 * 1024 * 1024,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
  },
};

export function validateUploadedFile(
  file: Express.Multer.File,
  ruleName: keyof typeof UPLOAD_RULES
) {
  const rule = UPLOAD_RULES[ruleName];
  if (!rule) return;

  if (file.size > rule.maxSize) {
    const err: any = new Error(`File too large. Maximum size is ${rule.maxSize / (1024 * 1024)}MB.`);
    err.statusCode = 413;
    throw err;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!rule.allowedExts.includes(ext)) {
    const err: any = new Error(`Unsupported file type: ${ext}`);
    err.statusCode = 400;
    throw err;
  }
}

export async function validateAndProcessAvatar(
  file: Express.Multer.File
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  if (!file || !file.buffer || file.buffer.length === 0) {
    const err: any = new Error('File is empty.');
    err.statusCode = 400;
    throw err;
  }

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize || file.buffer.length > maxSize) {
    const err: any = new Error('File too large. Maximum size is 5MB.');
    err.statusCode = 413;
    throw err;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  if (!allowedExts.includes(ext)) {
    const err: any = new Error(`Unsupported file type: ${ext || 'unknown'}. Allowed formats: JPG, PNG, WebP.`);
    err.statusCode = 400;
    throw err;
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.mimetype && !allowedMimes.includes(file.mimetype.toLowerCase())) {
    const err: any = new Error(`Unsupported MIME type: ${file.mimetype}. Allowed formats: JPG, PNG, WebP.`);
    err.statusCode = 400;
    throw err;
  }

  // Validate image integrity with Sharp to detect corrupted images
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    const err: any = new Error('Invalid or corrupted image file.');
    err.statusCode = 400;
    throw err;
  }

  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    const err: any = new Error('Invalid image format detected.');
    err.statusCode = 400;
    throw err;
  }

  const { buffer, filename } = await optimizeImageBuffer(file.buffer, file.originalname);
  const contentType =
    metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : 'image/webp';
  return { buffer, filename, contentType };
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

export async function generateWatermarkedImage(
  buffer: Buffer,
  filename: string
): Promise<{ buffer: Buffer; filename: string }> {
  try {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    const wmFilename = `${baseName}_watermarked${ext || '.jpg'}`;

    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 800;

    const diagonal = Math.sqrt(width * width + height * height);
    const patternFontSize = Math.max(22, Math.round(diagonal * 0.026));
    const subFontSize = Math.max(12, Math.round(patternFontSize * 0.52));

    const svgWatermark = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .tiled-text {
            fill: rgba(255, 255, 255, 0.52);
            stroke: rgba(0, 0, 0, 0.55);
            stroke-width: 1.5px;
            paint-order: stroke fill;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: ${patternFontSize}px;
            font-weight: 900;
            letter-spacing: 3.5px;
          }
          .tiled-sub {
            fill: rgba(255, 255, 255, 0.42);
            stroke: rgba(0, 0, 0, 0.48);
            stroke-width: 1.2px;
            paint-order: stroke fill;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: ${subFontSize}px;
            font-weight: 700;
            letter-spacing: 2.2px;
          }
          .lattice-line-light {
            stroke: rgba(255, 255, 255, 0.28);
            stroke-width: 1.2px;
            stroke-dasharray: 10, 4;
          }
          .lattice-line-dark {
            stroke: rgba(0, 0, 0, 0.28);
            stroke-width: 1.2px;
            stroke-dasharray: 10, 4;
          }
        </style>
        <pattern id="wm-pattern" width="240" height="140" patternTransform="rotate(-30 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="240" y2="140" class="lattice-line-light" />
          <line x1="0" y1="140" x2="240" y2="0" class="lattice-line-dark" />
          <text x="15" y="55" class="tiled-text">FLOXA</text>
          <text x="15" y="95" class="tiled-sub">DO NOT COPY</text>
        </pattern>
        <rect width="100%" height="100%" fill="url(#wm-pattern)" />
      </svg>
    `;

    const watermarkedBuffer = await sharp(buffer)
      .rotate()
      .composite([{ input: Buffer.from(svgWatermark), blend: 'over' }])
      .jpeg({ quality: 84 })
      .toBuffer();

    return { buffer: watermarkedBuffer, filename: wmFilename };
  } catch (err) {
    console.error('Failed to generate watermark, falling back to original buffer:', err);
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

export async function deleteStoredFile(storedPath?: string | null): Promise<void> {
  if (!storedPath || typeof storedPath !== 'string') return;
  if (storedPath.startsWith('http')) {
    if (ENV.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(storedPath, { token: ENV.BLOB_READ_WRITE_TOKEN });
      } catch (err) {
        console.warn('Failed to delete blob file:', err);
      }
    }
    return;
  }
  try {
    const safePath = resolveSafeMediaPath(storedPath);
    if (safePath && fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }
  } catch (err) {
    console.warn('Failed to delete local file:', err);
  }
}
