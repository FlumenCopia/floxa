import { Request, Response, NextFunction } from 'express';
import { ProjectDiscovery } from '../models/discovery.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { Project } from '../models/project.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { buildBrandDNAData } from '../services/discovery.service.js';
import { generateAiBrandDNA } from '../services/gemini.service.js';
import { generateBrandDnaBriefPdf } from '../services/pdf.service.js';
import { calculateProjectProgress, logProjectActivity } from '../services/project.service.js';
import {
  serializeDiscovery,
  serializeBrandDNA,
} from '../utils/serializer.js';

export { getClientProfile, saveClientProfile, validateClientPhone } from './client.controller.js';

interface DiscoverySnapshot {
  what_business_does: string;
  target_customer: string;
  why_choose_us: string;
  brand_feeling: string;
  audience_archetype: string;
  emotions: string[];
  competitors: Array<{ name: string; rating?: string; reason?: string }>;
  visual_styles: string[];
}

function isCompleteDiscoverySnapshot(snapshot: DiscoverySnapshot | null): boolean {
  if (!snapshot) return false;

  const requiredTextFields: (keyof DiscoverySnapshot)[] = [
    'what_business_does',
    'target_customer',
    'why_choose_us',
    'brand_feeling',
    'audience_archetype',
  ];

  for (const field of requiredTextFields) {
    const val = snapshot[field];
    if (!val || typeof val !== 'string' || !val.trim()) {
      return false;
    }
  }

  if (!Array.isArray(snapshot.emotions) || snapshot.emotions.length === 0) {
    return false;
  }

  if (!Array.isArray(snapshot.competitors) || snapshot.competitors.length === 0) {
    return false;
  }

  const validComps = snapshot.competitors.filter((c) => c && c.name && c.name.trim());
  if (validComps.length === 0) {
    return false;
  }

  if (!Array.isArray(snapshot.visual_styles) || snapshot.visual_styles.length === 0) {
    return false;
  }

  return true;
}

