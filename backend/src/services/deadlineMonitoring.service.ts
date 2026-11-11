import mongoose from 'mongoose';
import { Project, IProject } from '../models/project.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { Consultant } from '../models/consultant.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { Moodboard } from '../models/moodboard.model.js';
import { Concept } from '../models/concept.model.js';
import { ProjectAgreement } from '../models/agreement.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { Deliverable } from '../models/deliverable.model.js';
import { logProjectActivity } from './project.service.js';
import { disconnectConsultantSockets } from '../websocket/socketServer.js';

const schedulerLockSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, default: null },
    owner: { type: String, default: '' },
  },
  { collection: 'scheduler_locks', versionKey: false }
);

const SchedulerLock =
  mongoose.models.SchedulerLock || mongoose.model('SchedulerLock', schedulerLockSchema);

export interface ClientWaitStatus {
  awaitingClient: boolean;
  reason?:
    | 'delivered_or_signed_off'
    | 'awaiting_intake'
    | 'awaiting_moodboard_selection'
    | 'awaiting_concept_approval'
    | 'awaiting_agreement_signature'
    | 'awaiting_milestone_payment'
    | 'deliverables_completed_awaiting_signoff';
  detail?: string;
}

/**
 * Determines whether a project is currently blocked waiting for a client action.
 * When awaitingClient is true, the consultant's SLA clock is paused.
 */
export async function isProjectAwaitingClientAction(project: any): Promise<ClientWaitStatus> {
  const projectId = project._id || project.id;

  // 1. If project is delivered or client signed off, it's completed
  if (project.status === 'delivered' || project.clientSignedOff) {
    return { awaitingClient: true, reason: 'delivered_or_signed_off', detail: 'Project is delivered or signed off.' };
  }

  // 2. Awaiting Discovery Intake from client
  const hasIntake = Boolean(project.clientSubmittedAt || project.discovery?.submittedAt);
  if (!hasIntake) {
    return { awaitingClient: true, reason: 'awaiting_intake', detail: 'Waiting for client to submit discovery intake questionnaire.' };
  }

  // 3. Waiting for client milestone payment (any milestone requested by consultant but not yet paid by client)
  const requestedMilestone = await PaymentMilestone.findOne({
    projectId,
    status: 'requested',
  });
  if (requestedMilestone) {
    return {
      awaitingClient: true,
      reason: 'awaiting_milestone_payment',
      detail: `Waiting for client to pay requested ${requestedMilestone.type} milestone payment.`,
    };
  }

  // 4. Waiting for client agreement signature (agreement is shared with client but not yet signed)
  const agreement = await ProjectAgreement.findOne({ projectId });
  if (agreement && ['shared', 'signature_requested'].includes(agreement.status) && !agreement.signedAt) {
    return {
      awaitingClient: true,
      reason: 'awaiting_agreement_signature',
      detail: 'Waiting for client to digitally sign project agreement.',
    };
  }

  // 5. Waiting for client moodboard selection (consultant has shared moodboards, client has not selected one)
  const sharedMoodboards = await Moodboard.find({ projectId, isShared: true });
  if (sharedMoodboards.length > 0 && !sharedMoodboards.some((m) => m.isSelected)) {
    return {
      awaitingClient: true,
      reason: 'awaiting_moodboard_selection',
      detail: 'Waiting for client to select a moodboard direction.',
    };
  }

  // 6. Waiting for client concept approval (consultant has shared concept(s), none approved yet)
  const [sharedConceptsCount, approvedConceptsCount] = await Promise.all([
    Concept.countDocuments({ projectId, status: 'shared' }),
    Concept.countDocuments({ projectId, status: 'approved' }),
  ]);
  if (sharedConceptsCount > 0 && approvedConceptsCount === 0) {
    return {
      awaitingClient: true,
      reason: 'awaiting_concept_approval',
      detail: 'Waiting for client to review and approve shared design concepts.',
    };
  }

  // 7. Deliverables completed & shared, awaiting final client download and signoff
  const sharedDeliverables = await Deliverable.find({ projectId, status: 'shared' });
  if (sharedDeliverables.length > 0) {
    return {
      awaitingClient: true,
      reason: 'deliverables_completed_awaiting_signoff',
      detail: 'Final deliverables shared with client; awaiting client sign-off.',
    };
  }

  return { awaitingClient: false };
}

/**
 * Pure calculation of a project's active SLA timeline, accounting for paused client wait duration.
 */
