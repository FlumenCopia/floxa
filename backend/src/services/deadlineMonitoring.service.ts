
import { Project, IProject } from '../models/project.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { Consultant } from '../models/consultant.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { logProjectActivity } from './project.service.js';

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
        deadlineNote: (note || '').trim(),
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
 * When Brand DNA is completed/generated, clears any overdue flags.
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
 * - 24 hours overdue: Warning 1 (Gentle notice + warning of suspension risk)
 * - 48 hours overdue: Warning 2 (Urgent notice + warning that suspension is approaching)
 * - 72 hours overdue: Warning 3 (Final warning of impending suspension within 24h)
 * - 96 hours overdue: Automatic consultant account suspension (Grace period expired)
 */
export async function checkAndEscalateDeadlines(): Promise<void> {
  try {
    const activeProjects = await Project.find({
      isArchived: false,
      status: { $nin: ['delivered', 'archived'] },
      deliveryDeadline: { $ne: null },
    });

    const now = Date.now();

    for (const proj of activeProjects) {
      if (!proj.deliveryDeadline) continue;

      // Check if Brand DNA is already completed
      const brandDNA = await BrandDNA.findOne({ projectId: proj._id });
      if (brandDNA) {
        if (proj.deadlineFlagsCount && proj.deadlineFlagsCount > 0) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: 0 } });
        }
        continue;
      }

      const deadlineTime = new Date(proj.deliveryDeadline).getTime();
      const diffMs = deadlineTime - now;

      // If still within deadline, ensure flags are clean
      if (diffMs >= 0) {
        if (proj.deadlineFlagsCount && proj.deadlineFlagsCount > 0) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: 0 } });
        }
        continue;
      }

      const hoursOverdue = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
      const title = proj.companyName || proj.title || 'Client Project';
      const consultantId = String(proj.consultantId);

      // Timeline Evaluation
      if (hoursOverdue >= 96) {
        // Stage 2: Automatic Consultant Account Suspension (96h / 4 days overdue)
        // Project-specific guard: If this project has already been escalated to suspension (flag 4),
        // do not re-suspend the consultant for this project, preserving any SuperAdmin manual reactivation.
        if (proj.deadlineFlagsCount === 4) {
          continue;
        }

        await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: 4 } });

        // Suspend consultant idempotently
        const consultant = await Consultant.findById(proj.consultantId);
        if (consultant && (consultant.isActive || !consultant.isSuspended)) {
          consultant.isActive = false;
          consultant.isSuspended = true;
          consultant.suspendedAt = new Date();
          consultant.suspensionReason = 'deadline_breach';
          consultant.suspendedDueToProjectId = proj._id;
          consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
          if (consultant.subscription) {
            consultant.subscription.status = 'suspended';
          }
          await consultant.save();
        }

        // Deduplicate notification in ProjectActivity
        const actionName = 'account_suspended_deadline_breach';
        const recentNotif = await ProjectActivity.findOne({
          projectId: proj._id,
          action: actionName,
        });

        if (!recentNotif) {
          await logProjectActivity({
            projectId: proj._id.toString(),
            consultantId,
            actorType: 'system',
            action: actionName,
            description: `🔒 Account Suspended (96h Overdue): Consultant account automatically suspended for failing to deliver Brand DNA for '${title}' (96 hours overdue, following 3 warnings). Please contact SuperAdmin.`,
            visibleToClient: false,
          });
        }
      } else if (hoursOverdue >= 72) {
        // Warning 3 – Final Warning (72h to 95h overdue)
        const targetFlag = 3;
        const actionName = 'deadline_warning_3';
        const description = `🛑 Warning 3 - Final Notice (72h Overdue): Project '${title}' is 3 days past committed deadline. This is your final grace day. Your consultant account will be AUTOMATICALLY SUSPENDED in 24 hours if Brand DNA is not delivered.`;

        if (proj.deadlineFlagsCount !== targetFlag) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: targetFlag } });
        }

        const recentNotif = await ProjectActivity.findOne({
          projectId: proj._id,
          action: actionName,
          createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
        });

        if (!recentNotif) {
          await logProjectActivity({
            projectId: proj._id.toString(),
            consultantId,
            actorType: 'system',
            action: actionName,
            description,
            visibleToClient: false,
          });
        }
      } else if (hoursOverdue >= 48) {
        // Warning 2 (48h to 71h overdue)
        const targetFlag = 2;
        const actionName = 'deadline_warning_2';
        const description = `🚨 Warning 2 (48h Overdue): Project '${title}' is 2 days past committed deadline. Failure to deliver within the remaining grace period will result in automatic account suspension.`;

        if (proj.deadlineFlagsCount !== targetFlag) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: targetFlag } });
        }

        const recentNotif = await ProjectActivity.findOne({
          projectId: proj._id,
          action: actionName,
          createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
        });

        if (!recentNotif) {
          await logProjectActivity({
            projectId: proj._id.toString(),
            consultantId,
            actorType: 'system',
            action: actionName,
            description,
            visibleToClient: false,
          });
        }
      } else if (hoursOverdue >= 24) {
        // Warning 1 (24h to 47h overdue)
        const targetFlag = 1;
        const actionName = 'deadline_warning_1';
        const description = `⚠️ Warning 1 (24h Overdue): Project '${title}' passed its committed delivery deadline yesterday. Please deliver Brand DNA promptly to avoid warning escalation and automatic account suspension.`;

        if (proj.deadlineFlagsCount !== targetFlag) {
          await Project.findByIdAndUpdate(proj._id, { $set: { deadlineFlagsCount: targetFlag } });
        }

        const recentNotif = await ProjectActivity.findOne({
          projectId: proj._id,
          action: actionName,
          createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) },
        });

        if (!recentNotif) {
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
    }
  } catch (err) {
    console.error('Error running checkAndEscalateDeadlines:', err);
  }
}
