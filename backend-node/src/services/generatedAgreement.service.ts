import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma/client.js';
import { ENV } from '../config/env.js';
import { generateGeneratedAgreementPdf } from './pdf.service.js';
import { logProjectActivity, updateProjectProgress } from './project.service.js';

export function isCompleteDiscoverySnapshot(discovery: any): boolean {
  if (!discovery) return false;

  const whatBusinessDoes = (discovery.whatBusinessDoes || discovery.what_business_does || '').trim();
  const targetCustomer = (discovery.targetCustomer || discovery.target_customer || '').trim();
  const whyChooseUs = (discovery.whyChooseUs || discovery.why_choose_us || '').trim();
  const brandFeeling = (discovery.brandFeeling || discovery.brand_feeling || '').trim();
  const audienceArchetype = (discovery.audienceArchetype || discovery.audience_archetype || '').trim();

  if (!whatBusinessDoes || !targetCustomer || !whyChooseUs || !brandFeeling || !audienceArchetype) {
    return false;
  }

  const emotions = discovery.emotions || [];
  const competitors = discovery.competitors || [];
  const visualStyles = discovery.visualStyles || discovery.visual_styles || [];

  return (
    Array.isArray(emotions) &&
    emotions.length > 0 &&
    Array.isArray(competitors) &&
    competitors.length > 0 &&
    Array.isArray(visualStyles) &&
    visualStyles.length > 0
  );
}

export function agreementSnapshotCore(snapshot: any): Record<string, any> {
  if (!snapshot || typeof snapshot !== 'object') return {};
  const core: Record<string, any> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key !== 'generated_at' && key !== 'version' && key !== 'pdf_generated_at') {
      core[key] = value;
    }
  }
  return core;
}

