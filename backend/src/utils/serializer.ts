import type { IDeliverable, IMoodboard, IConcept, IPaymentMilestone, IProject } from '../models/index.js';
import { canClientDownloadDeliverable, type ProjectWithMilestones } from '../services/project.service.js';

/**
 * Transforms MongoDB / Prisma documents into Django REST Framework-compatible
 * snake_case JSON response objects expected by the Next.js frontend.
 */

export function serializeConsultant(consultant: any, baseUrl: string = '') {
  if (!consultant) return null;

  let avatarUrl: string | null = null;
  if (consultant.avatar) {
    avatarUrl = consultant.avatar.startsWith('http')
      ? consultant.avatar
      : `${baseUrl.replace(/\/+$/, '')}/${consultant.avatar.replace(/^\/+/, '')}`;
  }

  return {
    id: consultant.id,
    name: consultant.name,
    email: consultant.email,
    company: consultant.company || '',
    phone: consultant.phone || '',
    avatar: consultant.avatar || null,
    avatar_url: avatarUrl,
  };
}

export function serializeProject(project: any, workflowStatus?: string) {
  if (!project) return null;

  const clientName = project.client?.name || project.companyName || project.title || '';
  const clientEmail = project.client?.email || '';

  return {
    id: project.id,
    project_id: project.id,
    title: project.title,
    client_name: clientName,
    client_email: clientEmail,
    company_name: project.companyName,
    sector: project.sector,
    status: project.status,
    workflow_status: workflowStatus || project.status || 'created',
    project_value: project.projectValue,
    advance_percentage: project.advancePercentage,
    mid_percentage: project.midPercentage,
    final_percentage: project.finalPercentage,
    revision_limit: project.revisionLimit || '3 revisions',
    portal_token: project.portalToken,
    has_password: Boolean(project.portalPasswordHash),
    progress: project.progress || 0,
    client_signed_off: Boolean(project.clientSignedOff),
    signed_off_at: project.signedOffAt ? new Date(project.signedOffAt).toISOString() : null,
    is_archived: Boolean(project.isArchived),
    created_at: project.createdAt ? new Date(project.createdAt).toISOString() : null,
    updated_at: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
  };
}

export function serializeClientProfile(profile: any, isSubmitted?: boolean) {
  if (!profile) return null;
  const isCompleted =
    isSubmitted !== undefined
      ? Boolean(isSubmitted)
      : Boolean(
          profile.isCompleted ||
          profile.is_completed ||
          profile.yearStarted ||
          profile.location ||
          profile.phone ||
          profile.website
        );
  return {
    id: profile.id,
    project: profile.projectId,
    client_name: profile.clientName || '',
    company_name: profile.companyName || '',
    industry: profile.industry || '',
    year_started: profile.yearStarted || null,
    location: profile.location || '',
    phone: profile.phone || '',
    email: profile.email || '',
    website: profile.website || '',
    is_completed: isCompleted,
    created_at: profile.createdAt ? new Date(profile.createdAt).toISOString() : null,
    updated_at: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
  };
}

export function serializeDiscovery(discovery: any) {
  if (!discovery) return null;

  const sliders = (discovery.sliders || []).map((s: any) => ({
    slider_key: s.sliderKey || s.slider_key || '',
    left_label: s.leftLabel || s.left_label || '',
    right_label: s.rightLabel || s.right_label || '',
    value: s.value ?? 50,
  }));

  const competitors = (discovery.competitors || []).map((c: any) => ({
    name: c.name || '',
    rating: c.rating || 'neutral',
    reason: c.reason || '',
  }));

  const emotions = (discovery.emotions || []).map((e: any) =>
    typeof e === 'string' ? { emotion: e } : { emotion: e.emotion || '' }
  );

  const visualStyles = (discovery.visualStyles || []).map((v: any) =>
    typeof v === 'string' ? { style: v } : { style: v.style || '' }
  );

  return {
    id: discovery.id,
    project: discovery.projectId,
    what_business_does: discovery.whatBusinessDoes || '',
    target_customer: discovery.targetCustomer || '',
    why_choose_us: discovery.whyChooseUs || '',
    brand_feeling: discovery.brandFeeling || '',
    audience_archetype: discovery.audienceArchetype || '',
    submitted_at: discovery.submittedAt ? new Date(discovery.submittedAt).toISOString() : null,
    is_submitted: Boolean(discovery.submittedAt),
    sliders,
    emotions,
    competitors,
    top_competitors: competitors,
    visual_styles: visualStyles,
    created_at: discovery.createdAt ? new Date(discovery.createdAt).toISOString() : null,
    updated_at: discovery.updatedAt ? new Date(discovery.updatedAt).toISOString() : null,
  };
}

