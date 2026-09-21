import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest, PortalRequest } from '../types/express.js';
import { Project } from '../models/project.model.js';
import { GeneratedAgreementSnapshot } from '../models/agreement.model.js';
import { resolveSafeMediaPath, streamLocalFile } from '../services/storage.service.js';
import {
  maybeGenerateAgreementSnapshot,
  isGeneratedAgreementShared,
  getGeneratedAgreementPayload,
  saveAgreementSnapshotPdf,
  generateAgreementSnapshotPdf,
  acceptGeneratedAgreement,
} from '../services/agreement.service.js';
import { logProjectActivity } from '../services/project.service.js';

// ==========================================
// Consultant Endpoints
// ==========================================

export async function getGeneratedAgreement(
  req: AuthenticatedRequest<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    await maybeGenerateAgreementSnapshot(id).catch(() => {});

    const snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    const pdfUrl = `/api/projects/${project.id}/generated-agreement/pdf/`;
    const payload = await getGeneratedAgreementPayload(snapshot, pdfUrl);

    res.status(200).json(payload);
  } catch (err: any) {
    next(err);
  }
}

export async function downloadGeneratedAgreementPdf(
  req: AuthenticatedRequest<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    let snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    if (!snapshot.pdfFile && snapshot.status === 'draft') {
      const gen = await generateAgreementSnapshotPdf(snapshot);
      if (gen) snapshot = gen;
    }

    let resolvedPath = snapshot.pdfFile ? resolveSafeMediaPath(snapshot.pdfFile) : null;
    if (!resolvedPath && snapshot.status === 'draft') {
      const sav = await saveAgreementSnapshotPdf(snapshot);
      if (sav) snapshot = sav;
      resolvedPath = snapshot.pdfFile ? resolveSafeMediaPath(snapshot.pdfFile) : null;
    }

    if (!resolvedPath) {
      res.status(404).json({ detail: 'Generated agreement PDF is not available.' });
      return;
    }

    streamLocalFile(resolvedPath, res, {
      filename: `generated-agreement-v${snapshot.version}.pdf`,
      isAttachment: req.query.download === '1',
      contentType: 'application/pdf',
    });
  } catch (err) {
    next(err);
  }
}

export async function regenerateGeneratedAgreementPdf(
  req: AuthenticatedRequest<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const lockedOrAccepted = await GeneratedAgreementSnapshot.findOne({
      projectId: id,
      status: { $in: ['accepted', 'locked'] },
    });

    if (lockedOrAccepted) {
      res.status(400).json({ detail: 'Generated agreement is locked.' });
      return;
    }

    let snapshot = await GeneratedAgreementSnapshot.findOne({
      projectId: id,
      status: 'draft',
    }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement draft not found.' });
      return;
    }

    const generated = await generateAgreementSnapshotPdf(snapshot);
    if (!generated) {
      res.status(500).json({ detail: 'Failed to generate agreement PDF.' });
      return;
    }
    snapshot = generated;

    await logProjectActivity({
      projectId: project.id,
      consultantId: String(project.consultantId || ''),
      actorType: 'system',
      action: 'agreement_pdf_generated',
      description: `System generated agreement PDF for draft v${snapshot.version}.`,
      metadata: {
        generated_agreement_snapshot_id: snapshot.id,
        version: snapshot.version,
        pdf_file: snapshot.pdfFile,
      },
      visibleToClient: false,
    });

    const pdfUrl = `/api/projects/${project.id}/generated-agreement/pdf/`;
    const payload = await getGeneratedAgreementPayload(snapshot, pdfUrl);

    res.status(200).json(payload);
  } catch (err: any) {
    if (err?.message && err.message.includes('Only draft')) {
      res.status(400).json({ detail: 'Generated agreement is locked.' });
      return;
    }
    next(err);
  }
}