export async function buildAgreementSnapshotData(project: any, generatedAt: Date, version: number) {
  const profile = await prisma.clientProfile.findUnique({
    where: { projectId: project.id },
  });

  const discovery = await prisma.projectDiscovery.findUnique({
    where: { projectId: project.id },
  });

  const brandDna = await prisma.brandDNA.findUnique({
    where: { projectId: project.id },
  });

  const selectedMoodboard = await prisma.moodboard.findFirst({
    where: { projectId: project.id, isSelected: true },
  });

  const approvedConcepts = await prisma.concept.findMany({
    where: { projectId: project.id, status: 'approved' },
    orderBy: { createdAt: 'asc' },
  });

  const requestedConcepts = await prisma.concept.findMany({
    where: { projectId: project.id, status: 'changes_requested' },
    orderBy: { createdAt: 'asc' },
  });

  const evidenceActions = [
    'discovery_submitted',
    'discovery_updated',
    'moodboard_selected',
    'concept_approved',
    'concept_changes_requested',
    'agreement_shared',
    'agreement_downloaded',
    'agreement_accepted',
    'project_signed_off',
  ];

  const evidenceActivities = await prisma.projectActivity.findMany({
    where: {
      projectId: project.id,
      action: { in: evidenceActions },
    },
    orderBy: { createdAt: 'asc' },
  });

  const evidence = evidenceActivities.map((activity) => {
    let metadata: any = {};
    if (activity.metadata) {
      if (typeof activity.metadata === 'string') {
        try {
          metadata = JSON.parse(activity.metadata);
        } catch {
          metadata = {};
        }
      } else {
        metadata = activity.metadata;
      }
    }
    return {
      id: activity.id,
      actor_type: activity.actorType,
      action: activity.action,
      description: activity.description,
      created_at: activity.createdAt.toISOString(),
      metadata,
    };
  });

  const approvalActivitiesMap = new Map<string, any>();
  for (const act of evidenceActivities) {
    if (act.action === 'concept_approved') {
      let meta: any = {};
      if (typeof act.metadata === 'string') {
        try {
          meta = JSON.parse(act.metadata);
        } catch {}
      } else if (act.metadata) {
        meta = act.metadata;
      }
      if (meta?.concept_id) {
        approvalActivitiesMap.set(meta.concept_id, act);
      }
    }
  }

  let moodboardSelectedAt: string | null = null;
  if (selectedMoodboard) {
    const mbActivity = await prisma.projectActivity.findFirst({
      where: {
        projectId: project.id,
        action: 'moodboard_selected',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (mbActivity) {
      moodboardSelectedAt = mbActivity.createdAt.toISOString();
    }
  }

  const paymentMilestones = await prisma.paymentMilestone.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
  });

  const deliverables = await prisma.deliverable.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'asc' },
  });

  let consultant = project.consultant;
  if (!consultant && project.consultantId) {
    consultant = await prisma.consultant.findUnique({
      where: { id: project.consultantId },
    });
  }

  let clientUser = project.client;
  if (!clientUser && project.clientId) {
    clientUser = await prisma.client.findUnique({
      where: { id: project.clientId },
    });
  }

  return {
    version,
    status: 'draft',
    generated_at: generatedAt.toISOString(),
    project: {
      id: project.id,
      title: project.title,
      company_name: project.companyName || profile?.companyName || '',
      sector: project.sector || '',
      project_value: project.projectValue ? String(project.projectValue) : '0',
      created_at: project.createdAt ? project.createdAt.toISOString() : generatedAt.toISOString(),
    },
    client: {
      id: project.clientId || '',
      name: profile?.clientName || clientUser?.name || '',
      email: profile?.email || clientUser?.email || '',
      company_name: profile?.companyName || project.companyName || '',
      industry: profile?.industry || project.sector || '',
      phone: profile?.phone || '',
      website: profile?.website || '',
    },
    consultant: {
      id: project.consultantId || '',
      name: consultant?.name || '',
      email: consultant?.email || '',
      company: consultant?.company || '',
    },
    discovery: discovery
      ? {
          id: discovery.id,
          what_business_does: discovery.whatBusinessDoes || '',
          target_customer: discovery.targetCustomer || '',
          why_choose_us: discovery.whyChooseUs || '',
          brand_feeling: discovery.brandFeeling || '',
          audience_archetype: discovery.audienceArchetype || '',
          emotions: discovery.emotions || [],
          visual_styles: discovery.visualStyles || [],
          competitors: (discovery.competitors || []).map((c: any) => ({
            name: c.name || '',
            rating: c.rating || 'neutral',
            reason: c.reason || '',
          })),
          updated_at: discovery.updatedAt ? discovery.updatedAt.toISOString() : null,
        }
      : null,
    brand_dna: {
      personality_cluster: brandDna?.brandPersonalityCluster || '',
      business_summary: brandDna?.businessSummary || '',
      target_audience_summary: brandDna?.targetAudienceSummary || '',
      positioning_summary: brandDna?.positioningSummary || '',
      brand_feeling_summary: brandDna?.brandFeelingSummary || '',
      visual_direction_summary: brandDna?.visualDirectionSummary || '',
      competitor_summary: brandDna?.competitorSummary || '',
    },
    selected_moodboard: selectedMoodboard
      ? {
          id: selectedMoodboard.id,
          title: selectedMoodboard.title,
          description: selectedMoodboard.description || '',
          selected_at: moodboardSelectedAt,
        }
      : null,
    approved_concepts: approvedConcepts.map((c) => {
      const act = approvalActivitiesMap.get(c.id);
      return {
        id: c.id,
        title: c.title,
        description: c.description || '',
        version: c.version,
        status: c.status,
        feedback: c.clientFeedback || '',
        approved_at: act ? act.createdAt.toISOString() : c.updatedAt.toISOString(),
      };
    }),
    requested_concept_revisions: requestedConcepts.map((c) => ({
      id: c.id,
      title: c.title,
      version: c.version,
      status: c.status,
      feedback: c.clientFeedback || '',
    })),
    approval_evidence_timeline: evidence,
    payment_milestones: paymentMilestones.map((m) => ({
      id: m.id,
      type: m.type,
      percentage: m.percentage,
      amount: String(m.amount),
      status: m.status,
      requested_at: m.requestedAt ? m.requestedAt.toISOString() : null,
      paid_at: m.paidAt ? m.paidAt.toISOString() : null,
    })),
    expected_deliverables: deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description || '',
      status: d.status,
    })),
  };
}

