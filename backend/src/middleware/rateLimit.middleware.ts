import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60 * 1000);
cleanupInterval.unref?.();

export function clearRateLimitStore() {
  buckets.clear();
}

export function createRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const {
    keyPrefix,
    windowMs,
    max,
    message = 'Too many requests. Please wait and try again later.',
    keyGenerator,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const clientIp = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const customKey = keyGenerator ? keyGenerator(req) : '';
    const key = `${keyPrefix}:${clientIp}:${customKey}`;

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        detail: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    return next();
  };
}

