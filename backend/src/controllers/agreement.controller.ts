import { Request, Response, NextFunction } from 'express';
import { ProjectAgreement } from '../models/agreement.model.js';
import { Project } from '../models/project.model.js';
import { generateBasicAgreementPdf } from '../services/pdf.service.js';
import { saveFile, resolveSafeMediaPath, streamLocalFile } from '../services/storage.service.js';
import {
  sendAgreementSignatureRequestEmail,
  sendSignedProjectAgreementEmail,
  sanitizeEmailError,
} from '../services/email.service.js';
import { logProjectActivity } from '../services/project.service.js';
import { serializeProjectAgreement } from '../utils/serializer.js';
import type { AuthenticatedRequest } from '../types/express.js';

const inFlightSignedEmailRetries = new Map<string, Promise<{ status: number; data: unknown }>>();

export async function getAgreement(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findOne({ _id: id, consultantId: req.user!.id, isArchived: false });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await ProjectAgreement.findOne({ projectId: id });
    if (!agreement) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    res.json(serializeProjectAgreement(agreement, req));
  } catch (err) {
    next(err);
  }
}

export async function generateAgreement(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findById(id).populate(['client', 'consultant']);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const pdfBuffer = await generateBasicAgreementPdf(project);
    const savedPath = await saveFile(
      'project_agreements/basic',
      `agreement_${project.portalToken}.pdf`,
      pdfBuffer,
      'application/pdf'
    );

    const agreement = await ProjectAgreement.findOneAndUpdate(
      { projectId: id },
      {
        $set: {
          basicPdfFile: savedPath,
          generatedAt: new Date(),
          status: 'draft',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'agreement_generated',
      description: 'Consultant generated project agreement PDF.',
    });

    res.json({
      id: agreement.id,
      status: agreement.status,
      basic_pdf_file: agreement.basicPdfFile,
    });
  } catch (err) {
    next(err);
  }
}

export async function shareAgreement(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const agreement = await ProjectAgreement.findOneAndUpdate(
      { projectId: id },
      {
        $set: {
          status: 'shared',
          sharedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!agreement) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'agreement_shared',
        description: 'Consultant shared the basic agreement with the client.',
        visibleToClient: true,
      });
    }

    res.json({ id: agreement.id, status: agreement.status });
  } catch (err) {
    next(err);
  }
}

export async function requestSignature(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const agreement = await ProjectAgreement.findOne({ projectId: id });

    if (!agreement || !agreement.basicPdfFile) {
      res.status(400).json({ detail: 'Generate agreement PDF before requesting signature.' });
      return;
    }

    const project = await Project.findById(id).populate('client');
    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const updated = await ProjectAgreement.findByIdAndUpdate(
      agreement.id,
      {
        $set: {
          status: 'signature_requested',
          signatureRequestedAt: new Date(),
        },
      },
      { new: true }
    );

    await sendAgreementSignatureRequestEmail(project, updated);

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'agreement_signature_requested',
      description: 'Consultant requested client signature for the agreement.',
      visibleToClient: true,
    });

    res.json({ id: updated!.id, status: updated!.status });
  } catch (err) {
    next(err);
  }
}

export async function downloadAgreementFile(
  req: AuthenticatedRequest<{ id?: string; project_id?: string }, unknown, unknown, { type?: string; download?: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const project = await Project.findOne({
      _id: projectId,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await ProjectAgreement.findOne({ projectId: project.id });
    if (!agreement) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    const type = req.query.type;
    let targetFile: string | null = null;
    if (type === 'basic') {
      targetFile = agreement.basicPdfFile || null;
    } else if (type === 'signed' || type === 'original_signed') {
      targetFile = agreement.signedPdfFile || null;
    } else {
      targetFile = agreement.signedPdfFile || agreement.basicPdfFile || null;
    }

    if (!targetFile) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(targetFile);
    if (!safePath) {
      res.status(404).json({ detail: 'File not found.' });
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

export async function retrySignedEmail(
  req: AuthenticatedRequest<{ id?: string; project_id?: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const project = await Project.findOne({
      _id: projectId,
      consultantId: req.user!.id,
      isArchived: false,
    }).populate(['client', 'consultant', 'clientProfile']);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await ProjectAgreement.findOne({ projectId: project.id });
    if (!agreement || !agreement.signedAt || !agreement.signedPdfFile) {
      res.status(404).json({ detail: 'Signed agreement PDF is not available.' });
      return;
    }

    let inFlight = inFlightSignedEmailRetries.get(agreement.id);
    if (inFlight) {
      const result = await inFlight;
      res.status(result.status).json(result.data);
      return;
    }

    const retryPromise = (async () => {
      try {
        await sendSignedProjectAgreementEmail(project, agreement);

        try {
          const updatedAgreement = await ProjectAgreement.findByIdAndUpdate(
            agreement.id,
            {
              $set: {
                signedEmailFailedAt: null,
                signedEmailError: '',
              },
            },
            { new: true }
          );

          return {
            status: 200,
            data: serializeProjectAgreement(updatedAgreement, req),
          };
        } catch (dbUpdateError) {
          console.error(
            `[Delivery State Uncertainty] Signed agreement email accepted by provider for agreement ${agreement.id} but DB update failed:`,
            dbUpdateError
          );
          return {
            status: 500,
            data: {
              detail: 'Signed agreement email was accepted by provider, but the local delivery state could not be updated.',
              delivery_status: 'uncertain',
            },
          };
        }
      } catch (emailError: unknown) {
        const sanitizedError = sanitizeEmailError(emailError);
        try {
          await ProjectAgreement.findByIdAndUpdate(agreement.id, {
            $set: {
              signedEmailFailedAt: new Date(),
              signedEmailError: sanitizedError,
            },
          });
        } catch (dbErr) {
          console.error('Failed to update signed email failure in DB:', dbErr);
        }

        return {
          status: 502,
          data: { detail: 'Signed agreement is valid, but email retry failed.' },
        };
      } finally {
        inFlightSignedEmailRetries.delete(agreement.id);
      }
    })();

    inFlightSignedEmailRetries.set(agreement.id, retryPromise);
    const outcome = await retryPromise;
    res.status(outcome.status).json(outcome.data);
  } catch (err) {
    next(err);
  }
}
