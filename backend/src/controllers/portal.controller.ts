import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';
import { ClientProfile } from '../models/clientProfile.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { ProjectDiscovery } from '../models/discovery.model.js';
import { Moodboard } from '../models/moodboard.model.js';
import { Concept } from '../models/concept.model.js';
import { Deliverable } from '../models/deliverable.model.js';
import { ProjectAgreement } from '../models/agreement.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { PaymentTransaction } from '../models/paymentTransaction.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import { ENV } from '../config/env.js';
import { verifyPassword, signPortalAccessToken } from '../utils/crypto.js';
import {
  calculateProjectProgress,
  calculateProjectWorkflowStatus,
  canClientDownloadDeliverable,
  recalculatePaymentMilestones,
  logProjectActivity,
} from '../services/project.service.js';
import { Consultant } from '../models/consultant.model.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyPaymentSignatureWithSecret,
  resolveRazorpayCredentials,
  fetchRazorpayPayment,
} from '../services/razorpay.service.js';
import {
  completePaymentMilestone,
  PaymentCompletionError,
} from '../services/payment.service.js';
import { generateSignedAgreementPdf, generateBrandDnaBriefPdf, generateBrandDeliverablesPdf } from '../services/pdf.service.js';
import { maybeGenerateAgreementSnapshot } from '../services/agreement.service.js';
import fs from 'fs';
import sharp from 'sharp';
import {
  saveFile,
  generateWatermarkedImage,
  resolveSafeMediaPath,
  streamLocalFile,
  validateUploadedFile,
} from '../services/storage.service.js';
import {
  serializeProject,
  serializeBrandDNA,
  serializeDiscovery,
  serializeClientPortalMoodboard,
  serializeClientPortalConcept,
  serializeClientPortalDeliverable,
  serializePaymentMilestone,
  serializeClientPortalActivity,
} from '../utils/serializer.js';
import {
  getLatestActiveHelp,
  broadcastHelpRequested,
  broadcastHelpResolved,
} from '../websocket/socketServer.js';
import { handleSaveDiscovery } from './discovery.controller.js';

