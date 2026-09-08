import { prisma } from '../prisma/client.js';
import {
  logProjectActivity,
  recalculatePaymentMilestones,
  updateProjectProgress,
} from './project.service.js';

export class PaymentCompletionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'PaymentCompletionError';
    this.statusCode = statusCode;
  }
}

let testContentionHook: (() => Promise<void>) | null = null;
let testFailureInjectionHook: (() => void) | null = null;

export function setTestContentionHook(hook: (() => Promise<void>) | null) {
  if (process.env.NODE_ENV === 'production') return;
  testContentionHook = hook;
}

export function setTestFailureInjectionHook(hook: (() => void) | null) {
  if (process.env.NODE_ENV === 'production') return;
  testFailureInjectionHook = hook;
}

function isRetryableDatabaseError(err: any): boolean {
  if (!err) return false;
  if (err.code === 'P2034') return true;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('write conflict') ||
    msg.includes('writeconflict') ||
    msg.includes('transienttransactionerror') ||
    msg.includes('deadlock') ||
    msg.includes('could not serialize access')
  );
}

export interface CompletePaymentMilestoneParams {
  projectId: string;
  milestoneId: string;
  actorType: 'client' | 'consultant' | 'system';
  paymentSource: 'razorpay' | 'razorpay_webhook' | 'manual';
  transactionId?: string;
  razorpayPaymentId?: string;
  paidAt?: Date;
}

export interface CompletePaymentMilestoneResult {
  milestone: any;
  transaction?: any;
  isAlreadyVerified: boolean;
  activityCreated: boolean;
}

export async function completePaymentMilestone(
  params: CompletePaymentMilestoneParams
): Promise<CompletePaymentMilestoneResult> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeAtomicPaymentCompletion(params);
    } catch (err: any) {
      if (err instanceof PaymentCompletionError) {
        throw err;
      }
      if (isRetryableDatabaseError(err) && attempt < maxRetries - 1) {
        const backoffMs = 50 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    }
  }

  throw new PaymentCompletionError(
    'Payment transaction processing failed due to contention. Please retry.',
    503
  );
}