export async function maybeGenerateAgreementSnapshot(projectId: string) {
  // 1. Check if any snapshot on project has status 'accepted' or 'locked'
  const lockedOrAccepted = await prisma.generatedAgreementSnapshot.findFirst({
    where: {
      projectId,
      status: { in: ['accepted', 'locked'] },
    },
  });
  if (lockedOrAccepted) {
    return null;
  }

  // 2. Fetch project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      consultant: true,
      client: true,
    },
  });
  if (!project) return null;

  // 3. Discovery must exist and be complete
  const discovery = await prisma.projectDiscovery.findUnique({
    where: { projectId },
  });
  if (!isCompleteDiscoverySnapshot(discovery)) {
    return null;
  }

  // 4. Moodboard selected
  const moodboardSelected = await prisma.moodboard.findFirst({
    where: { projectId, isSelected: true },
  });
  if (!moodboardSelected) {
    return null;
  }

  // 5. Concept approved
  const conceptApproved = await prisma.concept.findFirst({
    where: { projectId, status: 'approved' },
  });
  if (!conceptApproved) {
    return null;
  }

  // 6. Find latest draft
  const latestDraft = await prisma.generatedAgreementSnapshot.findFirst({
    where: { projectId, status: 'draft' },
    orderBy: { version: 'desc' },
  });

  const nextVersion = latestDraft ? latestDraft.version + 1 : 1;
  const now = new Date();
  const candidateSnapshot = await buildAgreementSnapshotData(project, now, nextVersion);

  if (latestDraft) {
    let existingData: any = {};
    try {
      existingData = typeof latestDraft.snapshot === 'string' ? JSON.parse(latestDraft.snapshot) : latestDraft.snapshot;
    } catch {
      existingData = {};
    }
    if (JSON.stringify(agreementSnapshotCore(existingData)) === JSON.stringify(agreementSnapshotCore(candidateSnapshot))) {
      return latestDraft;
    }
  }

  // 7. Create new draft snapshot
  const draft = await prisma.generatedAgreementSnapshot.create({
    data: {
      projectId,
      version: nextVersion,
      status: 'draft',
      snapshot: JSON.stringify(candidateSnapshot),
      generatedAt: now,
    },
  });

  // 8. Log activity
  await logProjectActivity({
    projectId,
    consultantId: project.consultantId,
    actorType: 'system',
    action: 'agreement_draft_generated',
    description: `System generated agreement draft v${draft.version}.`,
    metadata: {
      generated_agreement_snapshot_id: draft.id,
      version: draft.version,
      status: draft.status,
    },
  });

  return draft;
}

export async function isGeneratedAgreementShared(snapshot: any, activities?: any[]): Promise<boolean> {
  if (!snapshot) return false;
  if (snapshot.status === 'accepted') return true;

  if (activities) {
    return activities.some((act) => {
      if (act.action !== 'agreement_shared') return false;
      let meta: any = {};
      if (typeof act.metadata === 'string') {
        try {
          meta = JSON.parse(act.metadata);
        } catch {}
      } else if (act.metadata) {
        meta = act.metadata;
      }
      return meta.agreement_version === snapshot.version || meta.version === snapshot.version;
    });
  }

  const sharedActivities = await prisma.projectActivity.findMany({
    where: {
      projectId: snapshot.projectId,
      action: 'agreement_shared',
    },
  });

  return sharedActivities.some((act) => {
    let meta: any = {};
    if (typeof act.metadata === 'string') {
      try {
        meta = JSON.parse(act.metadata);
      } catch {}
    } else if (act.metadata) {
      meta = act.metadata;
    }
    return meta.agreement_version === snapshot.version || meta.version === snapshot.version;
  });
}

export async function getGeneratedAgreementHistory(projectId: string) {
  const snapshots = await prisma.generatedAgreementSnapshot.findMany({
    where: { projectId },
    orderBy: { version: 'desc' },
  });

  const sharedActivities = await prisma.projectActivity.findMany({
    where: { projectId, action: 'agreement_shared' },
  });

  const history = [];
  for (const item of snapshots) {
    const shared = await isGeneratedAgreementShared(item, sharedActivities);
    history.push({
      id: item.id,
      version: item.version,
      status: item.status,
      generated_at: item.generatedAt.toISOString(),
      pdf_generated_at: item.pdfGeneratedAt ? item.pdfGeneratedAt.toISOString() : null,
      accepted_at: item.acceptedAt ? item.acceptedAt.toISOString() : null,
      shared,
    });
  }
  return history;
}

