import mongoose, { ClientSession } from 'mongoose';
import { Project, type IProject } from '../models/project.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { logProjectActivity, onActivityCreated, type LogActivityParams, type ActivityNotificationListener } from './activity.service.js';

export { logProjectActivity, onActivityCreated };
export type { LogActivityParams, ActivityNotificationListener };

export type ProjectWithMilestones = IProject & {
  paymentMilestones?: any[];
};

export function canClientDownloadDeliverable(
  project: ProjectWithMilestones | null | undefined,
  deliverable: any | null | undefined
): { canDownload: boolean; reason: string } {
  if (!project || !deliverable) {
    return { canDownload: false, reason: 'Deliverable unavailable.' };
  }

  if (project.isArchived) {
    return { canDownload: false, reason: 'Project is archived.' };
  }

  const projectId = project.id || (project as any)._id?.toString();
  const deliverableProjectId = deliverable.projectId?.toString() || deliverable.projectId;

  if (deliverableProjectId !== projectId) {
    return { canDownload: false, reason: 'Deliverable unavailable.' };
  }

  if (deliverable.status !== 'shared') {
    return { canDownload: false, reason: 'Deliverable is not shared with client.' };
  }

  const milestones = project.paymentMilestones || [];
  const finalMilestone = milestones.find((m: any) => m.type === 'final');

  if (!finalMilestone) {
    return { canDownload: false, reason: 'Final files will be available after the required payment is confirmed.' };
  }

  if (finalMilestone.status !== 'paid') {
    return { canDownload: false, reason: 'Final files will be available after the required payment is confirmed.' };
  }

  for (const milestone of milestones) {
    if (milestone.status !== 'paid') {
      return { canDownload: false, reason: 'Final files will be available after the required payment is confirmed.' };
    }
  }

  return { canDownload: true, reason: '' };
}

export function calculateProjectProgress(project: any): number {
  let progress = 0;

  // 1. Client Profile (+5)
  if (project.clientProfile) {
    const p = project.clientProfile;
    if (p.clientName?.trim() || p.companyName?.trim() || p.industry?.trim()) {
      progress += 5;
    }
  }

  // 2. Discovery (+10)
  if (project.discovery) {
    const d = project.discovery;
    const hasRequired =
      d.whatBusinessDoes?.trim() &&
      d.targetCustomer?.trim() &&
      d.whyChooseUs?.trim() &&
      d.brandFeeling?.trim() &&
      d.audienceArchetype?.trim();

    if (
      hasRequired &&
      d.emotions?.length > 0 &&
      d.competitors?.length > 0 &&
      d.visualStyles?.length > 0
    ) {
      progress += 10;
    }
  }

  // 3. Brand DNA (+10)
  if (project.brandDNA) {
    const b = project.brandDNA;
    const hasFields =
      b.brandPersonalityCluster?.trim() ||
      b.businessSummary?.trim() ||
      b.targetAudienceSummary?.trim() ||
      b.positioningSummary?.trim() ||
      b.brandFeelingSummary?.trim() ||
      b.visualDirectionSummary?.trim();
    if (hasFields) {
      progress += 10;
    }
  }

  // 4. Advance Paid (+10)
  const advanceMilestone = project.paymentMilestones?.find(
    (m: any) => m.type === 'advance' && m.status === 'paid'
  );
  if (advanceMilestone) {
    progress += 10;
  }

  // 5. Moodboards (+5 for having any, +5 for having a selected one)
  if (project.moodboards && project.moodboards.length > 0) {
    progress += 5;
    if (project.moodboards.some((m: any) => m.isSelected)) {
      progress += 5;
    }
  }

  // 6. Concepts (+15 for approved, or +5 for shared)
  if (project.concepts && project.concepts.length > 0) {
    if (project.concepts.some((c: any) => c.status === 'approved')) {
      progress += 15;
    } else if (project.concepts.some((c: any) => c.status === 'shared')) {
      progress += 5;
    }
  }

  // 7. Signed Agreement (+10)
  if (project.projectAgreement) {
    const a = project.projectAgreement;
    if (a.signedAt && ['signed', 'active', 'completed'].includes(a.status)) {
      progress += 10;
    }
  }

  // 8. Mid Milestone Paid (+5)
  const midMilestone = project.paymentMilestones?.find(
    (m: any) => m.type === 'mid' && m.status === 'paid'
  );
  if (midMilestone) {
    progress += 5;
  }

  // 9. Deliverables (+10 for shared)
  if (project.deliverables && project.deliverables.some((d: any) => d.status === 'shared')) {
    progress += 10;
  }

  // 10. Final Milestone Paid (+10)
  const finalMilestone = project.paymentMilestones?.find(
    (m: any) => m.type === 'final' && m.status === 'paid'
  );
  if (finalMilestone) {
    progress += 10;
  }

  // 11. Client Signed Off (+5)
  if (project.clientSignedOff) {
    progress += 5;
  }

  return Math.min(100, progress);
}

