import { Request, Response, NextFunction } from 'express';
import { ClientProfile } from '../models/clientProfile.model.js';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { calculateProjectProgress, logProjectActivity } from '../services/project.service.js';
import { serializeClientProfile } from '../utils/serializer.js';

export function validateClientPhone(phone: string): string | null {
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
    const profile = await ClientProfile.findOne({ projectId: id });

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
    const project = req.project || (await Project.findById(id));

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const { client_name, company_name, industry, year_started, location, phone, email, website } = req.body;

    if (phone !== undefined && phone !== null) {
      const phoneError = validateClientPhone(phone);
      if (phoneError) {
        res.status(400).json({ phone: [phoneError] });
        return;
      }
    }

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

    const existingProfile = await ClientProfile.findOne({ projectId: id });

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

    const profile = await ClientProfile.findOneAndUpdate(
      { projectId: id },
      { $set: data },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (profileChanged) {
      try {
        const hasSubmission = await ProjectActivity.findOne({
          projectId: id,
          action: 'client_profile_submitted',
        });
        const action = hasSubmission ? 'client_profile_updated' : 'client_profile_submitted';
        const description = hasSubmission ? 'Client updated their profile.' : 'Client submitted their profile.';
        const actorType = req.isPortalClient ? 'client' : 'consultant';

        await logProjectActivity({
          projectId: id,
          consultantId: project.consultantId?.toString() || project.consultantId,
          actorType,
          action,
          description,
          metadata: { profile_id: profile.id },
        });
      } catch (actErr) {
        console.error('Failed to log profile activity:', actErr);
      }
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
        if (newProgress !== fullProject.progress) {
          await Project.findByIdAndUpdate(id, { progress: newProgress });
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

export async function getClientList(req: any, res: Response, next: NextFunction) {
  try {
    const projects = await Project.find({ consultantId: req.user.id, isArchived: false })
      .populate('client')
      .sort({ updatedAt: -1 })
      .limit(50);

    const data = projects.map((p) => ({
      id: p.id,
      title: p.title,
      company_name: p.companyName,
      sector: p.sector,
      status: p.status,
      portal_token: p.portalToken,
      client: p.client
        ? {
            id: p.client.id,
            name: p.client.name,
            email: p.client.email,
          }
        : null,
    }));

    res.json(data);
  } catch (err) {
    next(err);
  }
}
