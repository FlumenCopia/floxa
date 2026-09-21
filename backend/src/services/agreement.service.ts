import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env.js';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';
import { Consultant } from '../models/consultant.model.js';
import { ClientProfile } from '../models/clientProfile.model.js';
import { ProjectDiscovery } from '../models/discovery.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { Moodboard } from '../models/moodboard.model.js';
import { Concept } from '../models/concept.model.js';
import { Deliverable } from '../models/deliverable.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { GeneratedAgreementSnapshot, ProjectAgreement } from '../models/agreement.model.js';
import { generateGeneratedAgreementPdf } from './pdf.service.js';
import { logProjectActivity } from './activity.service.js';
import { updateProjectProgress } from './project.service.js';

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
  const projectId = project.id || project._id?.toString();

  const profile = await ClientProfile.findOne({ projectId });
  const discovery = await ProjectDiscovery.findOne({ projectId });
  const brandDna = await BrandDNA.findOne({ projectId });
  const selectedMoodboards = await Moodboard.find({ projectId, isSelected: true }).sort({ createdAt: 1 });
  const selectedMoodboard = selectedMoodboards[0] || null;
  const approvedConcepts = await Concept.find({ projectId, status: 'approved' }).sort({ createdAt: 1 });
  const requestedConcepts = await Concept.find({ projectId, status: 'changes_requested' }).sort({ createdAt: 1 });

  const evidenceActions = [
    'discovery_submitted',
    'discovery_updated',
    'moodboard_selected',
    'moodboard_deselected',
    'concept_approved',
    'concept_unapproved',
    'concept_changes_requested',
    'agreement_shared',
    'agreement_downloaded',
    'agreement_accepted',
    'project_signed_off',
  ];

  const evidenceActivities = await ProjectActivity.find({
    projectId,
    action: { $in: evidenceActions },
  }).sort({ createdAt: 1 });

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
      action: activity.action,
      created_at: activity.createdAt ? new Date(activity.createdAt).toISOString() : null,
      description: activity.description || '',
      metadata,
    };
  });

  const moodboardSelectionEvidence = [];
  for (const mb of selectedMoodboards) {
    const mbActivity = await ProjectActivity.findOne({
      projectId,
      action: 'moodboard_selected',
      metadata: new RegExp(mb.id, 'i'),
    }).sort({ createdAt: 1 });

    moodboardSelectionEvidence.push({
      moodboard_id: mb.id,
      title: mb.title,
      image: mb.image,
      selected_at: mbActivity?.createdAt ? new Date(mbActivity.createdAt).toISOString() : null,
    });
  }

  const paymentMilestones = await PaymentMilestone.find({ projectId }).sort({ createdAt: 1 });
  const deliverables = await Deliverable.find({ projectId }).sort({ createdAt: 1 });

  let consultant = project.consultant;
  let clientUser = project.client;

  if (!consultant && project.consultantId) {
    consultant = await Consultant.findById(project.consultantId);
  }
  if (!clientUser && project.clientId) {
    clientUser = await Client.findById(project.clientId);
  }

  return {
    version,
    generated_at: generatedAt.toISOString(),
    project: {
      id: projectId,
      title: project.title,
      company_name: project.companyName,
      sector: project.sector,
      status: project.status,
      project_value: project.projectValue,
      portal_token: project.portalToken,
      advance_percentage: project.advancePercentage,
      mid_percentage: project.midPercentage,
      final_percentage: project.finalPercentage,
      revision_limit: project.revisionLimit,
    },
    consultant: consultant
      ? {
          id: consultant.id,
          name: consultant.name,
          email: consultant.email,
          company: consultant.company || '',
          phone: consultant.phone || '',
        }
      : null,
    client: clientUser
      ? {
          id: clientUser.id,
          name: clientUser.name,
          email: clientUser.email,
          company_name: clientUser.companyName,
          sector: clientUser.sector,
        }
      : null,
    client_profile: profile
      ? {
          id: profile.id,
          client_name: profile.clientName,
          company_name: profile.companyName,
          industry: profile.industry,
          year_started: profile.yearStarted,
          location: profile.location,
          phone: profile.phone,
          email: profile.email,
          website: profile.website,
        }
      : null,
    discovery: discovery
      ? {
          id: discovery.id,
          what_business_does: discovery.whatBusinessDoes,
          target_customer: discovery.targetCustomer,
          why_choose_us: discovery.whyChooseUs,
          brand_feeling: discovery.brandFeeling,
          audience_archetype: discovery.audienceArchetype,
          submitted_at: discovery.submittedAt ? new Date(discovery.submittedAt).toISOString() : null,
          sliders: (discovery.sliders || []).map((s: any) => ({
            slider_key: s.sliderKey,
            left_label: s.leftLabel,
            right_label: s.rightLabel,
            value: s.value,
          })),
          emotions: discovery.emotions || [],
          competitors: (discovery.competitors || []).map((c: any) => ({
            name: c.name,
            rating: c.rating,
            reason: c.reason,
          })),
          visual_styles: discovery.visualStyles || [],
        }
      : null,
    brand_dna: brandDna
      ? {
          id: brandDna.id,
          brand_personality_cluster: brandDna.brandPersonalityCluster,
          business_summary: brandDna.businessSummary,
          target_audience_summary: brandDna.targetAudienceSummary,
          positioning_summary: brandDna.positioningSummary,
          brand_feeling_summary: brandDna.brandFeelingSummary,
          visual_direction_summary: brandDna.visualDirectionSummary,
          competitor_summary: brandDna.competitorSummary,
          generated_from_discovery: brandDna.generatedFromDiscovery,
        }
      : null,
    moodboard_selection: moodboardSelectionEvidence,
    approved_concepts: approvedConcepts.map((c: any) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      version: c.version,
      status: c.status,
      image: c.image,
      file: c.file,
      client_feedback: c.clientFeedback,
    })),
    revision_requests: requestedConcepts.map((c: any) => ({
      id: c.id,
      title: c.title,
      version: c.version,
      client_feedback: c.clientFeedback,
    })),
    deliverables: deliverables.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      status: d.status,
    })),
    payment_milestones: paymentMilestones.map((pm: any) => ({
      id: pm.id,
      type: pm.type,
      percentage: pm.percentage,
      amount: pm.amount,
      status: pm.status,
      requested_at: pm.requestedAt ? new Date(pm.requestedAt).toISOString() : null,
      paid_at: pm.paidAt ? new Date(pm.paidAt).toISOString() : null,
    })),
    evidence,
  };
}

