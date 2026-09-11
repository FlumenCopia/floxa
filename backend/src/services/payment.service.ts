import mongoose, { ClientSession } from 'mongoose';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { PaymentTransaction } from '../models/paymentTransaction.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import {
  logProjectActivity,
  recalculatePaymentMilestones,
  updateProjectProgress,
} from './project.service.js';

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
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('write conflict') ||
    msg.includes('writeconflict') ||
    msg.includes('transienttransactionerror') ||
    msg.includes('deadlock') ||
    msg.includes('could not serialize access')
  );
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
  let session: ClientSession | null = null;
  const topologyType = (mongoose.connection as any)?.client?.topology?.description?.type;
  const isReplicaSet =
    topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

  if (isReplicaSet) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }
  }

  try {
    const result = await runPaymentCompletion(params, session);
    if (session) {
      await session.commitTransaction();
    }
    return result;
  } catch (error: any) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    const errMsg = (error?.message || '').toLowerCase();
    if (session && errMsg.includes('transaction numbers are only allowed')) {
      return await runPaymentCompletion(params, null);
    }
    throw error;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {}
    }
  }
}

async function runPaymentCompletion(
  params: CompletePaymentMilestoneParams,
  session: ClientSession | null
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

  if (testContentionHook) {
    await testContentionHook();
  }

  const now = paidAt || new Date();

  const milestoneQuery = PaymentMilestone.findById(milestoneId).populate([
    'project',
    'transactions',
  ]);
  if (session) milestoneQuery.session(session);

  const milestone = await milestoneQuery.exec();

  if (!milestone || (milestone as any).projectId?.toString() !== projectId) {
    throw new PaymentCompletionError('Payment milestone not found.', 404);
  }

  const transactions = (milestone as any).transactions || [];
  const verifiedTransaction = transactions.find((t: any) => t.status === 'verified');

  // 1. Manual payment path
  if (paymentSource === 'manual') {
    if (verifiedTransaction) {
      throw new PaymentCompletionError('This payment has already been verified through Razorpay.');
    }

    if ((milestone as any).status === 'paid') {
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }
    if ((milestone as any).status !== 'requested') {
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }

    const msUpdate = await PaymentMilestone.updateOne(
      { _id: (milestone as any)._id, status: 'requested' },
      { $set: { status: 'paid', paidAt: now } },
      { session: session || undefined }
    );

    if (msUpdate.matchedCount === 0) {
      throw new PaymentCompletionError('Only requested milestones can be marked paid.');
    }

    if (testFailureInjectionHook) {
      testFailureInjectionHook();
    }

    const updatedMilestone = await PaymentMilestone.findById((milestone as any)._id, null, {
      session: session || undefined,
    });

    const milestoneLabel = (milestone as any).type.charAt(0).toUpperCase() + (milestone as any).type.slice(1);
    const amountDisplay = `₹${Number((milestone as any).amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const description = `Client paid ${amountDisplay} for the ${milestoneLabel} milestone.`;

    const existingActivity = await ProjectActivity.findOne({
      projectId: (milestone as any).projectId,
      action: 'payment_received',
      metadata: new RegExp((milestone as any).id, 'i'),
    }).session(session || null);

    let activityCreated = false;
    if (!existingActivity) {
      const consultantId = String((milestone as any).project?.consultantId || '');
      await logProjectActivity(
        {
          projectId: String((milestone as any).projectId),
          consultantId,
          actorType,
          action: 'payment_received',
          description,
          metadata: {
            payment_milestone_id: (milestone as any).id,
            payment_type: (milestone as any).type,
            payment_source: 'manual',
            amount: Number((milestone as any).amount).toFixed(2),
            amount_display: amountDisplay,
          },
          visibleToClient: false,
          clientIsRead: true,
        },
        session || undefined
      );
      activityCreated = true;
    }

    await recalculatePaymentMilestones((milestone as any).projectId?.toString(), session || undefined);
    await updateProjectProgress((milestone as any).projectId?.toString(), session || undefined);

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

  const txQuery = PaymentTransaction.findById(transactionId).populate('milestone');
  if (session) txQuery.session(session);

  const transaction = await txQuery.exec();

  if (
    !transaction ||
    (transaction as any).projectId?.toString() !== projectId ||
    (transaction as any).milestoneId?.toString() !== (milestone as any).id
  ) {
    throw new PaymentCompletionError('Payment transaction does not match this milestone.', 404);
  }

  // Check if THIS transaction is already verified
  if ((transaction as any).status === 'verified') {
    if (
      razorpayPaymentId &&
      (transaction as any).razorpayPaymentId &&
      (transaction as any).razorpayPaymentId !== razorpayPaymentId
    ) {
      throw new PaymentCompletionError(
        'Payment transaction is already verified with a different payment.'
      );
    }

    const currentMilestone = await PaymentMilestone.findById((milestone as any)._id, null, {
      session: session || undefined,
    });

    return {
      milestone: currentMilestone,
      transaction,
      isAlreadyVerified: true,
      activityCreated: false,
    };
  }

  if ((transaction as any).status !== 'created') {
    throw new PaymentCompletionError('Payment transaction is not eligible for completion.');
  }

  // Check if ANOTHER transaction for this milestone is already verified
  if (verifiedTransaction && (verifiedTransaction as any).id !== (transaction as any).id) {
    throw new PaymentCompletionError('This payment milestone is already verified.');
  }

  // Check milestone status
  if ((milestone as any).status === 'paid') {
    throw new PaymentCompletionError('Only requested milestones can be marked paid.');
  }
  if ((milestone as any).status !== 'requested') {
    throw new PaymentCompletionError('Only requested milestones can be marked paid.');
  }

  // Atomically transition the PaymentTransaction (CAS pattern)
  const txUpdate = await PaymentTransaction.updateOne(
    { _id: (transaction as any)._id, status: 'created' },
    {
      $set: {
        status: 'verified',
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        verifiedAt: now,
      },
    },
    { session: session || undefined }
  );

  if (txUpdate.matchedCount === 0) {
    const recheckTx = await PaymentTransaction.findById((transaction as any)._id, null, {
      session: session || undefined,
    });
    if (recheckTx && (recheckTx as any).status === 'verified') {
      if (
        razorpayPaymentId &&
        (recheckTx as any).razorpayPaymentId &&
        (recheckTx as any).razorpayPaymentId !== razorpayPaymentId
      ) {
        throw new PaymentCompletionError(
          'Payment transaction is already verified with a different payment.'
        );
      }
      const currentMilestone = await PaymentMilestone.findById((milestone as any)._id, null, {
        session: session || undefined,
      });
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
  const msUpdate = await PaymentMilestone.updateOne(
    { _id: (milestone as any)._id, status: 'requested' },
    { $set: { status: 'paid', paidAt: now } },
    { session: session || undefined }
  );

  if (msUpdate.matchedCount === 0) {
    throw new PaymentCompletionError('Only requested milestones can be marked paid.');
  }

  const updatedTransaction = await PaymentTransaction.findById((transaction as any)._id, null, {
    session: session || undefined,
  });
  const updatedMilestone = await PaymentMilestone.findById((milestone as any)._id, null, {
    session: session || undefined,
  });

  const existingActivity = await ProjectActivity.findOne({
    projectId: (milestone as any).projectId,
    action: 'payment_received',
    metadata: new RegExp((milestone as any).id, 'i'),
  }).session(session || null);

  let activityCreated = false;
  if (!existingActivity) {
    const milestoneLabel = (milestone as any).type.charAt(0).toUpperCase() + (milestone as any).type.slice(1);
    const amountDisplay = `₹${Number((milestone as any).amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const description = `Client paid ${amountDisplay} for the ${milestoneLabel} milestone.`;
    const consultantId = String((milestone as any).project?.consultantId || '');

    await logProjectActivity(
      {
        projectId: String((milestone as any).projectId),
        consultantId,
        actorType,
        action: 'payment_received',
        description,
        metadata: {
          payment_milestone_id: (milestone as any).id,
          payment_type: (milestone as any).type,
          payment_source: paymentSource,
          amount: Number((milestone as any).amount).toFixed(2),
          amount_display: amountDisplay,
          transaction_id: (transaction as any).id,
          razorpay_order_id: (transaction as any).razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId || (transaction as any).razorpayPaymentId || '',
        },
        visibleToClient: true,
        clientIsRead: false,
      },
      session || undefined
    );
    activityCreated = true;
  }

  await recalculatePaymentMilestones((milestone as any).projectId?.toString(), session || undefined);
  await updateProjectProgress((milestone as any).projectId?.toString(), session || undefined);

  return {
    milestone: updatedMilestone,
    transaction: updatedTransaction,
    isAlreadyVerified: false,
    activityCreated,
  };
}