async function executeAtomicPaymentCompletion(
  params: CompletePaymentMilestoneParams
): Promise<CompletePaymentMilestoneResult> {
  const {
    projectId,
    milestoneId,
    actorType,
    paymentSource,
    transactionId,
    razorpayPaymentId,
    paidAt,
  } = params;

  return prisma.$transaction(async (tx) => {
    if (testContentionHook) {
      await testContentionHook();
    }

    const now = paidAt || new Date();

    const milestone = await tx.paymentMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: {
          include: {
            consultant: true,
          },
        },
        transactions: true,
      },
    });

    if (!milestone || milestone.projectId !== projectId) {
      throw new PaymentCompletionError('Payment milestone not found.', 404);
    }

    const verifiedTransaction = milestone.transactions.find((t) => t.status === 'verified');

    // 1. Manual payment path
    if (paymentSource === 'manual') {
      if (verifiedTransaction) {
        throw new PaymentCompletionError('This payment has already been verified through Razorpay.');
      }

      if (milestone.status === 'paid') {
        throw new PaymentCompletionError('Only requested milestones can be marked paid.');
      }
      if (milestone.status !== 'requested') {
        throw new PaymentCompletionError('Only requested milestones can be marked paid.');
      }

      const msUpdate = await tx.paymentMilestone.updateMany({
        where: { id: milestone.id, status: 'requested' },
        data: {
          status: 'paid',
          paidAt: now,
        },
      });

      if (msUpdate.count === 0) {
        const checkMs = await tx.paymentMilestone.findUnique({ where: { id: milestone.id } });
        if (checkMs?.status === 'paid') {
          throw new PaymentCompletionError('Only requested milestones can be marked paid.');
        }
        throw new PaymentCompletionError('Only requested milestones can be marked paid.');
      }

      if (testFailureInjectionHook) {
        testFailureInjectionHook();
      }

      const updatedMilestone = await tx.paymentMilestone.findUnique({ where: { id: milestone.id } });

      const milestoneLabel = milestone.type.charAt(0).toUpperCase() + milestone.type.slice(1);
      const amountDisplay = `₹${Number(milestone.amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      const description = `Client paid ${amountDisplay} for the ${milestoneLabel} milestone.`;

      const existingActivity = await tx.projectActivity.findFirst({
        where: {
          projectId: milestone.projectId,
          action: 'payment_received',
          metadata: {
            contains: `"payment_milestone_id":"${milestone.id}"`,
          },
        },
      });

      let activityCreated = false;
      if (!existingActivity) {
        await logProjectActivity(
          {
            projectId: milestone.projectId,
            consultantId: milestone.project.consultantId,
            actorType,
            action: 'payment_received',
            description,
            metadata: {
              payment_milestone_id: milestone.id,
              payment_type: milestone.type,
              payment_source: 'manual',
              amount: Number(milestone.amount).toFixed(2),
              amount_display: amountDisplay,
            },
            visibleToClient: false,
            clientIsRead: true,
          },
          tx
        );
        activityCreated = true;
      }

      await recalculatePaymentMilestones(milestone.projectId, tx);
      await updateProjectProgress(milestone.projectId, tx);

      return {
        milestone: updatedMilestone,
        isAlreadyVerified: false,
        activityCreated,
      };
    }

    // 2. Online payment path (verification or webhook)
    if (!transactionId) {
      throw new PaymentCompletionError('Payment transaction ID is required for online completion.');
    }

    const transaction = await tx.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: {
        milestone: true,
      },
    });

    if (!transaction || transaction.projectId !== projectId || transaction.milestoneId !== milestone.id) {
      throw new PaymentCompletionError('Payment transaction does not match this milestone.', 404);
    }

    // Check if THIS transaction is already verified
    if (transaction.status === 'verified') {
      if (razorpayPaymentId && transaction.razorpayPaymentId && transaction.razorpayPaymentId !== razorpayPaymentId) {
        throw new PaymentCompletionError(
          'Payment transaction is already verified with a different payment.'
        );
      }

      const currentMilestone = await tx.paymentMilestone.findUnique({ where: { id: milestone.id } });
      return {
        milestone: currentMilestone,
        transaction,
        isAlreadyVerified: true,
        activityCreated: false,
      };
    }

    if (transaction.status !== 'created') {
      throw new PaymentCompletionError('Payment transaction is not eligible for completion.');
    }

    // Check if ANOTHER transaction for this milestone is already verified
    if (verifiedTransaction && verifiedTransaction.id !== transaction.id) {
      throw new PaymentCompletionError('This payment milestone is already verified.');
    }

    // Check milestone status
    if (milestone.status === 'paid') {
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }
    if (milestone.status !== 'requested') {
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }

    // Atomically transition the PaymentTransaction (CAS pattern)
    const txUpdate = await tx.paymentTransaction.updateMany({
      where: {
        id: transaction.id,
        status: 'created',
      },
      data: {
        status: 'verified',
        razorpayPaymentId: razorpayPaymentId || undefined,
        verifiedAt: now,
      },
    });

    if (txUpdate.count === 0) {
      // Race: another concurrent process transitioned this transaction
      const recheckTx = await tx.paymentTransaction.findUnique({
        where: { id: transaction.id },
      });
      if (recheckTx && recheckTx.status === 'verified') {
        if (razorpayPaymentId && recheckTx.razorpayPaymentId && recheckTx.razorpayPaymentId !== razorpayPaymentId) {
          throw new PaymentCompletionError(
            'Payment transaction is already verified with a different payment.'
          );
        }
        const currentMilestone = await tx.paymentMilestone.findUnique({ where: { id: milestone.id } });
        return {
          milestone: currentMilestone,
          transaction: recheckTx,
          isAlreadyVerified: true,
          activityCreated: false,
        };
      }
      throw new PaymentCompletionError('Payment transaction is not eligible for completion.');
    }

    if (testFailureInjectionHook) {
      testFailureInjectionHook();
    }

    // Atomically transition the PaymentMilestone
    const msUpdate = await tx.paymentMilestone.updateMany({
      where: {
        id: milestone.id,
        status: 'requested',
      },
      data: {
        status: 'paid',
        paidAt: now,
      },
    });

    if (msUpdate.count === 0) {
      const recheckMs = await tx.paymentMilestone.findUnique({
        where: { id: milestone.id },
        include: { transactions: true },
      });
      if (recheckMs?.status === 'paid') {
        throw new PaymentCompletionError('Only requested milestones can be marked paid.');
      }
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }

    const updatedTransaction = await tx.paymentTransaction.findUnique({ where: { id: transaction.id } });
    const updatedMilestone = await tx.paymentMilestone.findUnique({ where: { id: milestone.id } });

    // Check and create ProjectActivity inside the SAME transaction
    const existingActivity = await tx.projectActivity.findFirst({
      where: {
        projectId: milestone.projectId,
        action: 'payment_received',
        metadata: {
          contains: `"payment_milestone_id":"${milestone.id}"`,
        },
      },
    });

    let activityCreated = false;
    if (!existingActivity) {
      const milestoneLabel = milestone.type.charAt(0).toUpperCase() + milestone.type.slice(1);
      const amountDisplay = `₹${Number(milestone.amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      const description = `Client paid ${amountDisplay} for the ${milestoneLabel} milestone.`;

      await logProjectActivity(
        {
          projectId: milestone.projectId,
          consultantId: milestone.project.consultantId,
          actorType,
          action: 'payment_received',
          description,
          metadata: {
            payment_milestone_id: milestone.id,
            payment_type: milestone.type,
            payment_source: paymentSource,
            amount: Number(milestone.amount).toFixed(2),
            amount_display: amountDisplay,
            transaction_id: transaction.id,
            razorpay_order_id: transaction.razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId || transaction.razorpayPaymentId || '',
          },
          visibleToClient: true,
          clientIsRead: false,
        },
        tx
      );
      activityCreated = true;
    }

    // Downstream calculations in SAME tx
    await recalculatePaymentMilestones(milestone.projectId, tx);
    await updateProjectProgress(milestone.projectId, tx);

    return {
      milestone: updatedMilestone,
      transaction: updatedTransaction,
      isAlreadyVerified: false,
      activityCreated,
    };
  });
}