export async function getGeneratedAgreementPayload(snapshot: any, pdfUrl: string) {
  if (!snapshot) return null;
  const shared = await isGeneratedAgreementShared(snapshot);
  const history = await getGeneratedAgreementHistory(snapshot.projectId);

  return {
    id: snapshot.id,
    version: snapshot.version,
    status: snapshot.status,
    generated_at: snapshot.generatedAt.toISOString(),
    pdf_generated_at: snapshot.pdfGeneratedAt ? snapshot.pdfGeneratedAt.toISOString() : null,
    accepted_at: snapshot.acceptedAt ? snapshot.acceptedAt.toISOString() : null,
    pdf_url: pdfUrl,
    shared,
    history,
  };
}

export async function saveAgreementSnapshotPdf(snapshot: any) {
  const generatedAt = new Date();
  let parsedSnapshot: any = {};
  if (typeof snapshot.snapshot === 'string') {
    try {
      parsedSnapshot = JSON.parse(snapshot.snapshot);
    } catch {
      parsedSnapshot = {};
    }
  } else {
    parsedSnapshot = snapshot.snapshot || {};
  }

  parsedSnapshot.status = snapshot.status;
  parsedSnapshot.pdf_generated_at = generatedAt.toISOString();

  const pdfBytes = await generateGeneratedAgreementPdf(parsedSnapshot);

  const projectFolder = `project_${snapshot.projectId}`;
  const relativeDir = path.join('generated_agreements', projectFolder);
  const targetDir = path.resolve(ENV.MEDIA_ROOT, relativeDir);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const fileName = `agreement_v${snapshot.version}.pdf`;
  const fullFilePath = path.join(targetDir, fileName);
  fs.writeFileSync(fullFilePath, pdfBytes);

  const dbRelativePath = `generated_agreements/${projectFolder}/${fileName}`;

  const updated = await prisma.generatedAgreementSnapshot.update({
    where: { id: snapshot.id },
    data: {
      snapshot: JSON.stringify(parsedSnapshot),
      pdfFile: dbRelativePath,
      pdfGeneratedAt: generatedAt,
    },
  });

  return updated;
}

export async function generateAgreementSnapshotPdf(snapshot: any) {
  if (snapshot.status !== 'draft') {
    throw new Error('Only draft generated agreements can be regenerated.');
  }
  return saveAgreementSnapshotPdf(snapshot);
}

export async function acceptGeneratedAgreement(
  project: any,
  snapshot: any,
  clientEvidence: { ipAddress?: string; userAgent?: string; ip_address?: string; user_agent?: string } = {}
) {
  if (snapshot.status !== 'draft') {
    throw new Error('ALREADY_ACCEPTED');
  }

  const acceptedAt = new Date();
  const updateResult = await prisma.generatedAgreementSnapshot.updateMany({
    where: {
      id: snapshot.id,
      status: 'draft',
    },
    data: {
      status: 'accepted',
      acceptedAt: acceptedAt,
    },
  });

  if (updateResult.count === 0) {
    throw new Error('ALREADY_ACCEPTED');
  }

  await logProjectActivity({
    projectId: project.id,
    consultantId: project.consultantId,
    actorType: 'client',
    action: 'agreement_accepted',
    description: `Client accepted generated agreement v${snapshot.version}.`,
    metadata: {
      ...clientEvidence,
      generated_agreement_snapshot_id: snapshot.id,
      agreement_version: snapshot.version,
      accepted_at: acceptedAt.toISOString(),
    },
    visibleToClient: true,
  });

  const updatedSnapshotData = await buildAgreementSnapshotData(project, acceptedAt, snapshot.version);
  updatedSnapshotData.status = 'accepted';
  (updatedSnapshotData as any).accepted_at = acceptedAt.toISOString();

  snapshot.status = 'accepted';
  snapshot.acceptedAt = acceptedAt;
  snapshot.snapshot = JSON.stringify(updatedSnapshotData);

  const updatedSnapshot = await saveAgreementSnapshotPdf(snapshot);

  try {
    await updateProjectProgress(project.id);
  } catch (err) {
    console.warn('Failed to update project progress on agreement acceptance:', err);
  }

  return updatedSnapshot;
}