export async function getClientList(req: any, res: Response, next: NextFunction) {
  try {
    const projects = await Project.find({ consultantId: req.user.id, isArchived: false })
      .populate('client')
      .sort({ updatedAt: -1 })
      .limit(50);

    const data = projects.map((p: any) => ({
      id: p.id,
      title: p.title,
      company_name: p.companyName,
      portal_token: p.portalToken,
      client_name: p.client?.name || p.companyName || 'Client',
      client_email: p.client?.email || p.clientEmail || '',
      client: p.client
        ? {
            id: p.client.id || p.client._id,
            name: p.client.name,
            email: p.client.email,
          }
        : null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getPortalProject(req: any, res: Response, next: NextFunction) {
  try {
    const project = req.project;
    const progress = calculateProjectProgress(project);
    const workflowStatus = calculateProjectWorkflowStatus(project);

    if (project.id && project.progress !== progress) {
      await Project.findByIdAndUpdate(project.id, { progress });
    }

    // Bind browser portal session cookie for passwordless portals so gated media (chat attachments) works without leaking tokens in URLs
    if (!req.isSupportMode && !project.portalPasswordHash && project.portalToken) {
      const signedToken = signPortalAccessToken(project.portalToken);
      res.cookie(ENV.PORTAL_ACCESS_COOKIE_NAME, signedToken, {
        maxAge: ENV.PORTAL_ACCESS_MAX_AGE * 1000,
        httpOnly: true,
        secure: ENV.AUTH_COOKIE_SECURE,
        sameSite: ENV.AUTH_COOKIE_SAMESITE,
        path: '/',
      });
    }

    res.json(serializeProject({ ...project.toObject(), progress }, workflowStatus));
  } catch (err) {
    next(err);
  }
}

export async function verifyPortalPassword(req: any, res: Response, next: NextFunction) {
  try {
    const { portal_token } = req.params;
    const { email, password } = req.body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password.trim() : '';

    if (!cleanEmail || !cleanPassword) {
      res.status(400).json({ detail: 'Please enter both your client email address and portal password.' });
      return;
    }

    const project = await Project.findOne({ portalToken: portal_token, isArchived: false })
      .populate('clientId');

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    // Resolve client email for this project
    let expectedClientEmail = '';
    const populatedClient = project.clientId as any;
    if (populatedClient && typeof populatedClient === 'object' && populatedClient.email) {
      expectedClientEmail = String(populatedClient.email).trim().toLowerCase();
    } else if (project.clientId) {
      const clientDoc = await Client.findById(project.clientId);
      if (clientDoc?.email) {
        expectedClientEmail = String(clientDoc.email).trim().toLowerCase();
      }
    }

    if (!expectedClientEmail) {
      const profileDoc = await ClientProfile.findOne({ projectId: project._id });
      if (profileDoc?.email) {
        expectedClientEmail = String(profileDoc.email).trim().toLowerCase();
      }
    }

    // Strictly verify client email matches
    if (!expectedClientEmail || cleanEmail !== expectedClientEmail) {
      res.status(401).json({ detail: 'Invalid email address or portal password.' });
      return;
    }

    // Strictly verify password if project has portalPasswordHash
    if (project.portalPasswordHash) {
      const isValid = await verifyPassword(cleanPassword, project.portalPasswordHash);
      if (!isValid) {
        res.status(401).json({ detail: 'Invalid email address or portal password.' });
        return;
      }
    }

    const signedToken = signPortalAccessToken(portal_token);
    res.cookie(ENV.PORTAL_ACCESS_COOKIE_NAME, signedToken, {
      maxAge: ENV.PORTAL_ACCESS_MAX_AGE * 1000,
      httpOnly: true,
      secure: ENV.AUTH_COOKIE_SECURE,
      sameSite: ENV.AUTH_COOKIE_SAMESITE,
      path: '/',
    });

    res.json({ success: true, token: signedToken });
  } catch (err) {
    next(err);
  }
}

export async function logoutPortal(req: any, res: Response) {
  res.clearCookie(ENV.PORTAL_ACCESS_COOKIE_NAME, {
    path: '/',
    sameSite: ENV.AUTH_COOKIE_SAMESITE,
  });
  res.json({ success: true });
}

export async function getPortalBrandDNA(req: any, res: Response, next: NextFunction) {
  try {
    const brandDNA = await BrandDNA.findOne({ projectId: req.project.id });

    if (!brandDNA) {
      res.status(404).json({ detail: 'Brand DNA not generated yet.' });
      return;
    }

    res.json(serializeBrandDNA(brandDNA));
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalBrandDnaPdf(req: any, res: Response, next: NextFunction) {
  try {
    const project = await Project.findById(req.project.id).populate(['clientProfile', 'discovery', 'client']);
    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const brandDNA = await BrandDNA.findOne({ projectId: req.project.id });
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

export async function getPortalDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    let discovery = await ProjectDiscovery.findOne({ projectId: req.project.id });

    if (!discovery) {
      discovery = await ProjectDiscovery.create({
        projectId: req.project.id,
        sliders: [],
        emotions: [],
        competitors: [],
        visualStyles: [],
      });
    }

    const serialized = serializeDiscovery(discovery);
    const activeHelp = await getLatestActiveHelp(req.project.id);
    (serialized as any).active_help = activeHelp;

    res.json(serialized);
  } catch (err) {
    next(err);
  }
}

export async function savePortalDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    const {
      what_business_does,
      target_customer,
      why_choose_us,
      brand_feeling,
      audience_archetype,
      sliders,
      emotions,
      competitors,
      visual_styles,
    } = req.body;

    const data: any = {};
    if (what_business_does !== undefined) data.whatBusinessDoes = what_business_does;
    if (target_customer !== undefined) data.targetCustomer = target_customer;
    if (why_choose_us !== undefined) data.whyChooseUs = why_choose_us;
    if (brand_feeling !== undefined) data.brandFeeling = brand_feeling;
    if (audience_archetype !== undefined) data.audienceArchetype = audience_archetype;

    if (sliders && Array.isArray(sliders)) {
      data.sliders = sliders.map((s: any) => ({
        sliderKey: s.slider_key || s.sliderKey,
        leftLabel: s.left_label || s.leftLabel || '',
        rightLabel: s.right_label || s.rightLabel || '',
        value: Number(s.value ?? 50),
      }));
    }

    if (emotions && Array.isArray(emotions)) {
      const unique = Array.from(
        new Set(emotions.map((e: any) => (typeof e === 'string' ? e : e.emotion).trim()))
      );
      data.emotions = unique.slice(0, 8);
    }

    if (competitors && Array.isArray(competitors)) {
      data.competitors = competitors.map((c: any) => ({
        name: (c.name || '').trim(),
        rating: c.rating || 'neutral',
        reason: (c.reason || '').trim(),
      }));
    }

    if (visual_styles && Array.isArray(visual_styles)) {
      const unique = Array.from(
        new Set(visual_styles.map((v: any) => (typeof v === 'string' ? v : v.style).trim()))
      );
      data.visualStyles = unique.slice(0, 3);
    }

    const discovery = await ProjectDiscovery.findOneAndUpdate(
      { projectId: req.project.id },
      { $set: data },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(serializeDiscovery(discovery));
  } catch (err) {
    next(err);
  }
}

export async function submitPortalDiscovery(req: any, res: Response, next: NextFunction) {
  try {
    req.params.id = req.project.id;
    req.isPortalClient = !req.isSupportMode;
    await handleSaveDiscovery(req, res, true);
  } catch (err) {
    next(err);
  }
}

export async function getPortalMoodboards(req: any, res: Response, next: NextFunction) {
  try {
    const moodboards = await Moodboard.find({
      projectId: req.project.id,
      isShared: true,
    }).sort({ createdAt: -1 });

    res.json(moodboards.map((m) => serializeClientPortalMoodboard(m, req.project.portalToken)));
  } catch (err) {
    next(err);
  }
}

export async function selectPortalMoodboard(req: any, res: Response, next: NextFunction) {
  try {
    const { moodboard_id } = req.params;

    // Option A: Strict Single Direction - unselect any previously selected moodboard for this project
    await Moodboard.updateMany(
      { projectId: req.project.id, _id: { $ne: moodboard_id } },
      { $set: { isSelected: false } }
    );

    const selected = await Moodboard.findOneAndUpdate(
      { _id: moodboard_id, projectId: req.project.id },
      { $set: { isSelected: true } },
      { returnDocument: 'after' }
    );

    if (!selected) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: 'moodboard_selected',
      description: `Client selected moodboard: ${selected.title}`,
      metadata: { moodboard_id: selected.id },
      visibleToClient: true,
    });

    await maybeGenerateAgreementSnapshot(req.project.id).catch(() => {});

    res.json(serializeClientPortalMoodboard(selected, req.project.portalToken));
  } catch (err) {
    next(err);
  }
}

export async function submitMoodboardFeedback(req: any, res: Response, next: NextFunction) {
  try {
    const { moodboard_id } = req.params;
    const { feedback } = req.body;

    if (!feedback || !String(feedback).trim()) {
      res.status(400).json({ detail: 'Feedback is required when requesting changes.' });
      return;
    }

    const moodboard = await Moodboard.findOneAndUpdate(
      { _id: moodboard_id, projectId: req.project.id },
      {
        $set: {
          clientFeedback: String(feedback).trim(),
          isSelected: false,
        },
      },
      { new: true }
    );

    if (!moodboard) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: 'moodboard_feedback_submitted',
      description: `Client submitted changes for moodboard: ${moodboard.title}`,
      metadata: { moodboard_id: moodboard.id, feedback: String(feedback).trim() },
      visibleToClient: true,
    });

    res.json(serializeClientPortalMoodboard(moodboard, req.project.portalToken));
  } catch (err) {
    next(err);
  }
}

export async function getPortalConcepts(req: any, res: Response, next: NextFunction) {
  try {
    const concepts = await Concept.find({
      projectId: req.project.id,
      status: { $in: ['shared', 'approved', 'changes_requested'] },
    }).sort({ createdAt: -1 });

    res.json(concepts.map((c) => serializeClientPortalConcept(c, req.project.portalToken)));
  } catch (err) {
    next(err);
  }
}

export async function submitConceptFeedback(req: any, res: Response, next: NextFunction) {
  try {
    const { concept_id } = req.params;
    const { action, feedback } = req.body;

    const isApprove = action === 'approved' || action === 'approve';
    const isChangesRequested = action === 'changes_requested';

    if (!isApprove && !isChangesRequested) {
      res.status(400).json({ action: ['Use approved or changes_requested.'] });
      return;
    }

    const concept = await Concept.findOne({
      _id: concept_id,
      projectId: req.project.id,
    });

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    // Once approved, status is locked and cannot be changed or deselected
    if (concept.status === 'approved') {
      if (isApprove) {
        res.json(serializeClientPortalConcept(concept, req.project.portalToken));
        return;
      }
      res.status(400).json({ detail: 'Approved concepts are locked and cannot be changed or deselected.' });
      return;
    }

    if (isApprove) {
      if (concept.status !== 'shared' && concept.status !== 'changes_requested') {
        res.status(400).json({ detail: 'Only shared concepts can be approved.' });
        return;
      }
    } else if (isChangesRequested) {
      if (concept.status !== 'shared') {
        res.status(400).json({ detail: 'Changes can only be requested for shared concepts.' });
        return;
      }

      const trimmedFeedback = (feedback || '').trim();
      if (!trimmedFeedback) {
        res.status(400).json({ feedback: ['Feedback is required when requesting changes.'] });
        return;
      }
    }

    const nextStatus = isApprove ? 'approved' : 'changes_requested';
    const trimmedFeedback = (feedback || '').trim();
    const updated = await Concept.findByIdAndUpdate(
      concept.id,
      {
        $set: {
          status: nextStatus,
          clientFeedback: isApprove ? '' : trimmedFeedback,
        },
      },
      { returnDocument: 'after' }
    );

    await recalculatePaymentMilestones(req.project.id);

    const activityAction = isApprove ? 'concept_approved' : 'concept_changes_requested';
    const activityDescription = isApprove
      ? `Client approved concept: ${updated!.title}`
      : `Client requested changes for concept: ${updated!.title}`;
    const activityMetadata: any = {
      concept_id: updated!.id,
      concept_title: updated!.title,
      concept_version: updated!.version,
      concept_status: nextStatus,
    };
    if (isChangesRequested) {
      activityMetadata.feedback = trimmedFeedback;
    }

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: activityAction,
      description: activityDescription,
      metadata: activityMetadata,
      visibleToClient: true,
    });

    await maybeGenerateAgreementSnapshot(req.project.id).catch(() => {});

    res.json(serializeClientPortalConcept(updated, req.project.portalToken));
  } catch (err) {
    next(err);
  }
}