export async function shareGeneratedAgreement(
  req: AuthenticatedRequest<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    let snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    if (!snapshot.pdfFile && snapshot.status === 'draft') {
      const saved = await saveAgreementSnapshotPdf(snapshot);
      if (saved) snapshot = saved;
    }

    const sharedAt = new Date();
    await logProjectActivity({
      projectId: project.id,
      consultantId: String(project.consultantId || ''),
      actorType: 'consultant',
      action: 'agreement_shared',
      description: `Consultant shared generated agreement v${snapshot.version} with the client.`,
      metadata: {
        generated_agreement_snapshot_id: snapshot.id,
        agreement_version: snapshot.version,
        shared_at: sharedAt.toISOString(),
        consultant_id: req.user!.id,
        consultant_name: req.user!.name,
      },
      visibleToClient: true,
    });

    const pdfUrl = `/api/projects/${project.id}/generated-agreement/pdf/`;
    const payload = await getGeneratedAgreementPayload(snapshot, pdfUrl);

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Client Portal Endpoints
// ==========================================

export async function getPortalGeneratedAgreement(req: PortalRequest, res: Response, next: NextFunction) {
  try {
    const project = req.project;

    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    let snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: project.id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    if (snapshot.status === 'draft') {
      const shared = await isGeneratedAgreementShared(snapshot);
      if (!shared) {
        res.status(404).json({ detail: 'Generated agreement not found.' });
        return;
      }
    }

    if (!snapshot.pdfFile && snapshot.status === 'draft') {
      snapshot = await generateAgreementSnapshotPdf(snapshot);
    }

    const pdfUrl = `/api/client-portal/${project.portalToken}/generated-agreement/pdf/`;
    const payload = await getGeneratedAgreementPayload(snapshot, pdfUrl);

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

export async function downloadPortalGeneratedAgreementPdf(req: PortalRequest, res: Response, next: NextFunction) {
  try {
    const project = req.project;

    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    let snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: project.id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    if (snapshot.status === 'draft') {
      const shared = await isGeneratedAgreementShared(snapshot);
      if (!shared) {
        res.status(404).json({ detail: 'Generated agreement not found.' });
        return;
      }
    }

    if (!snapshot.pdfFile && snapshot.status === 'draft') {
      const gen = await generateAgreementSnapshotPdf(snapshot);
      if (gen) snapshot = gen;
    }

    let resolvedPath = snapshot.pdfFile ? resolveSafeMediaPath(snapshot.pdfFile) : null;
    if (!resolvedPath && snapshot.status === 'draft') {
      const sav = await saveAgreementSnapshotPdf(snapshot);
      if (sav) snapshot = sav;
      resolvedPath = snapshot.pdfFile ? resolveSafeMediaPath(snapshot.pdfFile) : null;
    }

    if (!resolvedPath) {
      res.status(404).json({ detail: 'Generated agreement PDF is not available.' });
      return;
    }

    if (req.query.download === '1') {
      const downloadedAt = new Date();
      await logProjectActivity({
        projectId: project.id,
        consultantId: String(project.consultantId || ''),
        actorType: 'client',
        action: 'agreement_downloaded',
        description: `Client downloaded generated agreement v${snapshot.version}.`,
        metadata: {
          ip_address: req.ip || '',
          user_agent: req.headers['user-agent'] || '',
          generated_agreement_snapshot_id: snapshot.id,
          agreement_version: snapshot.version,
          downloaded_at: downloadedAt.toISOString(),
        },
        visibleToClient: true,
      });
    }

    streamLocalFile(resolvedPath, res, {
      filename: `generated-agreement-v${snapshot.version}.pdf`,
      isAttachment: req.query.download === '1',
      contentType: 'application/pdf',
    });
  } catch (err) {
    next(err);
  }
}

export async function acceptPortalGeneratedAgreement(req: PortalRequest, res: Response, next: NextFunction) {
  try {
    const project = req.project;

    if (!project) {
      res.status(404).json({ detail: 'Client portal link not found.' });
      return;
    }

    const accepted = req.body?.accepted === true;
    if (!accepted) {
      res.status(400).json({
        accepted: ['You must confirm that you have read and accept this agreement.'],
      });
      return;
    }

    const snapshot = await GeneratedAgreementSnapshot.findOne({ projectId: project.id }).sort({ version: -1 });

    if (!snapshot) {
      res.status(404).json({ detail: 'Generated agreement not found.' });
      return;
    }

    if (snapshot.status === 'draft') {
      const shared = await isGeneratedAgreementShared(snapshot);
      if (!shared) {
        res.status(404).json({ detail: 'Generated agreement not found.' });
        return;
      }
    }

    if (snapshot.status !== 'draft') {
      res.status(400).json({ detail: 'Agreement has already been accepted.' });
      return;
    }

    const clientEvidence = {
      ip_address: req.ip || '',
      user_agent: req.headers['user-agent'] || '',
    };

    try {
      const updatedSnapshot = await acceptGeneratedAgreement(project, snapshot, clientEvidence);
      const pdfUrl = `/api/client-portal/${project.portalToken}/generated-agreement/pdf/`;
      const payload = await getGeneratedAgreementPayload(updatedSnapshot, pdfUrl);

      res.status(200).json(payload);
    } catch (acceptErr: any) {
      if (acceptErr?.message === 'ALREADY_ACCEPTED') {
        res.status(400).json({ detail: 'Agreement has already been accepted.' });
        return;
      }
      throw acceptErr;
    }
  } catch (err) {
    next(err);
  }
}