export function calculateProjectWorkflowStatus(project: any): string {
  if (project.clientSignedOff || project.status === 'delivered') {
    return 'delivered';
  }

  const finalPaid = project.paymentMilestones?.some(
    (m: any) => m.type === 'final' && m.status === 'paid'
  );
  if (finalPaid) return 'final_paid';

  const hasSharedDeliverable = project.deliverables?.some((d: any) => d.status === 'shared');
  if (hasSharedDeliverable) return 'deliverables';

  const midPaid = project.paymentMilestones?.some(
    (m: any) => m.type === 'mid' && m.status === 'paid'
  );
  if (midPaid) return 'mid_paid';

  const agreementSigned =
    project.projectAgreement?.signedAt &&
    ['signed', 'active', 'completed'].includes(project.projectAgreement.status);
  if (agreementSigned) return 'agreement';

  const hasApprovedConcept = project.concepts?.some((c: any) => c.status === 'approved');
  if (hasApprovedConcept) return 'concepts';

  const hasSelectedMoodboard = project.moodboards?.some((m: any) => m.isSelected);
  if (hasSelectedMoodboard) return 'moodboards';

  if (project.brandDNA?.brandPersonalityCluster) return 'brand_dna';

  const advancePaid = project.paymentMilestones?.some(
    (m: any) => m.type === 'advance' && m.status === 'paid'
  );
  if (advancePaid) return 'advance_paid';

  if (project.discovery?.submittedAt) return 'discovery';

  return 'created';
}

export async function recalculatePaymentMilestones(projectId: string, session?: ClientSession) {
  const projectQuery = Project.findById(projectId).populate([
    'paymentMilestones',
    'concepts',
    'deliverables',
  ]);
  if (session) projectQuery.session(session);

  const project = await projectQuery.exec();
  if (!project) return;

  const milestones = (project as any).paymentMilestones || [];
  const advance = milestones.find((m: any) => m.type === 'advance');
  const mid = milestones.find((m: any) => m.type === 'mid');
  const final = milestones.find((m: any) => m.type === 'final');

  const concepts = (project as any).concepts || [];
  const deliverables = (project as any).deliverables || [];

  const hasApprovedConcept = concepts.some((c: any) => c.status === 'approved');
  const hasSharedDeliverable = deliverables.some((d: any) => d.status === 'shared');

  const midUnlocked = Boolean(advance && advance.status === 'paid' && hasApprovedConcept);
  const finalUnlocked = Boolean(mid && mid.status === 'paid' && hasSharedDeliverable);

  if (mid && ['locked', 'ready'].includes(mid.status)) {
    const nextMidStatus = midUnlocked ? 'ready' : 'locked';
    if (mid.status !== nextMidStatus) {
      await PaymentMilestone.findByIdAndUpdate(
        mid._id || mid.id,
        { status: nextMidStatus },
        { session }
      );
    }
  }

  if (final && ['locked', 'ready'].includes(final.status)) {
    const nextFinalStatus = finalUnlocked ? 'ready' : 'locked';
    if (final.status !== nextFinalStatus) {
      await PaymentMilestone.findByIdAndUpdate(
        final._id || final.id,
        { status: nextFinalStatus },
        { session }
      );
    }
  }
}

export async function updateProjectProgress(projectId: string, session?: ClientSession) {
  const projectQuery = Project.findById(projectId).populate([
    'clientProfile',
    'discovery',
    'brandDNA',
    'moodboards',
    'concepts',
    'deliverables',
    'projectAgreement',
    'paymentMilestones',
  ]);
  if (session) projectQuery.session(session);

  const project = await projectQuery.exec();
  if (project) {
    const newProgress = calculateProjectProgress(project);
    if (project.progress !== newProgress) {
      await Project.findByIdAndUpdate(projectId, { progress: newProgress }, { session });
    }
  }
}