export async function maybeGenerateAgreementSnapshot(projectId: string) {
  const lockedOrAccepted = await GeneratedAgreementSnapshot.findOne({
    projectId,
    status: { $in: ['accepted', 'locked'] },
  });

  if (lockedOrAccepted) {
    return null;
  }

  const project = await Project.findById(projectId).populate(['client', 'consultant']);
  if (!project) return null;

  const discovery = await ProjectDiscovery.findOne({ projectId });
  if (!discovery || !discovery.submittedAt || !isCompleteDiscoverySnapshot(discovery)) {
    return null;
  }

  const moodboardSelected = await Moodboard.findOne({
    projectId,
    isSelected: true,
  });
  if (!moodboardSelected) {
    return null;
  }

  const conceptApproved = await Concept.findOne({
    projectId,
    status: 'approved',
  });
  if (!conceptApproved) {
    return null;
  }

  const latestDraft = await GeneratedAgreementSnapshot.findOne({
    projectId,
    status: 'draft',
  }).sort({ version: -1 });

  const now = new Date();
  const nextVersion = (latestDraft?.version || 0) + 1;
  const snapshotData = await buildAgreementSnapshotData(project, now, nextVersion);

  if (latestDraft) {
    let oldData: any = {};
    try {
      oldData = JSON.parse(latestDraft.snapshot);
    } catch {
      oldData = {};
    }

    const oldCore = agreementSnapshotCore(oldData);
    const newCore = agreementSnapshotCore(snapshotData);

    if (JSON.stringify(oldCore) === JSON.stringify(newCore)) {
      return latestDraft;
    }
  }

  const draft = await GeneratedAgreementSnapshot.create({
    projectId,
    version: nextVersion,
    status: 'draft',
    snapshot: JSON.stringify(snapshotData),
    generatedAt: now,
  });

  try {
    const pdfBuffer = await generateGeneratedAgreementPdf(snapshotData);
    const dir = path.resolve(ENV.MEDIA_ROOT, 'agreements', projectId);
    fs.mkdirSync(dir, { recursive: true });

    const relativePdfPath = `agreements/${projectId}/agreement_v${draft.version}.pdf`;
    const fullPdfPath = path.resolve(ENV.MEDIA_ROOT, relativePdfPath);
    fs.writeFileSync(fullPdfPath, pdfBuffer);

    draft.pdfFile = relativePdfPath;
    draft.pdfGeneratedAt = new Date();
    await draft.save();
  } catch (pdfErr) {
    console.error('Failed to generate PDF for agreement snapshot:', pdfErr);
  }

  await logProjectActivity({
    projectId,
    consultantId: String(project.consultantId),
    actorType: 'system',
    action: 'agreement_draft_generated',
    description: `System generated agreement draft v${draft.version}.`,
    metadata: {
      generated_agreement_snapshot_id: draft.id,
      version: draft.version,
      status: draft.status,
    },
    visibleToClient: false,
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

  const sharedActivities = await ProjectActivity.find({
    projectId: snapshot.projectId,
    action: 'agreement_shared',
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
  const snapshots = await GeneratedAgreementSnapshot.find({ projectId }).sort({ version: -1 });
  const sharedActivities = await ProjectActivity.find({ projectId, action: 'agreement_shared' });

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

  const updated = await GeneratedAgreementSnapshot.findByIdAndUpdate(
    snapshot.id,
    {
      $set: {
        snapshot: JSON.stringify(parsedSnapshot),
        pdfFile: dbRelativePath,
        pdfGeneratedAt: generatedAt,
      },
    },
    { new: true }
  );

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
  const updateResult = await GeneratedAgreementSnapshot.updateOne(
    {
      _id: snapshot.id,
      status: 'draft',
    },
    {
      $set: {
        status: 'accepted',
        acceptedAt: acceptedAt,
      },
    }
  );

  if (updateResult.matchedCount === 0) {
    throw new Error('ALREADY_ACCEPTED');
  }

  await logProjectActivity({
    projectId: project.id,
    consultantId: project.consultantId?.toString() || project.consultantId,
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

  const updatedSnapshotData: any = await buildAgreementSnapshotData(project, acceptedAt, snapshot.version);
  updatedSnapshotData.status = 'accepted';
  updatedSnapshotData.accepted_at = acceptedAt.toISOString();

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