export function serializeBrandDNA(dna: any) {
  if (!dna) return null;
  return {
    id: dna.id,
    project: dna.projectId,
    brand_personality_cluster: dna.brandPersonalityCluster || '',
    business_summary: dna.businessSummary || '',
    target_audience_summary: dna.targetAudienceSummary || '',
    positioning_summary: dna.positioningSummary || '',
    brand_feeling_summary: dna.brandFeelingSummary || '',
    visual_direction_summary: dna.visualDirectionSummary || '',
    competitor_summary: dna.competitorSummary || '',
    generated_from_discovery: Boolean(dna.generatedFromDiscovery),
    created_at: dna.createdAt ? new Date(dna.createdAt).toISOString() : null,
    updated_at: dna.updatedAt ? new Date(dna.updatedAt).toISOString() : null,
  };
}

export function serializeClientPortalMoodboard(moodboard: IMoodboard | any, portalToken: string) {
  if (!moodboard) return null;
  const imageUrl = moodboard.image
    ? `/api/client-portal/${portalToken}/moodboards/${moodboard.id}/image/`
    : '';

  return {
    id: moodboard.id,
    title: moodboard.title,
    description: moodboard.description || '',
    image_url: imageUrl,
    is_selected: Boolean(moodboard.isSelected),
    is_shared: Boolean(moodboard.isShared),
    client_feedback: moodboard.clientFeedback || '',
    created_at: moodboard.createdAt ? new Date(moodboard.createdAt).toISOString() : null,
  };
}

export function serializeMoodboard(moodboard: any, baseUrl: string = '') {
  if (!moodboard) return null;
  const imageUrl = moodboard.image
    ? `/api/projects/${moodboard.projectId}/moodboards/${moodboard.id}/image/`
    : '';

  return {
    id: moodboard.id,
    project: moodboard.projectId,
    title: moodboard.title,
    description: moodboard.description || '',
    image: imageUrl,
    image_url: imageUrl,
    is_selected: Boolean(moodboard.isSelected),
    is_shared: Boolean(moodboard.isShared),
    client_feedback: moodboard.clientFeedback || '',
    created_at: moodboard.createdAt ? new Date(moodboard.createdAt).toISOString() : null,
    updated_at: moodboard.updatedAt ? new Date(moodboard.updatedAt).toISOString() : null,
  };
}

export function serializeClientPortalConcept(concept: IConcept | any, portalToken: string) {
  if (!concept) return null;
  const imageUrl = concept.image
    ? `/api/client-portal/${portalToken}/concepts/${concept.id}/image/`
    : '';
  const fileUrl = concept.file
    ? `/api/client-portal/${portalToken}/concepts/${concept.id}/file/`
    : '';

  return {
    id: concept.id,
    title: concept.title,
    description: concept.description || '',
    image: imageUrl,
    image_url: imageUrl,
    file: fileUrl,
    file_url: fileUrl,
    version: concept.version || 1,
    status: concept.status,
    client_feedback: concept.clientFeedback || '',
    created_at: concept.createdAt ? new Date(concept.createdAt).toISOString() : '',
    updated_at: concept.updatedAt ? new Date(concept.updatedAt).toISOString() : '',
  };
}

