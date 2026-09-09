import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client.js';
import {
  buildBrandDNAData,
  calculateProjectProgress,
  logProjectActivity,
} from '../services/project.service.js';
import {
  serializeClientProfile,
  serializeDiscovery,
  serializeBrandDNA,
} from '../utils/serializer.js';
import { maybeGenerateAgreementSnapshot } from '../services/generatedAgreement.service.js';

function validateClientPhone(phone: string): string | null {
  const trimmed = (phone || '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 50) {
    return 'Phone number is too long (maximum 50 characters).';
  }
  const hasPlus = trimmed.startsWith('+');
  const rest = hasPlus ? trimmed.slice(1) : trimmed;
  if (rest.includes('+')) {
    return 'Invalid phone number format.';
  }
  if (!/^[\d\s\-().]+$/.test(rest)) {
    return 'Phone number can only contain digits, spaces, hyphens, dots, parentheses, and an optional leading +.';
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return 'Phone number must contain between 7 and 15 digits.';
  }
  return null;
}

export async function getClientProfile(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const profile = await prisma.clientProfile.findUnique({
      where: { projectId: id },
    });

    if (!profile) {
      res.status(404).json({ detail: 'Client profile not found for this project.' });
      return;
    }

    res.json(serializeClientProfile(profile));
  } catch (err) {
    next(err);
  }
}

export async function saveClientProfile(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = req.project || (await prisma.project.findUnique({ where: { id } }));

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const { client_name, company_name, industry, year_started, location, phone, email, website } = req.body;

    // Validate phone number if provided
    if (phone !== undefined && phone !== null) {
      const phoneError = validateClientPhone(phone);
      if (phoneError) {
        res.status(400).json({ phone: [phoneError] });
        return;
      }
    }

    // Normalize website if provided
    let normWebsite: string | undefined = undefined;
    if (website !== undefined && website !== null) {
      const rawWebsite = String(website).trim();
      if (rawWebsite) {
        normWebsite = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
      } else {
        normWebsite = '';
      }
    }

    const data: any = {};
    if (client_name !== undefined) data.clientName = String(client_name).trim();
    if (company_name !== undefined) data.companyName = String(company_name).trim();
    if (industry !== undefined) data.industry = String(industry).trim();
    if (year_started !== undefined) {
      data.yearStarted = year_started ? parseInt(String(year_started), 10) || null : null;
    }
    if (location !== undefined) data.location = String(location).trim();
    if (phone !== undefined) data.phone = phone ? String(phone).trim() : '';
    if (email !== undefined) data.email = email ? String(email).trim() : '';
    if (normWebsite !== undefined) data.website = normWebsite;

    const existingProfile = await prisma.clientProfile.findUnique({
      where: { projectId: id },
    });

    // Detect changes
    let profileChanged = false;
    if (!existingProfile) {
      profileChanged = true;
    } else {
      for (const [key, val] of Object.entries(data)) {
        const current = (existingProfile as any)[key] ?? '';
        const incoming = val ?? '';
        if (String(current) !== String(incoming)) {
          profileChanged = true;
          break;
        }
      }
    }

    const profile = await prisma.clientProfile.upsert({
      where: { projectId: id },
      update: data,
      create: { projectId: id, ...data },
    });

    // Log activity if profile changed
    if (profileChanged) {
      try {
        const hasSubmission = await prisma.projectActivity.findFirst({
          where: {
            projectId: id,
            action: 'client_profile_submitted',
          },
        });
        const action = hasSubmission ? 'client_profile_updated' : 'client_profile_submitted';
        const description = hasSubmission ? 'Client updated their profile.' : 'Client submitted their profile.';
        const actorType = req.isPortalClient ? 'client' : 'consultant';

        await logProjectActivity({
          projectId: id,
          consultantId: project.consultantId,
          actorType,
          action,
          description,
          metadata: { profile_id: profile.id },
        });
      } catch (actErr) {
        console.error('Failed to log profile activity:', actErr);
      }
    }

    // Recalculate project progress
    try {
      const fullProject = await prisma.project.findUnique({
        where: { id },
        include: {
          clientProfile: true,
          discovery: true,
          brandDNA: true,
          moodboards: true,
          concepts: true,
          projectAgreement: true,
          paymentMilestones: true,
          deliverables: true,
        },
      });
      if (fullProject) {
        const newProgress = calculateProjectProgress(fullProject);
        if (newProgress !== fullProject.progress) {
          await prisma.project.update({
            where: { id },
            data: { progress: newProgress },
          });
        }
      }
    } catch (progErr) {
      console.error('Failed to recalculate project progress:', progErr);
    }

    res.json(serializeClientProfile(profile));
  } catch (err) {
    next(err);
  }
}

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

  // 1. what_business_does
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

  // 2. target_customer
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

  // 3. why_choose_us
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

  // 4. brand_feeling
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

  // 5. audience_archetype
  for (const k of ['customer_archetype', 'persona', 'selectedAudience', 'audience_archetype']) {
    if (rawData[k]) {
      const val = rawData[k];
      rawData.audience_archetype = Array.isArray(val) ? val[0] : String(val);
      break;
    }
  }

  // 6. sliders
  if (rawData.personality_sliders && !rawData.sliders) {
    rawData.sliders = rawData.personality_sliders;
  }

  // 7. emotions
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

  // 8. visual_styles
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

  // 9. competitors
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

  // Sliders
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

  // Emotions
  if (dedupedEmotions.length > 0) {
    finalData.emotions = dedupedEmotions.slice(0, 8);
  } else if (existingDiscovery?.emotions?.length > 0) {
    finalData.emotions = existingDiscovery.emotions;
  } else {
    finalData.emotions = [];
  }

  // Visual Styles
  if (dedupedStyles.length > 0) {
    finalData.visualStyles = dedupedStyles.slice(0, 3);
  } else if (existingDiscovery?.visualStyles?.length > 0) {
    finalData.visualStyles = existingDiscovery.visualStyles;
  } else {
    finalData.visualStyles = [];
  }

  // Competitors
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

