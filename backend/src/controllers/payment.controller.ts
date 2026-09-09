import { Request, Response, NextFunction } from 'express';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { PaymentTransaction } from '../models/paymentTransaction.model.js';
import { RazorpayWebhookEvent } from '../models/razorpayWebhookEvent.model.js';
import { Project } from '../models/project.model.js';
import { recalculatePaymentMilestones, logProjectActivity } from '../services/project.service.js';
import { completePaymentMilestone, PaymentCompletionError } from '../services/payment.service.js';
import { verifyWebhookSignature } from '../services/razorpay.service.js';
import { serializePaymentMilestone } from '../utils/serializer.js';
import { ENV } from '../config/env.js';

export async function getMilestones(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const milestones = await PaymentMilestone.find({ projectId: id });

    const order: Record<string, number> = { advance: 1, mid: 2, final: 3 };
    milestones.sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99));

    res.json(milestones.map(serializePaymentMilestone));
  } catch (err) {
    next(err);
  }
}

export async function createMilestones(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const val = project.projectValue || 0;
    const defaults = [
      { type: 'advance' as const, pct: project.advancePercentage, status: 'ready' as const },
      { type: 'mid' as const, pct: project.midPercentage, status: 'locked' as const },
      { type: 'final' as const, pct: project.finalPercentage, status: 'locked' as const },
    ];

    for (const item of defaults) {
      const amount = (val * item.pct) / 100;
      await PaymentMilestone.findOneAndUpdate(
        { projectId: id, type: item.type },
        {
          $set: {
            percentage: item.pct,
            amount,
          },
          $setOnInsert: {
            projectId: id,
            type: item.type,
            status: item.status,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await recalculatePaymentMilestones(id);
    return getMilestones(req, res, next);
  } catch (err) {
    next(err);
  }
}

export async function requestMilestone(
  req: Request<{ id: string; milestone_id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, milestone_id } = req.params;
    const milestone = await PaymentMilestone.findOne({ _id: milestone_id, projectId: id }).populate({
      path: 'project',
      populate: { path: 'projectAgreement' },
    });

    if (!milestone) {
      res.status(404).json({ detail: 'Milestone not found.' });
      return;
    }

    if (milestone.status !== 'ready') {
      res.status(400).json({ detail: 'Only ready milestones can be requested.' });
      return;
    }

    if (milestone.type === 'advance') {
      const isSigned =
        milestone.project?.projectAgreement?.signedAt &&
        ['signed', 'active', 'completed'].includes(milestone.project.projectAgreement.status);
      if (!isSigned) {
        res.status(400).json({ detail: 'The project agreement must be signed before requesting advance payment.' });
        return;
      }
    }

    const updated = await PaymentMilestone.findByIdAndUpdate(
      milestone_id,
      {
        $set: {
          status: 'requested',
          requestedAt: new Date(),
        },
      },
      { new: true }
    );

    const consultantId =
      milestone.project?.consultantId?.toString() || milestone.project?.consultantId;

    await logProjectActivity({
      projectId: id,
      consultantId,
      actorType: 'consultant',
      action: 'payment_requested',
      description: `${milestone.type.toUpperCase()} payment has been requested.`,
      metadata: { payment_milestone_id: milestone.id, payment_type: milestone.type },
      visibleToClient: true,
    });

    res.json(serializePaymentMilestone(updated));
  } catch (err) {
    next(err);
  }
}

export async function markMilestonePaid(
  req: Request<{ id: string; milestone_id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, milestone_id } = req.params;
    let completionResult;
    try {
      completionResult = await completePaymentMilestone({
        projectId: id,
        milestoneId: milestone_id,
        actorType: 'consultant',
        paymentSource: 'manual',
      });
    } catch (err: any) {
      if (err instanceof PaymentCompletionError) {
        res.status(err.statusCode || 400).json({ detail: err.message });
        return;
      }
      throw err;
    }

    res.json(serializePaymentMilestone(completionResult.milestone));
  } catch (err) {
    next(err);
  }
}

export async function handleRazorpayWebhook(
  req: Request & { rawBody?: Buffer | string },
  res: Response
) {
  const signature = ((req.headers['x-razorpay-signature'] as string) || '').trim();
  const eventId = (
    (req.headers['x-razorpay-event-id'] as string) ||
    (req.body?.event_id as string) ||
    (req.body?.id as string) ||
    ''
  ).trim();

  if (!signature) {
    res.status(400).json({ detail: 'Webhook signature is required.' });
    return;
  }

  if (!eventId) {
    res.status(400).json({ detail: 'Webhook event id is required.' });
    return;
  }

  if (!ENV.RAZORPAY_WEBHOOK_SECRET) {
    res.status(503).json({ detail: 'Payment webhook is not configured.' });
    return;
  }

  const rawBody =
    (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ detail: 'Webhook signature verification failed.' });
    return;
  }

  const event = req.body;
  if (!event || typeof event !== 'object') {
    res.status(400).json({ detail: 'Webhook payload is invalid.' });
    return;
  }

  const eventType = event.event;
  if (!eventType || typeof eventType !== 'string') {
    res.status(400).json({ detail: 'Webhook event type is required.' });
    return;
  }

  const existing = await RazorpayWebhookEvent.findOne({ razorpayEventId: eventId });
  if (existing && ['processed', 'ignored'].includes(existing.processingStatus)) {
    res.status(200).json({ detail: 'Webhook already handled.' });
    return;
  }

  const paymentEntity = event.payload?.payment?.entity;
  const paymentId = paymentEntity?.id || '';
  const orderId = paymentEntity?.order_id || '';

  let eventRecord;
  try {
    eventRecord = await RazorpayWebhookEvent.findOneAndUpdate(
      { razorpayEventId: eventId },
      {
        $setOnInsert: {
          razorpayEventId: eventId,
          eventType,
          payload: JSON.stringify(event),
          processingStatus: 'received',
          paymentId,
          orderId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    eventRecord = await RazorpayWebhookEvent.findOne({ razorpayEventId: eventId });
  }

  if (eventRecord && ['processed', 'ignored'].includes(eventRecord.processingStatus)) {
    res.status(200).json({ detail: 'Webhook already handled.' });
    return;
  }

  if (eventType !== 'payment.captured') {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'ignored',
          processedAt: new Date(),
        },
      });
    }
    res.status(200).json({ detail: 'Webhook ignored.' });
    return;
  }

  if (!paymentEntity || typeof paymentEntity !== 'object') {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'failed',
          failureReason: 'Webhook payment entity missing.',
          processedAt: new Date(),
        },
      });
    }
    res.status(400).json({ detail: 'Webhook validation failed.' });
    return;
  }

  const providerPaymentId = String(paymentEntity.id || '').trim();
  const providerOrderId = String(paymentEntity.order_id || '').trim();
  const providerCurrency = String(paymentEntity.currency || '').toUpperCase();
  const providerStatus = String(paymentEntity.status || '').trim();
  const providerAmount = Number(paymentEntity.amount);

  if (
    !providerPaymentId ||
    !providerOrderId ||
    isNaN(providerAmount) ||
    providerStatus !== 'captured'
  ) {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'failed',
          failureReason: 'Webhook payment details are invalid.',
          processedAt: new Date(),
        },
      });
    }
    res.status(400).json({ detail: 'Webhook validation failed.' });
    return;
  }

  const transaction = await PaymentTransaction.findOne({
    razorpayOrderId: providerOrderId,
  }).populate('milestone');

  if (!transaction) {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'failed',
          failureReason: 'Payment transaction not found for webhook order.',
          processedAt: new Date(),
        },
      });
    }
    res.status(400).json({ detail: 'Webhook validation failed.' });
    return;
  }

  const milestone = transaction.milestone;
  const expectedAmount = Math.round(Number(transaction.amount || 0) * 100);
  const expectedCurrency = String(transaction.currency || '').toUpperCase();

  const txProjectId = transaction.projectId?.toString() || transaction.projectId;
  const msProjectId = milestone?.projectId?.toString() || milestone?.projectId;

  if (
    txProjectId !== msProjectId ||
    providerAmount !== expectedAmount ||
    providerCurrency !== expectedCurrency
  ) {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'failed',
          failureReason: 'Webhook payment amount or currency does not match transaction.',
          processedAt: new Date(),
        },
      });
    }
    res.status(400).json({ detail: 'Webhook validation failed.' });
    return;
  }

  let completionResult;
  try {
    completionResult = await completePaymentMilestone({
      projectId: String(txProjectId),
      milestoneId: String(transaction.milestoneId),
      actorType: 'client',
      paymentSource: 'razorpay_webhook',
      transactionId: transaction.id,
      razorpayPaymentId: providerPaymentId,
    });
  } catch (err: any) {
    if (eventRecord) {
      await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
        $set: {
          processingStatus: 'failed',
          failureReason: err.message || 'Webhook processing failed.',
          processedAt: new Date(),
        },
      });
    }
    if (err instanceof PaymentCompletionError) {
      res.status(err.statusCode || 400).json({ detail: 'Webhook validation failed.' });
      return;
    }
    res.status(500).json({ detail: 'Webhook processing failed.' });
    return;
  }

  if (eventRecord) {
    await RazorpayWebhookEvent.findByIdAndUpdate(eventRecord.id, {
      $set: {
        processingStatus: 'processed',
        processedAt: new Date(),
      },
    });
  }

  res.status(200).json({
    detail: 'Webhook processed.',
    transaction_status: completionResult.transaction?.status || 'verified',
    milestone_status: completionResult.milestone?.status || 'paid',
  });
}
