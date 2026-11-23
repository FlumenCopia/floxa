import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { ENV } from '../config/env.js';
import { SubscriptionPlan, type ISubscriptionPlan } from '../models/subscriptionPlan.model.js';
import { SubscriptionTransaction } from '../models/subscriptionTransaction.model.js';
import { Consultant } from '../models/consultant.model.js';
import {
  ensureDefaultSubscriptionPlans,
  getConsultantSubscriptionDetails,
} from '../services/subscription.service.js';
import { getRazorpayClient } from '../services/razorpay.service.js';
import type { AuthenticatedRequest } from '../types/express.js';

/**
 * Public catalog of available subscription tiers.
 */
export async function getPublicPlans(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDefaultSubscriptionPlans();
    const plans = await SubscriptionPlan.find({ isActive: true, isPublic: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    res.json(plans.map((p: any) => ({ ...p, id: p._id.toString() })));
  } catch (err) {
    next(err);
  }
}

/**
 * Get current consultant's subscription status, quota usage, and limits.
 */
export async function getMySubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const details = await getConsultantSubscriptionDetails(req.user.id);
    if (!details) {
      res.status(404).json({ detail: 'Consultant subscription profile not found.' });
      return;
    }

    res.json(details);
  } catch (err) {
    next(err);
  }
}

/**
 * Create a Razorpay Order for renewing or upgrading subscription.
 */
export async function createSubscriptionOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const body = req.body || {};
    const planSlug = String(body.planSlug || '').trim().toLowerCase();
    const rawCycle = String(body.billingCycle || 'monthly').trim().toLowerCase();

    if (!planSlug) {
      res.status(400).json({ detail: 'Plan slug is required.' });
      return;
    }

    const validCycles: ('monthly' | 'semi_annual' | 'yearly')[] = ['monthly', 'semi_annual', 'yearly'];
    if (!validCycles.includes(rawCycle as any)) {
      res.status(400).json({ detail: `Invalid billing cycle. Must be one of: ${validCycles.join(', ')}` });
      return;
    }
    const billingCycle = rawCycle as 'monthly' | 'semi_annual' | 'yearly';

    const plan = await SubscriptionPlan.findOne({ slug: planSlug, isActive: true });
    if (!plan) {
      res.status(404).json({ detail: 'Selected subscription plan is not available.' });
      return;
    }

    // Determine price based on chosen cycle
    let amount = 0;
    if (billingCycle === 'monthly') {
      amount = plan.pricing.monthly?.price ?? 0;
    } else if (billingCycle === 'semi_annual') {
      amount = plan.pricing.semiAnnual?.price ?? Math.round((plan.pricing.monthly?.price || 0) * 6 * 0.85);
    } else if (billingCycle === 'yearly') {
      amount = plan.pricing.yearly?.price ?? Math.round((plan.pricing.monthly?.price || 0) * 12 * 0.70);
    }

    // If Free Tier, switch immediately without payment gateway
    if (amount <= 0) {
      const consultant = await Consultant.findById(req.user.id);
      if (consultant) {
        if (!consultant.subscription) {
          consultant.subscription = {};
        }
        consultant.subscription.plan = plan.slug;
        consultant.subscription.planId = plan._id;
        consultant.subscription.billingCycle = billingCycle;
        consultant.subscription.status = 'active';
        consultant.subscription.maxProjects = plan.limits.maxProjects;
        consultant.subscription.maxClients = plan.limits.maxClients;
        consultant.subscription.currentPeriodStart = new Date();
        consultant.subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        consultant.subscription.gracePeriodEnd = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);

        consultant.markModified('subscription');
        await consultant.save();
      }

      res.json({
        freeSwitched: true,
        message: `Successfully switched to ${plan.name} plan.`,
        plan: plan.slug,
      });
      return;
    }

    // Amount in Razorpay is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(amount * 100);
    const razorpay = getRazorpayClient();

    const orderOptions = {
      amount: amountInPaise,
      currency: plan.pricing.currency || 'INR',
      receipt: `sub_${req.user.id.slice(-6)}_${Date.now()}`,
      notes: {
        consultantId: req.user.id,
        planSlug: plan.slug,
        planName: plan.name,
        billingCycle,
      },
    };

    const order: any = await (razorpay.orders as any).create(orderOptions);

    res.json({
      orderId: order.id,
      amount: amount,
      amountPaise: amountInPaise,
      currency: plan.pricing.currency || 'INR',
      keyId: ENV.RAZORPAY_KEY_ID,
      planSlug: plan.slug,
      planName: plan.name,
      billingCycle,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to initiate subscription order.', error: err.message });
  }
}