export function serializeConcept(concept: any, baseUrl: string = '') {
  if (!concept) return null;
  const imageUrl = concept.image
    ? `/api/projects/${concept.projectId}/concepts/${concept.id}/image/`
    : '';
  const fileUrl = concept.file
    ? `/api/projects/${concept.projectId}/concepts/${concept.id}/file/`
    : '';

  return {
    id: concept.id,
    project: concept.projectId,
    title: concept.title,
    description: concept.description || '',
    image: imageUrl,
    image_url: imageUrl,
    file: fileUrl,
    file_url: fileUrl,
    version: concept.version || 1,
    status: concept.status,
    client_feedback: concept.clientFeedback || '',
    created_at: concept.createdAt ? new Date(concept.createdAt).toISOString() : null,
    updated_at: concept.updatedAt ? new Date(concept.updatedAt).toISOString() : null,
  };
}

export function serializeClientPortalDeliverable(
  deliverable: IDeliverable | any,
  project: ProjectWithMilestones | any
) {
  if (!deliverable) return null;

  const { canDownload, reason } = canClientDownloadDeliverable(project, deliverable);
  const fileName = deliverable.file ? deliverable.file.split(/[\\/]/).pop() || '' : '';
  const fileUrl = canDownload && deliverable.file
    ? `/api/client-portal/${project.portalToken}/deliverables/${deliverable.id}/file/`
    : null;

  return {
    id: deliverable.id,
    title: deliverable.title,
    description: deliverable.description || '',
    file_url: fileUrl,
    file_name: fileName,
    file_size: 0,
    status: deliverable.status,
    can_download: canDownload,
    download_locked_reason: reason,
    created_at: deliverable.createdAt ? new Date(deliverable.createdAt).toISOString() : null,
    updated_at: deliverable.updatedAt ? new Date(deliverable.updatedAt).toISOString() : null,
  };
}

export function serializeDeliverable(deliverable: any, baseUrl: string = '') {
  if (!deliverable) return null;
  const fileUrl = deliverable.file
    ? `/api/projects/${deliverable.projectId}/deliverables/${deliverable.id}/file/`
    : '';

  const fileName = deliverable.file ? deliverable.file.split(/[\\/]/).pop() || '' : '';

  return {
    id: deliverable.id,
    project: deliverable.projectId,
    title: deliverable.title,
    description: deliverable.description || '',
    file: fileUrl,
    file_url: fileUrl,
    file_name: fileName,
    status: deliverable.status,
    created_at: deliverable.createdAt ? new Date(deliverable.createdAt).toISOString() : null,
    updated_at: deliverable.updatedAt ? new Date(deliverable.updatedAt).toISOString() : null,
  };
}

export function serializePaymentMilestone(milestone: any) {
  if (!milestone) return null;
  return {
    id: milestone.id,
    project: milestone.projectId,
    type: milestone.type,
    percentage: milestone.percentage,
    amount: Number(milestone.amount || 0).toFixed(2),
    status: milestone.status,
    requested_at: milestone.requestedAt ? new Date(milestone.requestedAt).toISOString() : null,
    paid_at: milestone.paidAt ? new Date(milestone.paidAt).toISOString() : null,
    created_at: milestone.createdAt ? new Date(milestone.createdAt).toISOString() : null,
    updated_at: milestone.updatedAt ? new Date(milestone.updatedAt).toISOString() : null,
  };
}

export function serializeProjectActivity(activity: any) {
  if (!activity) return null;
  let metadata = {};
  if (activity.metadata) {
    try {
      metadata = typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata;
    } catch {
      metadata = {};
    }
  }

  const projectName = activity.project?.companyName || activity.project?.title || '';

  return {
    id: activity.id,
    project: activity.projectId,
    project_id: activity.projectId,
    project_name: projectName,
    consultant: activity.consultantId,
    actor_type: activity.actorType,
    action: activity.action,
    description: activity.description || '',
    metadata,
    is_read: Boolean(activity.isRead),
    read_at: activity.readAt ? new Date(activity.readAt).toISOString() : null,
    visible_to_client: Boolean(activity.visibleToClient),
    client_is_read: Boolean(activity.clientIsRead),
    client_read_at: activity.clientReadAt ? new Date(activity.clientReadAt).toISOString() : null,
    created_at: activity.createdAt ? new Date(activity.createdAt).toISOString() : null,
  };
}

