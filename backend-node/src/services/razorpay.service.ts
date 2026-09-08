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

export async function createRazorpayOrder(params: {
  amount: number; // in paise
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const client = getRazorpayClient();
  const orderApi = (client as any).orders || (client as any).order;
  return orderApi.create({
    amount: Math.round(params.amount),
    currency: params.currency || ENV.RAZORPAY_CURRENCY || 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });
}

export async function fetchRazorpayPayment(paymentId: string) {
  const client = getRazorpayClient();
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

export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  if (!ENV.RAZORPAY_KEY_SECRET || !params.razorpaySignature) return false;

  const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return safeTimingSafeEqual(expectedSignature, params.razorpaySignature);
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  if (!ENV.RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return safeTimingSafeEqual(expectedSignature, signature);
}