export function calculateProjectActiveSla(project: any, now = Date.now()) {
  const originalDeadline = project.deliveryDeadline ? new Date(project.deliveryDeadline).getTime() : null;
  if (!originalDeadline) {
    return {
      originalDeadline: null,
      effectiveDeadline: null,
      isPaused: false,
      totalClientWaitMs: 0,
      diffMs: 0,
      hoursOverdue: 0,
      daysRemaining: 0,
    };
  }

  const isPaused = Boolean(project.slaPausedAt);
  const currentPauseDuration = isPaused ? Math.max(0, now - new Date(project.slaPausedAt).getTime()) : 0;
  const totalClientWaitMs = Number(project.totalClientWaitMs || 0) + currentPauseDuration;
  const effectiveDeadline = originalDeadline + totalClientWaitMs;
  const diffMs = effectiveDeadline - now;

  const hoursOverdue = diffMs < 0 ? Math.floor(Math.abs(diffMs) / (1000 * 60 * 60)) : 0;
  const daysRemaining = diffMs > 0 ? Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))) : 0;

  return {
    originalDeadline: new Date(originalDeadline),
    effectiveDeadline: new Date(effectiveDeadline),
    isPaused,
    totalClientWaitMs,
    diffMs,
    hoursOverdue,
    daysRemaining,
  };
}

/**
 * Sets or updates the committed delivery deadline for a project.
 * Implements Stage 3 restrictions:
 * - Prevents deadline modification if warning escalation has started (deadlineFlagsCount > 0).
 * - Prevents extending deadline if the current deadline has already elapsed.
 */
export async function setProjectDeliveryDeadline(
  projectId: string,
  consultantId: string,
  deadline: Date | string,
  note?: string
): Promise<IProject | null> {
  const project = await Project.findOne({ _id: projectId, consultantId, isArchived: false });
  if (!project) return null;

  const now = Date.now();

  // Stage 3 - Prevent deadline bypass:
  // Cannot modify if warning escalation has started
  if (project.deadlineFlagsCount && project.deadlineFlagsCount > 0) {
    const error: any = new Error(
      'Deadline cannot be modified after warning escalation has begun. SuperAdmin approval is required.'
    );
    error.status = 400;
    throw error;
  }

  // One-time commitment: Once set, delivery deadline cannot be changed
  if (project.deliveryDeadline) {
    const error: any = new Error(
      'Delivery deadline has already been committed and cannot be changed.'
    );
    error.status = 400;
    throw error;
  }

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    const error: any = new Error('Invalid deadline date provided.');
    error.status = 400;
    throw error;
  }

  // Minimum: at least 6 hours in the future
  if (deadlineDate.getTime() < now + 6 * 60 * 60 * 1000) {
    const error: any = new Error('Deadline must be at least 6 hours in the future.');
    error.status = 400;
    throw error;
  }

  // Maximum: at most 30 days in the future
  if (deadlineDate.getTime() > now + 30 * 24 * 60 * 60 * 1000) {
    const error: any = new Error('Deadline cannot exceed 30 days from today.');
    error.status = 400;
    throw error;
  }

  const updatedProject = await Project.findOneAndUpdate(
    { _id: projectId, consultantId },
    {
      $set: {
        deliveryDeadline: deadlineDate,
        deadlineSetAt: new Date(),
        deadlineFlagsCount: 0,
        deadlineBreached: false,
        deadlineNote: (note || '').trim(),
        slaPausedAt: null,
        totalClientWaitMs: 0,
      },
    },
    { new: true }
  ).populate(['client', 'clientProfile', 'consultant', 'discovery', 'brandDNA']);

  const title = project.companyName || project.title || 'Client Project';
  const formattedDate = deadlineDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  await logProjectActivity({
    projectId: project._id.toString(),
    consultantId: String(project.consultantId),
    actorType: 'consultant',
    action: 'delivery_deadline_set',
    description: `Consultant committed delivery deadline for '${title}' on ${formattedDate}.`,
    metadata: {
      delivery_deadline: deadlineDate.toISOString(),
      note: (note || '').trim(),
    },
    visibleToClient: true,
  });

  return updatedProject;
}

/**
 * When Brand DNA is completed/generated, clears any overdue flags that were active
 * while preparing Brand DNA. SLA monitoring continues for remaining project stages.
 */
