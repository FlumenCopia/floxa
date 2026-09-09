import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.js';

// Base62 alphabet used by Django TimestampSigner
const B62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function intToBase62(num: number): string {
  if (num === 0) return '0';
  let s = '';
  while (num > 0) {
    s = B62_CHARS[num % 62] + s;
    num = Math.floor(num / 62);
  }
  return s;
}

function base62ToInt(s: string): number {
  let num = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = B62_CHARS.indexOf(s[i]);
    if (idx === -1) return NaN;
    num = num * 62 + idx;
  }
  return num;
}

/**
 * Derives a key in the exact same manner as Django's salted_hmac.
 * Django does: key = sha256(salt + secret_key).digest()
 */
function getDjangoHmacKey(salt: string, secretKey: string): Buffer {
  return crypto.createHash('sha256').update(salt + secretKey).digest();
}

/**
 * Generates a signed token matching Django's TimestampSigner format:
 *   value:timestamp_b62:signature
 */
export function signPortalAccessToken(portalToken: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeB62 = intToBase62(timestamp);
  const base = `${portalToken}:${timeB62}`;

  const key = getDjangoHmacKey(ENV.PORTAL_ACCESS_SALT, ENV.SECRET_KEY);
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(base);
  // Django uses URL-safe base64 without padding for signatures
  const sig = hmac.digest('base64url');

  return `${base}:${sig}`;
}

/**
 * Verifies a signed portal access token, checking HMAC signature and expiration.
 */
export function unsignPortalAccessToken(
  signedToken: string,
  maxAgeSeconds: number = ENV.PORTAL_ACCESS_MAX_AGE
): string | null {
  if (!signedToken || typeof signedToken !== 'string') return null;

  const parts = signedToken.split(':');
  if (parts.length < 3) return null;

  const portalToken = parts.slice(0, parts.length - 2).join(':');
  const timeB62 = parts[parts.length - 2];
  const signature = parts[parts.length - 1];

  const base = `${portalToken}:${timeB62}`;
  const key = getDjangoHmacKey(ENV.PORTAL_ACCESS_SALT, ENV.SECRET_KEY);
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(base);
  const expectedSig = hmac.digest('base64url');

  // Constant-time signature comparison
  if (signature.length !== expectedSig.length) return null;
  try {
    const match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!match) return null;
  } catch {
    return null;
  }

  // Verify timestamp
  const timestamp = base62ToInt(timeB62);
  if (isNaN(timestamp)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > maxAgeSeconds || timestamp > now + 300) {
    // Expired or from far future
    return null;
  }

  return portalToken;
}

/**
 * Password hashing using bcryptjs.
 * Also supports checking Django's pbkdf2_sha256 passwords during data migration.
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, passwordHash: string): Promise<boolean> {
  if (!passwordHash || !plainText) return false;

  // 1. If standard bcrypt hash ($2a$, $2b$, $2y$)
  if (passwordHash.startsWith('$2')) {
    return bcrypt.compare(plainText, passwordHash);
  }

  // 2. If Django pbkdf2_sha256 hash (pbkdf2_sha256$iterations$salt$hash)
  if (passwordHash.startsWith('pbkdf2_sha256$')) {
    const parts = passwordHash.split('$');
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const expectedHash = parts[3];

      const derivedKey = crypto.pbkdf2Sync(
        plainText,
        salt,
        iterations,
        32,
        'sha256'
      );
      const computedHash = derivedKey.toString('base64');
      return computedHash === expectedHash;
    }
  }

  return false;
}
