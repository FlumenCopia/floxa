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
 *   v0 (legacy compatible): portalToken:timestamp_b62:signature
 *   vN (N > 0):             portalToken:vN:timestamp_b62:signature
 * The HMAC-SHA256 signature cryptographically binds both portalToken and sessionVersion.
 */
export function signPortalAccessToken(portalToken: string, sessionVersion: number = 0): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeB62 = intToBase62(timestamp);
  const safeVersion = Number.isInteger(sessionVersion) && sessionVersion > 0 ? sessionVersion : 0;
  const payload = safeVersion > 0 ? `${portalToken}:v${safeVersion}` : portalToken;
  const base = `${payload}:${timeB62}`;

  const key = getDjangoHmacKey(ENV.PORTAL_ACCESS_SALT, ENV.SECRET_KEY);
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(base);
  // Django uses URL-safe base64 without padding for signatures
  const sig = hmac.digest('base64url');

  return `${base}:${sig}`;
}

export interface ParsedPortalAccessToken {
  portalToken: string;
  version: number;
}

/**
 * Verifies HMAC signature & expiration of a signed portal access token and returns
 * its bound portalToken and session version (legacy unversioned tokens resolve to version 0).
 */
export function parsePortalAccessToken(
  signedToken: string,
  maxAgeSeconds: number = ENV.PORTAL_ACCESS_MAX_AGE
): ParsedPortalAccessToken | null {
  if (!signedToken || typeof signedToken !== 'string') return null;

  const parts = signedToken.split(':');
  if (parts.length < 3) return null;

  const rawPayload = parts.slice(0, parts.length - 2).join(':');
  const timeB62 = parts[parts.length - 2];
  const signature = parts[parts.length - 1];

  const base = `${rawPayload}:${timeB62}`;
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

  const versionMatch = rawPayload.match(/^(.*):v(\d+)$/);
  if (versionMatch) {
    const version = parseInt(versionMatch[2], 10);
    if (!Number.isInteger(version) || version < 0) return null;
    return { portalToken: versionMatch[1], version };
  }

  return { portalToken: rawPayload, version: 0 };
}

/**
 * Verifies a signed portal access token, checking HMAC signature, expiration,
 * and (when provided) exact session version match.
 */
export function unsignPortalAccessToken(
  signedToken: string,
  maxAgeSeconds: number = ENV.PORTAL_ACCESS_MAX_AGE,
  expectedVersion?: number
): string | null {
  const parsed = parsePortalAccessToken(signedToken, maxAgeSeconds);
  if (!parsed) return null;

  if (expectedVersion !== undefined) {
    const targetVersion = Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : 0;
    if (parsed.version !== targetVersion) return null;
  }

  return parsed.portalToken;
}

/**
 * Shared verifier used across all HTTP, media, device-token, and WebSocket checks.
 * Enforces HMAC validity, expiration, exact portalToken match, and exact session version match.
 */
export function verifyPortalAccessTokenForProject(
  signedToken: string,
  expectedPortalToken: string,
  expectedVersion: number = 0,
  maxAgeSeconds: number = ENV.PORTAL_ACCESS_MAX_AGE
): boolean {
  if (!signedToken || !expectedPortalToken) return false;
  const parsed = parsePortalAccessToken(signedToken, maxAgeSeconds);
  if (!parsed) return false;
  const targetVersion = Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion : 0;
  return parsed.portalToken === expectedPortalToken && parsed.version === targetVersion;
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

const ENC_PREFIX = 'enc:v1:';

function getSecretsEncryptionKey(): Buffer {
  if (ENV.SECRETS_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(ENV.SECRETS_ENCRYPTION_KEY).digest();
  }
  return crypto.createHash('sha256').update(`floxa-secrets-v1:${ENV.SECRET_KEY}`).digest();
}

export function encryptSecret(plainText?: string | null): string {
  const raw = typeof plainText === 'string' ? plainText.trim() : '';
  if (!raw) return '';
  if (raw.startsWith(ENC_PREFIX)) return raw;

  const key = getSecretsEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored?: string | null): string {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (!raw) return '';
  if (!raw.startsWith(ENC_PREFIX)) return raw;

  const payload = raw.slice(ENC_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) return '';

  try {
    const [ivHex, tagHex, dataHex] = parts;
    const key = getSecretsEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(stored?: string | null): string {
  const plain = decryptSecret(stored);
  if (!plain) return '';
  const suffix = plain.length > 4 ? plain.slice(-4) : '';
  return `••••••••${suffix}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