export async function onBrandDnaCompleted(projectId: string): Promise<void> {
  try {
    await Project.findByIdAndUpdate(projectId, {
      $set: {
        deadlineFlagsCount: 0,
      },
    });
  } catch (err) {
    console.error('Failed to update project deadline flags on Brand DNA completion:', err);
  }
}

/**
 * Periodic background scan that enforces:
 * - 24 active hours overdue: Warning 1 (Gentle notice + warning of suspension risk)
 * - 48 active hours overdue: Warning 2 (Urgent notice + warning that suspension is approaching)
 * - 72 active hours overdue: Warning 3 (Final warning of impending suspension within 24h)
 * - 96 active hours overdue: Automatic consultant account suspension (Grace period expired)
 *
 * Client-Wait Protection:
 * Automatically pauses SLA clock whenever the project is waiting for client intake, moodboard selection,
 * concept approval, agreement signature, or milestone payment. Active overdue hours are calculated
 * strictly excluding all verified client-wait duration.
 */
export async function checkAndEscalateDeadlines(currentTime?: number): Promise<void> {
  const lockOwner = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const nowDate = new Date();
  let lockAcquired = false;

  try {
    try {
      const lock = await SchedulerLock.findOneAndUpdate(
        {
          _id: 'sla_deadline_check',
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: nowDate } }],
        },
        {
          $set: {
            lockedUntil: new Date(nowDate.getTime() + 4 * 60 * 1000),
            owner: lockOwner,
          },
        },
        { upsert: true, new: true }
      );
      lockAcquired = Boolean(lock && lock.owner === lockOwner);
    } catch (lockErr: any) {
      // E11000 duplicate key means another worker won the lock race simultaneously
      if (lockErr?.code === 11000) {
        return;
      }
      throw lockErr;
    }

    if (!lockAcquired) {
      return;
    }

    const activeProjects = await Project.find({
      isArchived: false,
      status: { $nin: ['delivered', 'archived'] },
      deliveryDeadline: { $ne: null },
    });

    const now = typeof currentTime === 'number' ? currentTime : Date.now();

    for (const proj of activeProjects) {
      if (!proj.deliveryDeadline) continue;

      // 1. Exclude projects already delivered or client signed off
      if (proj.status === 'delivered' || proj.clientSignedOff) {
        if (proj.deadlineFlagsCount && proj.deadlineFlagsCount > 0) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: 0, slaPausedAt: null } });
        }
        continue;
      }

      // 2. Check if project is currently waiting for client action
      const waitStatus = await isProjectAwaitingClientAction(proj);

      if (waitStatus.awaitingClient) {
        // Project is waiting for client: Pause SLA clock!
        if (!proj.slaPausedAt) {
          await Project.findByIdAndUpdate(proj._id, {
            $set: { slaPausedAt: new Date(now) },
          });
        }
        // While paused, do NOT escalate warning flags or suspend consultant
        continue;
      }

      // 3. Project is NOT waiting for client (Consultant is responsible for current stage):
      let totalClientWaitMs = Number(proj.totalClientWaitMs || 0);

      // If project was previously paused, finalize the pause duration and resume SLA clock
      if (proj.slaPausedAt) {
        const pauseStarted = new Date(proj.slaPausedAt).getTime();
        const pauseDuration = Math.max(0, now - pauseStarted);
        totalClientWaitMs += pauseDuration;

        await Project.findByIdAndUpdate(proj._id, {
          $set: {
            totalClientWaitMs,
            slaPausedAt: null,
          },
        });
      }

      // 4. Calculate active overdue time excluding all client wait duration
      const originalDeadline = new Date(proj.deliveryDeadline).getTime();
      const effectiveDeadline = originalDeadline + totalClientWaitMs;
      const diffMs = effectiveDeadline - now;

      // If still within active deadline, clear early warning flags (flags < 4)
      if (diffMs >= 0) {
        if (proj.deadlineFlagsCount && proj.deadlineFlagsCount > 0 && proj.deadlineFlagsCount < 4) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: 0 } });
        }
        continue;
      }

      const hoursOverdue = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
      const title = proj.companyName || proj.title || 'Client Project';
      const consultantId = String(proj.consultantId);

      // Contextual description for notifications:
      // If Brand DNA is not delivered yet, mention Brand DNA.
      // If Brand DNA is already generated, mention Project Deliverables.
      const hasBrandDNA = await BrandDNA.findOne({ projectId: proj._id });
      const targetDeliverable = hasBrandDNA ? 'project deliverables' : 'Brand DNA';

      // 5. Timeline Evaluation & Atomic Idempotent Warning Escalation
      if (hoursOverdue >= 96) {
        // Flag 4: Automatic Consultant Account Suspension (96h overdue)
        const claimed = await Project.findOneAndUpdate(
          { _id: proj._id, deadlineFlagsCount: { $lt: 4 } },
          { $set: { deadlineFlagsCount: 4, deadlineBreached: true } },
          { new: true }
        );
        if (!claimed) {
          continue; // Already escalated to 4
        }

        const consultant = await Consultant.findById(proj.consultantId);
        if (consultant && (consultant.isActive || !consultant.isSuspended)) {
          consultant.isActive = false;
          consultant.isSuspended = true;
          consultant.suspendedAt = new Date(now);
          consultant.suspensionReason = 'deadline_breach';
          consultant.suspendedDueToProjectId = proj._id;
          consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
          if (consultant.subscription) {
            consultant.subscription.status = 'suspended';
          }
          await consultant.save();
          disconnectConsultantSockets(consultant.id, 4001, 'Account suspended due to SLA breach');
        }

        const actionName = 'account_suspended_deadline_breach';
        const existingNotif = await ProjectActivity.findOne({
          projectId: proj._id,
          action: actionName,
        });

        if (!existingNotif) {
          await logProjectActivity({
            projectId: proj._id.toString(),
            consultantId,
            actorType: 'system',
            action: actionName,
            description: `🔒 Account Suspended (96h Overdue): Consultant account automatically suspended for failing to deliver ${targetDeliverable} for '${title}' (96 hours overdue, following 3 warnings). Please contact SuperAdmin.`,
            visibleToClient: false,
          });
        }
      } else if (hoursOverdue >= 72) {
        // Warning 3 (72h to 95h overdue)
        const targetFlag = 3;
        const actionName = 'deadline_warning_3';
        const description = `🛑 Warning 3 - Final Notice (72h Overdue): Project '${title}' is 3 days past committed deadline. This is your final grace day. Your consultant account will be AUTOMATICALLY SUSPENDED in 24 hours if ${targetDeliverable} is not delivered.`;

        const claimed = await Project.findOneAndUpdate(
          { _id: proj._id, deadlineFlagsCount: { $lt: targetFlag } },
          { $set: { deadlineFlagsCount: targetFlag } },
          { new: true }
        );
        if (!claimed) continue;

        await logProjectActivity({
          projectId: proj._id.toString(),
          consultantId,
          actorType: 'system',
          action: actionName,
          description,
          visibleToClient: false,
        });
      } else if (hoursOverdue >= 48) {
        // Warning 2 (48h to 71h overdue)
        const targetFlag = 2;
        const actionName = 'deadline_warning_2';
        const description = `🚨 Warning 2 (48h Overdue): Project '${title}' is 2 days past committed deadline. Failure to deliver within the remaining grace period will result in automatic account suspension.`;

        const claimed = await Project.findOneAndUpdate(
          { _id: proj._id, deadlineFlagsCount: { $lt: targetFlag } },
          { $set: { deadlineFlagsCount: targetFlag } },
          { new: true }
        );
        if (!claimed) continue;

        await logProjectActivity({
          projectId: proj._id.toString(),
          consultantId,
          actorType: 'system',
          action: actionName,
          description,
          visibleToClient: false,
        });
      } else if (hoursOverdue >= 24) {
        // Warning 1 (24h to 47h overdue)
        const targetFlag = 1;
        const actionName = 'deadline_warning_1';
        const description = `⚠️ Warning 1 (24h Overdue): Project '${title}' passed its committed delivery deadline yesterday. Please deliver ${targetDeliverable} promptly to avoid warning escalation and automatic account suspension.`;

        const claimed = await Project.findOneAndUpdate(
          { _id: proj._id, deadlineFlagsCount: { $lt: targetFlag } },
          { $set: { deadlineFlagsCount: targetFlag } },
          { new: true }
        );
        if (!claimed) continue;

        await logProjectActivity({
          projectId: proj._id.toString(),
          consultantId,
          actorType: 'system',
          action: actionName,
          description,
          visibleToClient: false,
        });
      }
    }
  } catch (err) {
    console.error('Error running checkAndEscalateDeadlines:', err);
  } finally {
    if (lockAcquired) {
      try {
        await SchedulerLock.updateOne(
          { _id: 'sla_deadline_check', owner: lockOwner },
          { $set: { lockedUntil: null, owner: '' } }
        );
      } catch {}
    }
  }
}