export function serializeClientPortalActivity(activity: any) {
  if (!activity) return null;
  let rawMetadata: Record<string, any> = {};
  if (activity.metadata) {
    try {
      rawMetadata = typeof activity.metadata === 'string' ? JSON.parse(activity.metadata) : activity.metadata;
    } catch {
      rawMetadata = {};
    }
  }

  // Sanitize metadata to exclude any internal consultant or server keys
  const sanitizedMetadata: Record<string, any> = {};
  const INTERNAL_KEYS = new Set(['consultant_id', 'consultantId', 'internal_notes', 'internalNotes', 'raw_payload']);
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (!INTERNAL_KEYS.has(key)) {
      sanitizedMetadata[key] = value;
    }
  }

  return {
    id: activity.id,
    action: activity.action,
    description: activity.description || '',
    metadata: sanitizedMetadata,
    client_is_read: Boolean(activity.clientIsRead),
    client_read_at: activity.clientReadAt ? new Date(activity.clientReadAt).toISOString() : null,
    created_at: activity.createdAt ? new Date(activity.createdAt).toISOString() : null,
  };
}

export function getAppendixDetails(appendix: any) {
  let content: any = {};
  if (appendix.content) {
    try {
      content = typeof appendix.content === 'string' ? JSON.parse(appendix.content) : appendix.content;
    } catch {
      content = {};
    }
  }
  const metadata = content.metadata || {};
  const eventType = appendix.eventType || appendix.event_type;
  const title = appendix.title || '';

  if (eventType === 'discovery_submitted' || eventType === 'discovery_updated') {
    return { heading: 'Discovery Completed', lines: ['Discovery questionnaire completed.'], verb: 'Completed on:' };
  }
  if (eventType === 'brand_dna_generated') {
    return { heading: 'Brand DNA Generated', lines: ['Brand DNA generated.'], verb: 'Generated on:' };
  }
  if (eventType === 'moodboard_selected') {
    const moodboardTitle = metadata.moodboard_title || 'Selected moodboard';
    return { heading: 'Moodboard Approval', lines: ['Client selected moodboard:', moodboardTitle], verb: 'Approved on:' };
  }
  if (eventType === 'concept_approved') {
    const conceptTitle = metadata.concept_title || 'Approved concept';
    return { heading: 'Concept Approval', lines: ['Client approved concept:', conceptTitle], verb: 'Approved on:' };
  }
  if (eventType === 'concept_changes_requested') {
    const conceptTitle = metadata.concept_title || 'Concept';
    const feedback = metadata.feedback;
    const lines = ['Client requested revisions for concept:', conceptTitle];
    if (feedback) lines.push('Client feedback:', feedback);
    return { heading: 'Concept Revision Request', lines, verb: 'Requested on:' };
  }
  if (eventType === 'deliverable_shared' || eventType === 'deliverable_reshared') {
    const deliverableTitle = metadata.deliverable_title;
    const lines = ['Deliverables shared with client.'];
    if (deliverableTitle) lines.push('Deliverable:', deliverableTitle);
    return { heading: 'Deliverables Shared', lines, verb: 'Shared on:' };
  }
  if (eventType === 'deliverable_downloaded') {
    const deliverableTitle = metadata.deliverable_title;
    const lines = ['Deliverables downloaded by client.'];
    if (deliverableTitle) lines.push('Deliverable:', deliverableTitle);
    return { heading: 'Deliverables Downloaded', lines, verb: 'Downloaded on:' };
  }
  if (eventType === 'project_signed_off') {
    return { heading: 'Project Sign-Off', lines: ['Project signed off by client.'], verb: 'Signed off on:' };
  }

  return {
    heading: title,
    lines: [content.timeline_entry || title],
    verb: 'Recorded on:',
  };
}

