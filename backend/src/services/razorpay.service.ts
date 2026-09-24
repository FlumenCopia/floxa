import Razorpay from 'razorpay';
import crypto from 'crypto';
import { ENV } from '../config/env.js';

let razorpayClient: Razorpay | null = null;
let mockRazorpayClient: any = null;

export function setMockRazorpayClient(client: any) {
  mockRazorpayClient = client;
}

export function getRazorpayClient(): Razorpay {
  if (mockRazorpayClient) {
    return mockRazorpayClient;
  }
  if (!ENV.RAZORPAY_KEY_ID || !ENV.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay configuration is missing.');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: ENV.RAZORPAY_KEY_ID,
      key_secret: ENV.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpayClient;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  isConsultantCustom?: boolean;
}

export function resolveRazorpayCredentials(consultant?: any): RazorpayCredentials {
  const cKeys = consultant?.integrations;
  if (cKeys?.razorpayKeyId && cKeys?.razorpayKeySecret) {
    return {
      keyId: cKeys.razorpayKeyId.trim(),
      keySecret: cKeys.razorpayKeySecret.trim(),
      webhookSecret: cKeys.razorpayWebhookSecret ? cKeys.razorpayWebhookSecret.trim() : '',
      isConsultantCustom: true,
    };
  }

  // If consultant has not configured their own keys in Settings, return empty credentials
  return {
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    isConsultantCustom: false,
  };
}

export function createConsultantRazorpayClient(credentials: RazorpayCredentials): Razorpay {
  if (mockRazorpayClient) {
    return mockRazorpayClient;
  }
  if (!credentials.keyId || !credentials.keySecret) {
    throw new Error('Razorpay configuration is missing.');
  }
  return new Razorpay({
    key_id: credentials.keyId,
    key_secret: credentials.keySecret,
  });
}

export async function createRazorpayOrder(params: {
  amount: number; // in paise
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  credentials?: RazorpayCredentials;
}) {
  const client = params.credentials
    ? createConsultantRazorpayClient(params.credentials)
    : getRazorpayClient();
  const orderApi = (client as any).orders || (client as any).order;
  return orderApi.create({
    amount: Math.round(params.amount),
    currency: params.currency || ENV.RAZORPAY_CURRENCY || 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });
}

export async function fetchRazorpayPayment(paymentId: string, credentials?: RazorpayCredentials) {
  const client = credentials
    ? createConsultantRazorpayClient(credentials)
    : getRazorpayClient();
  const paymentApi = (client as any).payments || (client as any).payment;
  return paymentApi.fetch(paymentId);
}

function safeTimingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPaymentSignatureWithSecret(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  secret: string;
}): boolean {
  if (!params.secret || !params.razorpaySignature) return false;

  const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', params.secret)
    .update(body)
    .digest('hex');

  return safeTimingSafeEqual(expectedSignature, params.razorpaySignature);
}

export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  return verifyPaymentSignatureWithSecret({
    ...params,
    secret: ENV.RAZORPAY_KEY_SECRET,
  });
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  if (!ENV.RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return safeTimingSafeEqual(expectedSignature, signature);
}