async function handleSaveDiscovery(req: any, res: Response, markSubmitted: boolean) {
  const { id } = req.params;
  const project = req.project || (await prisma.project.findUnique({ where: { id } }));

  if (!project) {
    res.status(404).json({ detail: 'Project not found.' });
    return;
  }

  const existingDiscovery = await prisma.projectDiscovery.findUnique({
    where: { projectId: id },
  });

  // If discovery was already submitted
  if (existingDiscovery && existingDiscovery.submittedAt) {
    if (markSubmitted) {
      // Idempotent submit returns the existing discovery
      res.status(200).json(serializeDiscovery(existingDiscovery));
      return;
    }
    // Draft save on an already-submitted discovery is prohibited
    res.status(409).json({
      detail: 'Discovery has already been submitted and can no longer be edited.',
    });
    return;
  }

  const { finalData, snapshot } = extractDiscoveryData(req.body, existingDiscovery);

  // Validate completeness if submitting
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

  const discovery = await prisma.projectDiscovery.upsert({
    where: { projectId: id },
    update: updateData,
    create: { projectId: id, ...updateData },
  });

  if (markSubmitted) {
    try {
      const hasSubmission = await prisma.projectActivity.findFirst({
        where: {
          projectId: id,
          action: 'discovery_submitted',
        },
      });
      const action = hasSubmission ? 'discovery_updated' : 'discovery_submitted';
      const description = hasSubmission
        ? 'Client updated the discovery questionnaire.'
        : 'Client submitted the discovery questionnaire.';
      const actorType = req.isPortalClient ? 'client' : 'consultant';

      await logProjectActivity({
        projectId: id,
        consultantId: project.consultantId,
        actorType,
        action,
        description,
        metadata: {
          discovery_id: discovery.id,
          discovery_status: 'complete',
        },
      });

      await maybeGenerateAgreementSnapshot(id).catch(() => {});
    } catch (actErr) {
      console.error('Failed to log discovery activity:', actErr);
    }

    try {
      const fullProject = await prisma.project.findUnique({
        where: { id },
        include: {
          clientProfile: true,
          discovery: true,
          brandDNA: true,
          moodboards: true,
          concepts: true,
          projectAgreement: true,
          paymentMilestones: true,
          deliverables: true,
        },
      });
      if (fullProject) {
        const newProgress = calculateProjectProgress(fullProject);
        await prisma.project.update({
          where: { id },
          data: {
            status: 'discovery',
            progress: newProgress,
          },
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
    const discovery = await prisma.projectDiscovery.findUnique({
      where: { projectId: id },
    });

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
    const discovery = await prisma.projectDiscovery.findUnique({
      where: { projectId: id },
    });

    if (!discovery) {
      res.status(404).json({ detail: 'Discovery not found.' });
      return;
    }

    res.json(serializeDiscovery(discovery));
  } catch (err) {
    next(err);
  }
}

export async function getBrandDNA(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const brandDNA = await prisma.brandDNA.findUnique({
      where: { projectId: id },
    });

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
    const project = await prisma.project.findUnique({
      where: { id },
      include: { clientProfile: true, discovery: true },
    });

    if (!project || !project.discovery) {
      res.status(404).json({ detail: 'Project discovery not found for this project.' });
      return;
    }

    if (!project.discovery.submittedAt) {
      res.status(409).json({ detail: 'Discovery must be submitted before generating Brand DNA.' });
      return;
    }

    const dnaData = buildBrandDNAData(project, project.discovery);

    const brandDNA = await prisma.brandDNA.upsert({
      where: { projectId: id },
      update: dnaData,
      create: { projectId: id, ...dnaData },
    });

    await logProjectActivity({
      projectId: id,
      consultantId: project.consultantId,
      actorType: 'consultant',
      action: 'brand_dna_generated',
      description: 'Consultant generated Brand DNA.',
      metadata: {
        brand_dna_id: brandDNA.id,
        personality_cluster: brandDNA.brandPersonalityCluster,
      },
    });

    res.json(serializeBrandDNA(brandDNA));
  } catch (err) {
    next(err);
  }
}