/**
 * Verify Razorpay payment and activate/renew subscription.
 */
export async function verifySubscriptionPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planSlug: rawSlug,
      billingCycle: rawCycle = 'monthly',
    } = req.body || {};

    const planSlug = String(rawSlug || '').trim().toLowerCase();
    const rawCycleStr = String(rawCycle || 'monthly');
    const billingCycle = (['monthly', 'semi_annual', 'yearly'].includes(rawCycleStr) ? rawCycleStr : 'monthly') as 'monthly' | 'semi_annual' | 'yearly';

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planSlug) {
      res.status(400).json({ detail: 'Missing required payment verification details.' });
      return;
    }

    // Verify HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      res.status(400).json({ detail: 'Invalid payment signature. Verification failed.' });
      return;
    }

    const plan = await SubscriptionPlan.findOne({ slug: planSlug });
    if (!plan) {
      res.status(404).json({ detail: 'Subscription plan not found.' });
      return;
    }

    const consultant = await Consultant.findById(req.user.id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant not found.' });
      return;
    }

    // Calculate duration in days based on chosen cycle
    let durationDays = 30;
    let expectedAmount = plan.pricing.monthly?.price || 0;
    if (billingCycle === 'semi_annual') {
      durationDays = 180;
      expectedAmount = plan.pricing.semiAnnual?.price || Math.round((plan.pricing.monthly?.price || 0) * 6 * 0.85);
    } else if (billingCycle === 'yearly') {
      durationDays = 365;
      expectedAmount = plan.pricing.yearly?.price || Math.round((plan.pricing.monthly?.price || 0) * 12 * 0.70);
    }

    const now = new Date();
    // If the consultant's subscription is currently active and unexpired, extend FROM existing expiry!
    const existingEnd = consultant.subscription?.currentPeriodEnd
      ? new Date(consultant.subscription.currentPeriodEnd)
      : null;

    const baseDate = existingEnd && existingEnd > now ? existingEnd : now;
    const newPeriodEnd = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const newGraceEnd = new Date(newPeriodEnd.getTime() + 5 * 24 * 60 * 60 * 1000);

    if (!consultant.subscription) {
      consultant.subscription = {};
    }

    consultant.subscription.planId = plan._id;
    consultant.subscription.plan = plan.slug;
    consultant.subscription.billingCycle = billingCycle;
    consultant.subscription.status = 'active';
    consultant.subscription.currentPeriodStart = now;
    consultant.subscription.currentPeriodEnd = newPeriodEnd;
    consultant.subscription.gracePeriodEnd = newGraceEnd;
    consultant.subscription.maxProjects = plan.limits.maxProjects;
    consultant.subscription.maxClients = plan.limits.maxClients;
    consultant.subscription.lastPaymentId = String(razorpay_payment_id);

    consultant.markModified('subscription');
    await consultant.save();

    // Create Subscription Transaction record for invoice
    const invoiceNumber = `INV-FLX-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    await SubscriptionTransaction.create({
      consultantId: consultant._id,
      planId: plan._id,
      planSlug: plan.slug,
      billingCycle,
      amount: expectedAmount,
      currency: plan.pricing.currency || 'INR',
      paymentGateway: 'razorpay',
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
      razorpaySignature: String(razorpay_signature),
      status: 'success',
      periodStart: baseDate,
      periodEnd: newPeriodEnd,
      invoiceNumber,
    });

    res.json({
      success: true,
      message: `Your ${plan.name} subscription has been renewed successfully until ${newPeriodEnd.toLocaleDateString()}.`,
      subscription: consultant.subscription,
      invoiceNumber,
    });
  } catch (err: any) {
    res.status(500).json({ detail: 'Failed to verify subscription payment.', error: err.message });
  }
}

/**
 * Get consultant's payment & invoice history.
 */
export async function getSubscriptionInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const transactions = await SubscriptionTransaction.find({
      consultantId: req.user.id,
      status: 'success',
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(transactions.map((t: any) => ({ ...t, id: t._id.toString() })));
  } catch (err) {
    next(err);
  }
}