function extractDiscoveryData(body: any, existingDiscovery: any) {
  const rawData: any = { ...(body || {}) };
  const basics = rawData.business_basics || rawData.basics || {};

  for (const k of ['whatDo', 'whatDoYouDo', 'businessDescription', 'business_description', 'what_business_does']) {
    if (basics[k] && !rawData.what_business_does) {
      rawData.what_business_does = basics[k];
      break;
    }
    if (rawData[k] && !rawData.what_business_does) {
      rawData.what_business_does = rawData[k];
      break;
    }
  }

  for (const k of ['targetCustomer', 'target_customer']) {
    if (basics[k] && !rawData.target_customer) {
      rawData.target_customer = basics[k];
      break;
    }
    if (rawData[k] && !rawData.target_customer) {
      rawData.target_customer = rawData[k];
      break;
    }
  }

  for (const k of ['whyChooseUs', 'whyChooseYou', 'why_choose_us']) {
    if (basics[k] && !rawData.why_choose_us) {
      rawData.why_choose_us = basics[k];
      break;
    }
    if (rawData[k] && !rawData.why_choose_us) {
      rawData.why_choose_us = rawData[k];
      break;
    }
  }

  for (const k of ['brandFeeling', 'whyTrustYou', 'brand_feeling']) {
    if (basics[k] && !rawData.brand_feeling) {
      rawData.brand_feeling = basics[k];
      break;
    }
    if (rawData[k] && !rawData.brand_feeling) {
      rawData.brand_feeling = rawData[k];
      break;
    }
  }

  for (const k of ['customer_archetype', 'persona', 'selectedAudience', 'audience_archetype']) {
    if (rawData[k]) {
      const val = rawData[k];
      rawData.audience_archetype = Array.isArray(val) ? val[0] : String(val);
      break;
    }
  }

  if (rawData.personality_sliders && !rawData.sliders) {
    rawData.sliders = rawData.personality_sliders;
  }

  let rawEmotions: any[] = [];
  if (Array.isArray(rawData.selectedEmotions)) {
    rawEmotions = rawData.selectedEmotions;
  } else if (Array.isArray(rawData.emotions)) {
    rawEmotions = rawData.emotions;
  }

  const dedupedEmotions: string[] = [];
  const seenEmotions = new Set<string>();
  for (const item of rawEmotions) {
    const ename = typeof item === 'string' ? item : item?.emotion;
    if (ename && typeof ename === 'string' && ename.trim() && !seenEmotions.has(ename.trim())) {
      seenEmotions.add(ename.trim());
      dedupedEmotions.push(ename.trim());
    }
  }

  let rawStyles: any[] = [];
  if (Array.isArray(rawData.selectedVisual)) {
    rawStyles = rawData.selectedVisual;
  } else if (Array.isArray(rawData.styles)) {
    rawStyles = rawData.styles;
  } else if (Array.isArray(rawData.visual_styles)) {
    rawStyles = rawData.visual_styles;
  }

  const dedupedStyles: string[] = [];
  const seenStyles = new Set<string>();
  for (const item of rawStyles) {
    const sname = typeof item === 'string' ? item : item?.style;
    if (sname && typeof sname === 'string' && sname.trim() && !seenStyles.has(sname.trim())) {
      seenStyles.add(sname.trim());
      dedupedStyles.push(sname.trim());
    }
  }

  const rawComps = Array.isArray(rawData.comps)
    ? rawData.comps
    : Array.isArray(rawData.competitors)
    ? rawData.competitors
    : [];
  const validComps = rawComps
    .filter((c: any) => c && typeof c === 'object' && (c.name || '').trim())
    .map((c: any) => ({
      name: String(c.name || '').trim(),
      rating: String(c.rating || 'neutral').trim(),
      reason: String(c.reason || '').trim(),
    }));

  const dbFieldMap: Record<string, string> = {
    what_business_does: 'whatBusinessDoes',
    target_customer: 'targetCustomer',
    why_choose_us: 'whyChooseUs',
    brand_feeling: 'brandFeeling',
    audience_archetype: 'audienceArchetype',
  };

  const finalData: any = {};
  for (const [apiKey, dbKey] of Object.entries(dbFieldMap)) {
    if (rawData[apiKey] !== undefined && rawData[apiKey] !== null && String(rawData[apiKey]).trim()) {
      finalData[dbKey] = String(rawData[apiKey]).trim();
    } else if (existingDiscovery && existingDiscovery[dbKey]) {
      finalData[dbKey] = existingDiscovery[dbKey];
    } else {
      finalData[dbKey] = '';
    }
  }

  if (Array.isArray(rawData.sliders) && rawData.sliders.length > 0) {
    finalData.sliders = rawData.sliders.map((s: any) => ({
      sliderKey: s.slider_key || s.sliderKey || '',
      leftLabel: s.left_label || s.leftLabel || '',
      rightLabel: s.right_label || s.rightLabel || '',
      value: Number(s.value ?? 50),
    }));
  } else if (existingDiscovery?.sliders?.length > 0) {
    finalData.sliders = existingDiscovery.sliders;
  } else {
    finalData.sliders = [];
  }

  if (dedupedEmotions.length > 0) {
    finalData.emotions = dedupedEmotions.slice(0, 8);
  } else if (existingDiscovery?.emotions?.length > 0) {
    finalData.emotions = existingDiscovery.emotions;
  } else {
    finalData.emotions = [];
  }

  if (dedupedStyles.length > 0) {
    finalData.visualStyles = dedupedStyles.slice(0, 3);
  } else if (existingDiscovery?.visualStyles?.length > 0) {
    finalData.visualStyles = existingDiscovery.visualStyles;
  } else {
    finalData.visualStyles = [];
  }

  if (validComps.length > 0) {
    finalData.competitors = validComps;
  } else if (existingDiscovery?.competitors?.length > 0) {
    finalData.competitors = existingDiscovery.competitors;
  } else {
    finalData.competitors = [];
  }

  const snapshot: DiscoverySnapshot = {
    what_business_does: finalData.whatBusinessDoes,
    target_customer: finalData.targetCustomer,
    why_choose_us: finalData.whyChooseUs,
    brand_feeling: finalData.brandFeeling,
    audience_archetype: finalData.audienceArchetype,
    emotions: finalData.emotions,
    competitors: finalData.competitors,
    visual_styles: finalData.visualStyles,
  };

  return { finalData, snapshot };
}