export function serializeProjectAgreement(agreement: any, req?: any, isClientPortal = false) {
  if (!agreement) return null;

  const pid = agreement.projectId || agreement.project?.id || agreement.project;
  const portalToken = agreement.project?.portalToken;

  let basicPdfUrl = '';
  let originalSignedPdfUrl = '';
  let signedPdfUrl = '';

  if (isClientPortal && portalToken) {
    basicPdfUrl = agreement.basicPdfFile ? `/api/client-portal/${portalToken}/agreement/pdf/?type=basic` : '';
    originalSignedPdfUrl = agreement.originalSignedPdfFile ? `/api/client-portal/${portalToken}/agreement/pdf/?type=original_signed` : '';
    signedPdfUrl = agreement.signedPdfFile ? `/api/client-portal/${portalToken}/agreement/pdf/?type=signed` : '';
  } else if (pid) {
    basicPdfUrl = agreement.basicPdfFile ? `/api/projects/${pid}/generated-agreement/pdf/?type=basic` : '';
    originalSignedPdfUrl = agreement.originalSignedPdfFile ? `/api/projects/${pid}/generated-agreement/pdf/?type=original_signed` : '';
    signedPdfUrl = agreement.signedPdfFile ? `/api/projects/${pid}/generated-agreement/pdf/?type=signed` : '';
  }

  const appendices = Array.isArray(agreement.appendices) ? agreement.appendices : [];
  const versionHistory: Array<{
    version: number;
    label: string;
    event_type: string;
    title: string;
    created_at: string | null;
  }> = [];

  if (agreement.signedAt) {
    versionHistory.push({
      version: 1,
      label: 'Agreement v1 - Basic Agreement Signed',
      event_type: 'agreement_signed',
      title: 'Agreement signed',
      created_at: new Date(agreement.signedAt).toISOString(),
    });
  }

  const startIndex = agreement.signedAt ? 2 : 1;
  appendices.forEach((appendix: any, idx: number) => {
    const versionNumber = startIndex + idx;
    const details = getAppendixDetails(appendix);
    versionHistory.push({
      version: versionNumber,
      label: `Agreement v${versionNumber} - ${details.heading}`,
      event_type: appendix.eventType || appendix.event_type || '',
      title: details.heading,
      created_at: appendix.createdAt ? new Date(appendix.createdAt).toISOString() : null,
    });
  });

  const lastUpdatedAt = appendices.length > 0
    ? (appendices[appendices.length - 1].createdAt ? new Date(appendices[appendices.length - 1].createdAt).toISOString() : null)
    : (agreement.updatedAt ? new Date(agreement.updatedAt).toISOString() : null);

  let signatureMetadata: any = {};
  if (agreement.signatureMetadata) {
    try {
      signatureMetadata = typeof agreement.signatureMetadata === 'string'
        ? JSON.parse(agreement.signatureMetadata)
        : agreement.signatureMetadata;
    } catch {
      signatureMetadata = {};
    }
  }

  return {
    id: agreement.id,
    project: pid,
    status: agreement.status,
    current_version: versionHistory.length || 1,
    last_updated_at: lastUpdatedAt,
    basic_pdf_url: basicPdfUrl,
    original_signed_pdf_url: originalSignedPdfUrl,
    signed_pdf_url: signedPdfUrl,
    generated_at: agreement.generatedAt ? new Date(agreement.generatedAt).toISOString() : null,
    shared_at: agreement.sharedAt ? new Date(agreement.sharedAt).toISOString() : null,
    signature_requested_at: agreement.signatureRequestedAt ? new Date(agreement.signatureRequestedAt).toISOString() : null,
    signature_request_email_failed_at: agreement.signatureRequestEmailFailedAt ? new Date(agreement.signatureRequestEmailFailedAt).toISOString() : null,
    signature_request_email_error: agreement.signatureRequestEmailError || '',
    signed_at: agreement.signedAt ? new Date(agreement.signedAt).toISOString() : null,
    signed_email_failed_at: agreement.signedEmailFailedAt ? new Date(agreement.signedEmailFailedAt).toISOString() : null,
    signed_email_error: agreement.signedEmailError || '',
    signer_name: agreement.signerName || '',
    signature_method: agreement.signatureMethod || null,
    signature_metadata: signatureMetadata,
    version_history: versionHistory,
    created_at: agreement.createdAt ? new Date(agreement.createdAt).toISOString() : null,
    updated_at: agreement.updatedAt ? new Date(agreement.updatedAt).toISOString() : null,
    file_url: pid ? `/api/projects/${pid}/agreement/file/` : '',
  };
}