export async function getPortalDeliverables(req: any, res: Response, next: NextFunction) {
  try {
    const deliverables = await Deliverable.find({
      projectId: req.project.id,
      status: 'shared',
    }).sort({ createdAt: -1 });

    const projectWithMilestones = await Project.findById(req.project.id).populate('paymentMilestones');

    res.json(
      deliverables.map((d) =>
        serializeClientPortalDeliverable(d, (projectWithMilestones || req.project) as any)
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function getPortalAgreement(req: any, res: Response, next: NextFunction) {
  try {
    const agreement = await ProjectAgreement.findOne({ projectId: req.project.id });

    if (!agreement || (agreement.status === 'draft' && !agreement.signatureRequestedAt)) {
      res.status(404).json({ detail: 'Agreement not available.' });
      return;
    }

    const portalToken = req.project.portalToken;
    const fileUrl = `/api/client-portal/${portalToken}/agreement/pdf/`;
    const basicPdfUrl = agreement.basicPdfFile
      ? `/api/client-portal/${portalToken}/agreement/pdf/?type=basic`
      : '';
    const signedPdfUrl = agreement.signedPdfFile
      ? `/api/client-portal/${portalToken}/agreement/pdf/?type=signed`
      : '';
    const downloadUrl = `/api/client-portal/${portalToken}/agreement/pdf/?download=1`;

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

    const signatureImageUrl = agreement.signatureImage
      ? `/api/client-portal/${portalToken}/agreement/signature/`
      : null;

    res.json({
      id: agreement.id,
      project: agreement.projectId,
      status: agreement.status,
      title: 'Basic Agreement',
      file_url: fileUrl,
      basic_pdf_url: basicPdfUrl,
      signed_pdf_url: signedPdfUrl,
      download_url: downloadUrl,
      basic_pdf_file: agreement.basicPdfFile,
      signed_pdf_file: agreement.signedPdfFile,
      signer_name: agreement.signerName,
      signed_at: agreement.signedAt,
      signature_method: agreement.signatureMethod,
      signature_image: signatureImageUrl,
      signature_metadata: signatureMetadata,
      signature_requested_at: agreement.signatureRequestedAt,
      current_version: Array.isArray(agreement.appendices) && agreement.appendices.length > 0
        ? (agreement.signedAt ? 2 + agreement.appendices.length - 1 : 1 + agreement.appendices.length)
        : 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalSignatureImage(req: any, res: Response, next: NextFunction) {
  try {
    const agreement = await ProjectAgreement.findOne({ projectId: req.project.id });
    if (!agreement || !agreement.signatureImage) {
      res.status(404).json({ detail: 'Signature image not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(agreement.signatureImage);
    if (!safePath || !fs.existsSync(safePath)) {
      res.status(404).json({ detail: 'Signature image not found.' });
      return;
    }

    streamLocalFile(safePath, res, { isAttachment: false });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalMoodboardImage(req: any, res: Response, next: NextFunction) {
  try {
    // Strictly block direct browser address-bar download / document navigation
    const secFetchDest = req.headers['sec-fetch-dest'];
    const secFetchMode = req.headers['sec-fetch-mode'];
    if (secFetchDest === 'document' || secFetchMode === 'navigate') {
      res.status(403).json({ detail: 'Direct browser access to protected assets is strictly prohibited.' });
      return;
    }

    const { asset_id } = req.params;
    const moodboard = await Moodboard.findOne({
      _id: asset_id,
      projectId: req.project.id,
      isShared: true,
    });

    if (!moodboard || (!moodboard.image && !moodboard.watermarkImage)) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    let targetFile = moodboard.watermarkImage;
    if (!targetFile && moodboard.image) {
      // Generate watermarked version on-the-fly for legacy uploads
      const origSafePath = resolveSafeMediaPath(moodboard.image);
      if (origSafePath && fs.existsSync(origSafePath)) {
        try {
          const origBuffer = await fs.promises.readFile(origSafePath);
          const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(
            origBuffer,
            path.basename(moodboard.image)
          );
          targetFile = await saveFile('moodboards/watermarked', wmFilename, wmBuffer, 'image/jpeg');
          await Moodboard.findByIdAndUpdate(moodboard._id, { $set: { watermarkImage: targetFile } });
        } catch (genErr) {
          console.error('[Portal] Error generating watermark for moodboard on-the-fly:', genErr);
        }
      }
    }

    if (!targetFile) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(targetFile);
    if (!safePath) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    streamLocalFile(safePath, res, { isAttachment: false });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalConceptImage(req: any, res: Response, next: NextFunction) {
  try {
    // Strictly block direct browser address-bar download / document navigation
    const secFetchDest = req.headers['sec-fetch-dest'];
    const secFetchMode = req.headers['sec-fetch-mode'];
    if (secFetchDest === 'document' || secFetchMode === 'navigate') {
      res.status(403).json({ detail: 'Direct browser access to protected assets is strictly prohibited.' });
      return;
    }

    const { asset_id } = req.params;
    const concept = await Concept.findOne({
      _id: asset_id,
      projectId: req.project.id,
      status: { $in: ['shared', 'approved', 'changes_requested'] },
    });

    if (!concept || (!concept.image && !concept.watermarkImage)) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    let targetFile = concept.watermarkImage;
    if (!targetFile && concept.image) {
      // Generate watermarked version on-the-fly for legacy uploads
      const origSafePath = resolveSafeMediaPath(concept.image);
      if (origSafePath && fs.existsSync(origSafePath)) {
        try {
          const origBuffer = await fs.promises.readFile(origSafePath);
          const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(
            origBuffer,
            path.basename(concept.image)
          );
          targetFile = await saveFile('concepts/watermarked', wmFilename, wmBuffer, 'image/jpeg');
          await Concept.findByIdAndUpdate(concept._id, { $set: { watermarkImage: targetFile } });
        } catch (genErr) {
          console.error('[Portal] Error generating watermark for concept on-the-fly:', genErr);
        }
      }
    }

    if (!targetFile) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(targetFile);
    if (!safePath) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    streamLocalFile(safePath, res, { isAttachment: false });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalConceptFile(req: any, res: Response, next: NextFunction) {
  try {
    const { asset_id } = req.params;
    const concept = await Concept.findOne({
      _id: asset_id,
      projectId: req.project.id,
      status: { $in: ['shared', 'approved', 'changes_requested'] },
    });

    if (!concept || !concept.file) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(concept.file);
    if (!safePath) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    streamLocalFile(safePath, res, {
      isAttachment: true,
      filename: path.basename(concept.file),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalDeliverableFile(req: any, res: Response, next: NextFunction) {
  try {
    const { asset_id } = req.params;
    const deliverable = await Deliverable.findOne({
      _id: asset_id,
      projectId: req.project.id,
    });

    if (!deliverable) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const projectWithMilestones = await Project.findById(req.project.id).populate('paymentMilestones');

    const { canDownload } = canClientDownloadDeliverable(
      (projectWithMilestones || req.project) as any,
      deliverable
    );

    if (!canDownload) {
      res.status(403).json({
        detail: 'Final files will be available after the required payment is confirmed.',
      });
      return;
    }

    if (!deliverable.file) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(deliverable.file);
    if (!safePath) {
      res.status(404).json({ detail: 'Asset not found.' });
      return;
    }

    const isBrandPackage =
      deliverable.title === 'Brand Delivery Package & Strategy Guide.pdf' ||
      (deliverable.file && deliverable.file.includes('brand_deliverables_'));

    if (isBrandPackage) {
      try {
        const fullProject = await Project.findById(req.project.id).populate([
          'clientProfile',
          'discovery',
          'brandDNA',
          'moodboards',
          'concepts',
          'deliverables',
          'paymentMilestones',
        ]);
        if (fullProject) {
          const freshPdfBuffer = await generateBrandDeliverablesPdf(fullProject);
          try {
            if (fs.existsSync(path.dirname(safePath))) {
              fs.writeFileSync(safePath, freshPdfBuffer);
            }
          } catch (writeErr) {
            console.warn('Failed to cache fresh deliverable PDF to disk:', writeErr);
          }

          await logProjectActivity({
            projectId: req.project.id,
            consultantId: req.project.consultantId?.toString() || req.project.consultantId,
            actorType: 'client',
            action: 'deliverable_downloaded',
            description: `Client downloaded deliverable: ${deliverable.title}`,
            metadata: {
              deliverable_id: deliverable.id,
              deliverable_title: deliverable.title,
            },
            visibleToClient: true,
          });

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Cache-Control', 'private, no-store, max-age=0');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(deliverable.file)}"`);
          return res.send(freshPdfBuffer);
        }
      } catch (genErr) {
        console.warn('Dynamic deliverable PDF generation fallback:', genErr);
      }
    }

    if (!fs.existsSync(safePath)) {
      res.status(404).json({ detail: 'Deliverable file not found on server.' });
      return;
    }

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: 'deliverable_downloaded',
      description: `Client downloaded deliverable: ${deliverable.title}`,
      metadata: {
        deliverable_id: deliverable.id,
        deliverable_title: deliverable.title,
      },
      visibleToClient: true,
    });

    streamLocalFile(safePath, res, {
      isAttachment: true,
      filename: path.basename(deliverable.file),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalAgreementPdf(req: any, res: Response, next: NextFunction) {
  try {
    const agreement = await ProjectAgreement.findOne({ projectId: req.project.id });

    if (!agreement || (agreement.status === 'draft' && !agreement.signatureRequestedAt)) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    const type = req.query.type;
    let targetFile: string | null = null;

    if (type === 'basic') {
      targetFile = agreement.basicPdfFile || null;
    } else if (type === 'signed') {
      targetFile = agreement.signedPdfFile || null;
    } else {
      targetFile = agreement.signedPdfFile || agreement.basicPdfFile || null;
    }

    if (!targetFile) {
      res.status(404).json({ detail: 'Agreement PDF is not available.' });
      return;
    }

    const safePath = resolveSafeMediaPath(targetFile);
    if (!safePath) {
      res.status(404).json({ detail: 'Agreement PDF is not available.' });
      return;
    }

    const isAttachment = req.query.download === '1';
    const filename = agreement.signedPdfFile ? 'signed-agreement.pdf' : 'basic-agreement.pdf';

    streamLocalFile(safePath, res, {
      isAttachment,
      filename,
      contentType: 'application/pdf',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Safely parses and validates base64 image data URLs for digital signature images.
 * Restricts to supported image formats (PNG, JPEG, WebP), enforces size bounds (< 5MB),
 * and validates image integrity via Sharp before returning the buffer.
 */
async function parseAndValidateBase64Signature(
  dataUrl: string
): Promise<{ buffer: Buffer; mimeType: string; ext: string } | null> {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  // Reject oversized strings early (5MB binary is ~6.7MB base64)
  if (dataUrl.length > 7 * 1024 * 1024) {
    return null;
  }

  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  const rawMime = match[1].toLowerCase();
  const format = match[2].toLowerCase();
  const base64Content = match[3];

  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const ext = format === 'jpeg' || format === 'jpg' ? '.jpg' : `.${format}`;

  try {
    const rawBuffer = Buffer.from(base64Content, 'base64');
    if (rawBuffer.length < 50 || rawBuffer.length > 5 * 1024 * 1024) {
      return null;
    }

    // Verify image integrity with Sharp to reject corrupted or spoofed data
    const metadata = await sharp(rawBuffer).metadata();
    if (!metadata || !metadata.width || !metadata.height) {
      return null;
    }

    // Ensure PDFKit compatibility: if format is WebP, convert to PNG
    if (ext === '.webp') {
      const converted = await sharp(rawBuffer).png().toBuffer();
      return { buffer: Buffer.from(converted), mimeType: 'image/png', ext: '.png' };
    }

    return { buffer: rawBuffer, mimeType, ext };
  } catch {
    return null;
  }
}

export async function signPortalAgreement(req: any, res: Response, next: NextFunction) {
  try {
    const { signer_name, signature_method } = req.body;

    if (!signer_name || !signature_method) {
      res.status(400).json({ detail: 'Signer name and signature method are required.' });
      return;
    }

    let agreement = await ProjectAgreement.findOne({ projectId: req.project.id });

    if (!agreement) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    const signedAt = new Date();
    let signatureImageBuffer: Buffer | undefined;
    let signatureOriginalName: string | undefined;
    let signatureMimeType: string | undefined;

    if (req.file) {
      validateUploadedFile(req.file, 'moodboard_image');
      try {
        const meta = await sharp(req.file.buffer).metadata();
        if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
          res.status(400).json({ detail: 'Invalid signature image format.' });
          return;
        }
        signatureImageBuffer = req.file.buffer;
        signatureOriginalName = req.file.originalname;
        signatureMimeType = req.file.mimetype;
      } catch {
        res.status(400).json({ detail: 'Invalid or corrupted signature image file.' });
        return;
      }
    }

    // Backward-compatible JSON base64 signature image support
    if (!signatureImageBuffer && typeof req.body?.signature_image === 'string' && req.body.signature_image.startsWith('data:image/')) {
      const parsed = await parseAndValidateBase64Signature(req.body.signature_image);
      if (parsed) {
        signatureImageBuffer = parsed.buffer;
        signatureOriginalName = `signature_${req.project.portalToken || 'client'}${parsed.ext}`;
        signatureMimeType = parsed.mimeType;
      }
    }

    const { pdfBuffer, sha256Hash } = await generateSignedAgreementPdf(req.project, agreement, {
      signerName: signer_name.trim(),
      signatureMethod: signature_method,
      signatureImageBuffer,
      signedAt,
      ipAddress: req.ip,
    });

    let signatureImagePath: string | undefined;
    if (signatureImageBuffer && signatureOriginalName) {
      signatureImagePath = await saveFile(
        'project_agreements/signatures',
        signatureOriginalName,
        signatureImageBuffer,
        signatureMimeType
      );
    }

    const signedPdfPath = await saveFile(
      'project_agreements/signed',
      `signed_agreement_${req.project.portalToken}.pdf`,
      pdfBuffer,
      'application/pdf'
    );

    const updated = await ProjectAgreement.findByIdAndUpdate(
      agreement.id,
      {
        $set: {
          status: 'signed',
          signerName: signer_name.trim(),
          signatureMethod: signature_method,
          signatureImage: signatureImagePath,
          signedPdfFile: signedPdfPath,
          signedAt,
          signatureMetadata: JSON.stringify({
            hash: sha256Hash,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          }),
        },
      },
      { new: true }
    );

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: 'agreement_signed',
      description: 'Client signed the project agreement (Digital Certificate generated).',
      visibleToClient: true,
    });

    await recalculatePaymentMilestones(req.project.id);

    const portalToken = req.project.portalToken;
    const fileUrl = `/api/client-portal/${portalToken}/agreement/pdf/`;
    const downloadUrl = `/api/client-portal/${portalToken}/agreement/pdf/?download=1`;

    const signatureImageUrl = updated!.signatureImage
      ? `/api/client-portal/${portalToken}/agreement/signature/`
      : null;

    res.json({
      id: updated!.id,
      project: updated!.projectId,
      status: updated!.status,
      title: 'Basic Agreement',
      file_url: fileUrl,
      download_url: downloadUrl,
      signed_pdf_file: updated!.signedPdfFile,
      signer_name: updated!.signerName,
      signed_at: updated!.signedAt,
      signature_method: updated!.signatureMethod,
      signature_image: signatureImageUrl,
      signature_metadata: {
        hash: sha256Hash,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      current_version: 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPortalPayments(req: any, res: Response, next: NextFunction) {
  try {
    const milestones = await PaymentMilestone.find({ projectId: req.project.id });

    const order: Record<string, number> = { advance: 1, mid: 2, final: 3 };
    milestones.sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99));

    res.json(milestones.map(serializePaymentMilestone));
  } catch (err) {
    next(err);
  }
}

function amountToSmallestUnit(amount: number | string): number {
  return Math.round(Number(amount || 0) * 100);
}

function buildCreateOrderPayload(transactionObj: any, milestone: any, reused: boolean, keyId?: string) {
  return {
    transaction_id: transactionObj.id,
    razorpay_order_id: transactionObj.razorpayOrderId,
    amount: amountToSmallestUnit(transactionObj.amount),
    currency: transactionObj.currency || 'INR',
    key_id: keyId || '',
    milestone: {
      id: milestone.id,
      type: milestone.type,
      amount: Number(milestone.amount || 0).toFixed(2),
      status: milestone.status,
    },
    reused,
  };
}

export async function createPortalPaymentOrder(req: any, res: Response, next: NextFunction) {
  try {
    const { milestone_id } = req.params;
    const project = req.project;

    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    const milestone = await PaymentMilestone.findOne({
      _id: milestone_id,
      projectId: project.id,
    }).populate('transactions');

    if (!milestone) {
      res.status(404).json({ detail: 'Payment milestone not found.' });
      return;
    }

    if (milestone.status === 'paid') {
      res.status(400).json({ detail: 'This payment milestone is already paid.' });
      return;
    }

    if (milestone.status !== 'requested') {
      res.status(400).json({ detail: 'Only requested payment milestones can be paid online.' });
      return;
    }

    if (!milestone.amount || Number(milestone.amount) <= 0) {
      res.status(400).json({ detail: 'Payment amount must be greater than zero.' });
      return;
    }

    let consultant = project.consultant;
    if (!consultant && project.consultantId) {
      consultant = await Consultant.findById(project.consultantId);
    }
    const rzpCreds = resolveRazorpayCredentials(consultant);

    if (!rzpCreds.keyId || !rzpCreds.keySecret) {
      res.status(503).json({
        detail: 'Payment gateway is not configured by your consultant. The consultant must configure their Razorpay Key ID and Secret in Settings > Integrations & API Keys.',
      });
      return;
    }

    const transactions = milestone.transactions || [];
    const verifiedTransaction = transactions.find((tx: any) => tx.status === 'verified');
    if (verifiedTransaction) {
      res.status(400).json({ detail: 'This payment milestone is already completed.' });
      return;
    }

    const currency = ENV.RAZORPAY_CURRENCY || 'INR';
    const expectedOrderAmount = amountToSmallestUnit(milestone.amount);

    const reusableTransaction = transactions
      .filter(
        (tx: any) =>
          tx.status === 'created' &&
          tx.razorpayOrderId &&
          tx.razorpayOrderId.trim() !== '' &&
          amountToSmallestUnit(tx.amount) === expectedOrderAmount &&
          String(tx.currency || '').toUpperCase() === currency.toUpperCase()
      )
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (reusableTransaction) {
      res.status(200).json(buildCreateOrderPayload(reusableTransaction, milestone, true, rzpCreds.keyId));
      return;
    }

    // Expire stale 'created' transactions whose amount/currency no longer matches the milestone
    await PaymentTransaction.updateMany(
      {
        milestoneId: milestone.id,
        status: 'created',
      },
      { $set: { status: 'failed' } }
    );

    const orderAmount = expectedOrderAmount;
    const receipt = `floxa-${milestone.id}-${crypto.randomBytes(6).toString('hex')}`;
    const notes = {
      project_id: String(project.id),
      milestone_id: String(milestone.id),
      milestone_type: String(milestone.type),
    };

    let order: any;
    try {
      order = await createRazorpayOrder({
        amount: orderAmount,
        currency,
        receipt,
        notes,
        credentials: rzpCreds,
      });
    } catch {
      res.status(503).json({ detail: 'Unable to create payment order. Please try again later.' });
      return;
    }

    const razorpayOrderId = order?.id;
    if (!razorpayOrderId) {
      res.status(502).json({ detail: 'Payment gateway returned an invalid order.' });
      return;
    }

    const transaction = await PaymentTransaction.create({
      projectId: project.id,
      milestoneId: milestone.id,
      razorpayOrderId,
      amount: milestone.amount,
      currency,
      status: 'created',
    });

    res.status(201).json(buildCreateOrderPayload(transaction, milestone, false, rzpCreds.keyId));
  } catch (err) {
    next(err);
  }
}

export async function verifyPortalPayment(req: any, res: Response, next: NextFunction) {
  try {
    const project = req.project;
    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    const razorpayOrderId = typeof req.body?.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
    const razorpayPaymentId = typeof req.body?.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';
    const razorpaySignature = typeof req.body?.razorpay_signature === 'string' ? req.body.razorpay_signature.trim() : '';

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ detail: 'Payment verification details are required.' });
      return;
    }

    const transaction = await PaymentTransaction.findOne({
      projectId: project.id,
      razorpayOrderId,
    }).populate(['milestone', 'project']);

    if (!transaction) {
      res.status(404).json({ detail: 'Payment transaction not found.' });
      return;
    }

    const milestone = transaction.milestone;
    if (!milestone || milestone.projectId?.toString() !== project.id) {
      res.status(404).json({ detail: 'Payment transaction not found.' });
      return;
    }

    if (transaction.status === 'verified') {
      if (transaction.razorpayPaymentId && transaction.razorpayPaymentId !== razorpayPaymentId) {
        res.status(400).json({ detail: 'Payment transaction is already verified.' });
        return;
      }

      res.status(200).json({
        detail: 'Payment verified successfully.',
        transaction_id: transaction.id,
        transaction_status: transaction.status,
        milestone: serializePaymentMilestone(milestone),
      });
      return;
    }

    if (transaction.status !== 'created') {
      res.status(400).json({ detail: 'Payment transaction is not eligible for verification.' });
      return;
    }

    if (milestone.status !== 'requested') {
      res.status(400).json({ detail: 'Only requested payment milestones can be verified.' });
      return;
    }

    let consultant = project.consultant;
    if (!consultant && project.consultantId) {
      consultant = await Consultant.findById(project.consultantId);
    }
    const rzpCreds = resolveRazorpayCredentials(consultant);

    if (!rzpCreds.keyId || !rzpCreds.keySecret) {
      res.status(503).json({ detail: 'Payment gateway is not configured.' });
      return;
    }

    const isValidSignature = verifyPaymentSignatureWithSecret({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      secret: rzpCreds.keySecret,
    });

    if (!isValidSignature) {
      res.status(400).json({ detail: 'Payment verification failed.' });
      return;
    }

    let providerPayment: any;
    try {
      providerPayment = await fetchRazorpayPayment(razorpayPaymentId, rzpCreds);
    } catch {
      res.status(503).json({ detail: 'Unable to confirm payment with Razorpay.' });
      return;
    }

    if (!providerPayment || typeof providerPayment !== 'object') {
      res.status(400).json({ detail: 'Payment verification failed.' });
      return;
    }

    const expectedAmount = amountToSmallestUnit(transaction.amount);
    const providerAmount = Number(providerPayment.amount);
    const providerCurrency = String(providerPayment.currency || '').toUpperCase();
    const expectedCurrency = String(transaction.currency || '').toUpperCase();

    if (
      providerPayment.id !== razorpayPaymentId ||
      providerPayment.order_id !== transaction.razorpayOrderId ||
      providerAmount !== expectedAmount ||
      providerCurrency !== expectedCurrency ||
      providerPayment.status !== 'captured'
    ) {
      res.status(400).json({ detail: 'Payment verification failed.' });
      return;
    }

    let completionResult;
    try {
      completionResult = await completePaymentMilestone({
        projectId: project.id,
        milestoneId: milestone.id,
        actorType: 'client',
        paymentSource: 'razorpay',
        transactionId: transaction.id,
        razorpayPaymentId,
      });
    } catch (err: any) {
      if (err instanceof PaymentCompletionError) {
        res.status(err.statusCode || 400).json({ detail: err.message });
        return;
      }
      throw err;
    }

    res.status(200).json({
      detail: 'Payment verified successfully.',
      transaction_id: completionResult.transaction?.id || transaction.id,
      transaction_status: completionResult.transaction?.status || 'verified',
      milestone: serializePaymentMilestone(completionResult.milestone),
    });
  } catch (err) {
    next(err);
  }
}

export async function portalSignOff(req: any, res: Response, next: NextFunction) {
  try {
    if (req.project.clientSignedOff) {
      res.json(serializeProject(req.project, 'delivered'));
      return;
    }

    const hasShared = await Deliverable.findOne({
      projectId: req.project.id,
      status: 'shared',
    });

    if (!hasShared) {
      res.status(400).json({ detail: 'Final delivery is not available for sign-off yet.' });
      return;
    }

    const milestones = await PaymentMilestone.find({ projectId: req.project.id });
    const unpaid = milestones.filter((m) => m.status !== 'paid');
    if (unpaid.length > 0) {
      res.status(400).json({ detail: 'All payment milestones must be paid before sign-off.' });
      return;
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.project.id,
      {
        $set: {
          clientSignedOff: true,
          signedOffAt: new Date(),
          status: 'delivered',
          progress: 100,
        },
      },
      { new: true }
    ).populate('client');

    await logProjectActivity({
      projectId: req.project.id,
      consultantId: req.project.consultantId?.toString() || req.project.consultantId,
      actorType: 'client',
      action: 'project_signed_off',
      description: 'Client accepted the final delivery and completed the project.',
      visibleToClient: true,
      metadata: {
        project_id: req.project.id,
        signed_off_at: updatedProject!.signedOffAt?.toISOString(),
        project_status: updatedProject!.status,
      },
    });

    res.json(serializeProject(updatedProject, 'delivered'));
  } catch (err) {
    next(err);
  }
}

export async function getPortalActivities(req: any, res: Response, next: NextFunction) {
  try {
    const activities = await ProjectActivity.find({
      projectId: req.project.id,
      visibleToClient: true,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(activities.map(serializeClientPortalActivity));
  } catch (err) {
    next(err);
  }
}

export async function markPortalActivitiesRead(req: any, res: Response, next: NextFunction) {
  try {
    const result = await ProjectActivity.updateMany(
      {
        projectId: req.project.id,
        visibleToClient: true,
        clientIsRead: false,
      },
      {
        $set: {
          clientIsRead: true,
          clientReadAt: new Date(),
        },
      }
    );

    res.json({ marked_read: result.modifiedCount });
  } catch (err) {
    next(err);
  }
}

export async function getPortalHelpStatus(req: any, res: Response, next: NextFunction) {
  try {
    const activeHelp = await getLatestActiveHelp(req.project.id);
    res.json({
      success: true,
      active_help: activeHelp && activeHelp.is_active ? activeHelp : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function requestPortalHelp(req: any, res: Response, next: NextFunction) {
  try {
    const { page_id, field_key, question } = req.body;
    const pageId = String(page_id || 'Step 1');
    const fieldKey = String(field_key || '');
    const q = String(question || 'Client requested assistance.');
    const clientName = req.project.client?.name || req.project.companyName || 'Client';
    const description = `${clientName} requested help on ${pageId}: "${q}"`;

    const consultantId =
      req.project.consultantId?.toString() || req.project.consultantId;

    // Deduplicate: ignore if an identical request was already logged within the last 5 seconds
    const recentDuplicate = await ProjectActivity.findOne({
      projectId: req.project.id,
      action: 'client_help_requested',
      description,
      createdAt: { $gte: new Date(Date.now() - 5000) },
    });

    if (recentDuplicate) {
      return res.json({
        success: true,
        message: 'Consultant already notified.',
        activity_id: recentDuplicate.id,
        description,
      });
    }

    const activity = await logProjectActivity({
      projectId: req.project.id,
      consultantId,
      actorType: 'client',
      action: 'client_help_requested',
      description,
      metadata: {
        page_id: pageId,
        field_key: fieldKey,
        question: q,
        portal_token: req.project.portalToken,
        project_id: req.project.id,
      },
      visibleToClient: true,
    });

    broadcastHelpRequested(req.project.id, consultantId, {
      project_id: req.project.id,
      project_title: req.project.title,
      client_name: clientName,
      portal_token: req.project.portalToken,
      page_id: pageId,
      field_key: fieldKey,
      question: q,
      requested_at: activity.createdAt.toISOString(),
    });

    res.json({
      success: true,
      message: 'Consultant notified successfully.',
      activity_id: activity.id,
      description,
    });
  } catch (err) {
    next(err);
  }
}

export async function resolvePortalHelp(req: any, res: Response, next: NextFunction) {
  try {
    const { page_id } = req.body;
    const pageId = String(page_id || '');

    const consultantId =
      req.project.consultantId?.toString() || req.project.consultantId;

    // Deduplicate: ignore if already resolved within the last 5 seconds
    const recentDuplicate = await ProjectActivity.findOne({
      projectId: req.project.id,
      action: 'client_help_resolved',
      createdAt: { $gte: new Date(Date.now() - 5000) },
    });

    if (recentDuplicate) {
      return res.json({ success: true, message: 'Help session resolved.' });
    }

    await logProjectActivity({
      projectId: req.project.id,
      consultantId,
      actorType: 'client',
      action: 'client_help_resolved',
      description: `Help session on ${pageId || 'step'} resolved.`,
      metadata: { page_id: pageId },
      visibleToClient: true,
    });

    broadcastHelpResolved(
      req.project.id,
      {
        project_id: req.project.id,
        page_id: pageId,
        resolved_by: 'client',
      },
      consultantId
    );

    res.json({ success: true, message: 'Help session resolved.' });
  } catch (err) {
    next(err);
  }
}