export async function handleSaveDiscovery(req: any, res: Response, markSubmitted: boolean) {
  const id = req.params.id || req.project?.id;
  const project = req.project || (await Project.findById(id));

  if (!project) {
    res.status(404).json({ detail: 'Project not found.' });
    return;
  }

  const existingDiscovery = await ProjectDiscovery.findOne({ projectId: id });

  if (existingDiscovery && existingDiscovery.submittedAt) {
    if (markSubmitted) {
      const { finalData } = extractDiscoveryData(req.body, existingDiscovery);
      const updated = await ProjectDiscovery.findOneAndUpdate(
        { projectId: id },
        { $set: finalData },
        { new: true }
      );
      res.status(200).json(serializeDiscovery(updated || existingDiscovery));
      return;
    }
    res.status(409).json({
      detail: 'Discovery has already been submitted and can no longer be edited.',
    });
    return;
  }

  const { finalData, snapshot } = extractDiscoveryData(req.body, existingDiscovery);

  if (markSubmitted && !isCompleteDiscoverySnapshot(snapshot)) {
    res.status(400).json({
      detail: 'Complete discovery answers before submitting.',
    });
    return;
  }

  const updateData: any = { ...finalData };
  if (markSubmitted) {
    updateData.submittedAt = new Date();
  }

  const discovery = await ProjectDiscovery.findOneAndUpdate(
    { projectId: id },
    { $set: updateData },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (markSubmitted) {
    try {
      const hasSubmission = await ProjectActivity.findOne({
        projectId: id,
        action: 'discovery_submitted',
      });
      const action = hasSubmission ? 'discovery_updated' : 'discovery_submitted';
      const description = hasSubmission
        ? 'Client updated the discovery questionnaire.'
        : 'Client submitted the discovery questionnaire.';
      const actorType = req.isPortalClient ? 'client' : 'consultant';

      await logProjectActivity({
        projectId: id,
        consultantId: project.consultantId?.toString() || project.consultantId,
        actorType,
        action,
        description,
        metadata: {
          discovery_id: discovery.id,
          discovery_status: 'complete',
        },
      });
    } catch (actErr) {
      console.error('Failed to log discovery activity:', actErr);
    }

    try {
      const fullProject = await Project.findById(id).populate([
        'clientProfile',
        'discovery',
        'brandDNA',
        'moodboards',
        'concepts',
        'projectAgreement',
        'paymentMilestones',
        'deliverables',
      ]);
      if (fullProject) {
        const newProgress = calculateProjectProgress(fullProject);
        await Project.findByIdAndUpdate(id, {
          status: 'discovery',
          progress: newProgress,
        });
      }
    } catch (progErr) {
      console.error('Failed to update project status/progress:', progErr);
    }
  }

  res.status(200).json(serializeDiscovery(discovery));
}

export async function getDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const discovery = await ProjectDiscovery.findOne({ projectId: id });

    if (!discovery) {
      res.status(404).json({ detail: 'Project discovery not found for this project.' });
      return;
    }

    res.json(serializeDiscovery(discovery));
  } catch (err) {
    next(err);
  }
}

export async function saveDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    await handleSaveDiscovery(req, res, false);
  } catch (err) {
    next(err);
  }
}

export async function submitDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    await handleSaveDiscovery(req, res, true);
  } catch (err) {
    next(err);
  }
}

export async function getDiscoverySummary(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const discovery = await ProjectDiscovery.findOne({ projectId: id });

    if (!discovery) {
      res.status(404).json({ detail: 'Discovery not found.' });
      return;
    }

    const project = await Project.findById(id).populate('clientProfile');
    const serialized: any = serializeDiscovery(discovery);
    if (project && serialized) {
      const clientProfile = project.clientProfile as any;
      serialized.client_name = clientProfile?.fullName || project.title || '';
      serialized.company_name = clientProfile?.companyName || project.companyName || '';
      serialized.industry = clientProfile?.industry || project.sector || '';
    }

    res.json(serialized);
  } catch (err) {
    next(err);
  }
}

export async function getBrandDNA(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const brandDNA = await BrandDNA.findOne({ projectId: id });

    if (!brandDNA) {
      res.status(404).json({ detail: 'Brand DNA not found for this project.' });
      return;
    }

    res.json(serializeBrandDNA(brandDNA));
  } catch (err) {
    next(err);
  }
}

export async function generateBrandDNA(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).populate(['clientProfile', 'discovery', 'consultant']);

    if (!project || !project.discovery) {
      res.status(404).json({ detail: 'Project discovery not found for this project.' });
      return;
    }

    if (!project.discovery.submittedAt) {
      res.status(409).json({ detail: 'Discovery must be submitted before generating Brand DNA.' });
      return;
    }

    const consultantApiKey = (project.consultant as any)?.integrations?.geminiApiKey;
    const dnaData = await generateAiBrandDNA(project, project.discovery, consultantApiKey);

    const brandDNA = await BrandDNA.findOneAndUpdate(
      { projectId: id },
      { $set: dnaData },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'brand_dna_generated',
      description: 'Consultant generated Brand DNA.',
      metadata: {
        brand_dna_id: brandDNA.id,
        personality_cluster: brandDNA.brandPersonalityCluster,
      },
      visibleToClient: true,
    });

    res.json(serializeBrandDNA(brandDNA));
  } catch (err) {
    next(err);
  }
}

export async function downloadBrandDnaPdf(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).populate(['clientProfile', 'discovery', 'client']);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const brandDNA = await BrandDNA.findOne({ projectId: id });
    if (!brandDNA) {
      res.status(404).json({ detail: 'Brand DNA not found for this project. Please generate Brand DNA first.' });
      return;
    }

    const pdfBuffer = await generateBrandDnaBriefPdf(project, brandDNA);
    const safeTitle = (project.clientProfile?.companyName || project.companyName || project.title || 'brand')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="brand-dna-brief-${safeTitle}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}
