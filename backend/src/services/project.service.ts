import { prisma } from '../prisma/client.js';
import { Deliverable, PaymentMilestone, Project } from '@prisma/client';

export type ProjectWithMilestones = Project & {
  paymentMilestones?: PaymentMilestone[];
};

export function canClientDownloadDeliverable(
  project: ProjectWithMilestones | null | undefined,
  deliverable: Deliverable | null | undefined
): { canDownload: boolean; reason: string } {
  if (!project || !deliverable) {
    return { canDownload: false, reason: 'Deliverable unavailable.' };
  }

  if (project.isArchived) {
    return { canDownload: false, reason: 'Project is archived.' };
  }

  if (deliverable.projectId !== project.id) {
    return { canDownload: false, reason: 'Deliverable unavailable.' };
  }

  if (deliverable.status !== 'shared') {
    return { canDownload: false, reason: 'Deliverable is not shared with client.' };
  }

  const milestones = project.paymentMilestones || [];
  const finalMilestone = milestones.find((m) => m.type === 'final');

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

export async function recalculatePaymentMilestones(projectId: string, txClient?: any) {
  const db = txClient || prisma;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      paymentMilestones: true,
      concepts: true,
      deliverables: true,
    },
  });

  if (!project) return;

  const advance = project.paymentMilestones.find((m: any) => m.type === 'advance');
  const mid = project.paymentMilestones.find((m: any) => m.type === 'mid');
  const final = project.paymentMilestones.find((m: any) => m.type === 'final');

  const hasApprovedConcept = project.concepts.some((c: any) => c.status === 'approved');
  const hasSharedDeliverable = project.deliverables.some((d: any) => d.status === 'shared');

  const midUnlocked = Boolean(advance && advance.status === 'paid' && hasApprovedConcept);
  const finalUnlocked = Boolean(mid && mid.status === 'paid' && hasSharedDeliverable);

  if (mid && ['locked', 'ready'].includes(mid.status)) {
    const nextMidStatus = midUnlocked ? 'ready' : 'locked';
    if (mid.status !== nextMidStatus) {
      await db.paymentMilestone.update({
        where: { id: mid.id },
        data: { status: nextMidStatus },
      });
    }
  }

  if (final && ['locked', 'ready'].includes(final.status)) {
    const nextFinalStatus = finalUnlocked ? 'ready' : 'locked';
    if (final.status !== nextFinalStatus) {
      await db.paymentMilestone.update({
        where: { id: final.id },
        data: { status: nextFinalStatus },
      });
    }
  }
}

export async function updateProjectProgress(projectId: string, txClient?: any) {
  const db = txClient || prisma;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      paymentMilestones: true,
      concepts: true,
      deliverables: true,
      moodboards: true,
      brandDNA: true,
      projectAgreement: true,
    },
  });

  if (project) {
    const newProgress = calculateProjectProgress(project);
    if (project.progress !== newProgress) {
      await db.project.update({
        where: { id: projectId },
        data: { progress: newProgress },
      });
    }
  }
}

export async function logProjectActivity(
  params: {
    projectId: string;
    consultantId: string;
    actorType: 'client' | 'consultant' | 'system';
    action: string;
    description: string;
    metadata?: Record<string, any>;
    visibleToClient?: boolean;
    clientIsRead?: boolean;
  },
  txClient?: any
) {
  const db = txClient || prisma;
  return db.projectActivity.create({
    data: {
      projectId: params.projectId,
      consultantId: params.consultantId,
      actorType: params.actorType,
      action: params.action,
      description: params.description,
      metadata: JSON.stringify(params.metadata || {}),
      visibleToClient: params.visibleToClient ?? false,
      clientIsRead: params.clientIsRead ?? false,
    },
  });
}

export function buildBrandDNAData(project: any, discovery: any) {
  const profile = project.clientProfile;
  const companyName = profile?.companyName || project.companyName;
  const industry = profile?.industry || project.sector;

  const emotions = (discovery.emotions || []).join(', ') || 'clear, confident, and trustworthy';
  const visualStyles = (discovery.visualStyles || []).join(', ') || 'clean, intentional visual direction';
  const competitors = (discovery.competitors || [])
    .slice(0, 5)
    .map((c: any) => `${c.name} (${c.rating})`)
    .join(', ') || 'No competitor references submitted.';

  // Calculate slider cluster
  const sliders = discovery.sliders || [];
  let cluster = 'Bold Challenger';
  let cuesText = 'balanced, adaptable brand personality cues';

  if (sliders.length > 0) {
    const scores = sliders.map((s: any) => {
      const score = ((s.value || 50) / 100) * 6 - 3;
      return { score, distance: Math.abs(score) };
    });
    const avg = scores.reduce((sum: number, item: any) => sum + item.score, 0) / scores.length;
    if (avg < -1.5) cluster = 'Soft Minimalist';
    else if (avg < -0.4) cluster = 'Quiet Specialist';
    else if (avg < 0.8) cluster = 'Balanced Clarity';
    else if (avg < 2.1) cluster = 'Bold Challenger';
    else cluster = 'Electric Leader';
  }

  const archetype = cluster || discovery.audienceArchetype || 'Quality-focused audience';

  return {
    brandPersonalityCluster: archetype,
    businessSummary: `${companyName} should be presented as a focused ${industry} brand. The business is described as: ${discovery.whatBusinessDoes || 'Not submitted yet.'}`,
    targetAudienceSummary: `The brand should speak to ${discovery.targetCustomer || 'the target customer'}. Messaging and visuals should make the offer feel relevant, credible, and easy to choose.`,
    positioningSummary: `The core reason to choose this brand is: ${discovery.whyChooseUs || 'Not submitted yet.'} This should become the foundation for the brand's positioning and designer brief.`,
    brandFeelingSummary: `The brand should make people feel ${discovery.brandFeeling || 'confident and clear'}. Emotional cues to preserve include ${emotions}.`,
    visualDirectionSummary: `Recommended visual direction: ${visualStyles}. This should guide moodboards, typography, color, composition, and early concepts.`,
    competitorSummary: `Competitor notes: ${competitors}. Use these references to understand the client's taste, then build a distinct direction.`,
    generatedFromDiscovery: true,
  };
}
