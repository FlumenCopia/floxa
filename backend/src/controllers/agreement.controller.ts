import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { prisma } from '../prisma/client.js';
import { generateBasicAgreementPdf } from '../services/pdf.service.js';
import { saveFile, resolveSafeMediaPath, streamLocalFile } from '../services/storage.service.js';
import { sendAgreementSignatureRequestEmail, sendSignedProjectAgreementEmail, sanitizeEmailError } from '../services/email.service.js';
import { logProjectActivity } from '../services/project.service.js';
import { serializeProjectAgreement } from '../utils/serializer.js';

// Map of in-flight retry promises keyed by agreement ID.
// Note: This in-memory mechanism coalesces concurrent overlapping requests within this single Node.js process instance.
// Multi-instance / clustered deployments would require a distributed lock/queue (such as Redis).
const inFlightSignedEmailRetries = new Map<string, Promise<{ status: number; data: unknown }>>();

export async function getAgreement(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await prisma.project.findFirst({
      where: { id, consultantId: req.user!.id, isArchived: false },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await prisma.projectAgreement.findUnique({
      where: { projectId: id },
      include: {
        project: true,
      },
    });

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
    const project = await prisma.project.findUnique({
      where: { id },
      include: { client: true, consultant: true },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const pdfBuffer = await generateBasicAgreementPdf(project);
    const savedPath = await saveFile('project_agreements/basic', `agreement_${project.portalToken}.pdf`, pdfBuffer, 'application/pdf');

    const agreement = await prisma.projectAgreement.upsert({
      where: { projectId: id },
      update: {
        basicPdfFile: savedPath,
        generatedAt: new Date(),
        status: 'draft',
      },
      create: {
        projectId: id,
        basicPdfFile: savedPath,
        generatedAt: new Date(),
        status: 'draft',
      },
    });

    await logProjectActivity({
      projectId: id,
      consultantId: project.consultantId,
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
    const agreement = await prisma.projectAgreement.update({
      where: { projectId: id },
      data: {
        status: 'shared',
        sharedAt: new Date(),
      },
      include: { project: { include: { client: true, consultant: true } } },
    });

    await logProjectActivity({
      projectId: id,
      consultantId: agreement.project.consultantId,
      actorType: 'consultant',
      action: 'agreement_shared',
      description: 'Consultant shared the basic agreement with the client.',
      visibleToClient: true,
    });

    res.json({ id: agreement.id, status: agreement.status });
  } catch (err) {
    next(err);
  }
}

export async function requestSignature(req: AuthenticatedRequest<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const agreement = await prisma.projectAgreement.findUnique({
      where: { projectId: id },
      include: { project: { include: { client: true } } },
    });

    if (!agreement || !agreement.basicPdfFile) {
      res.status(400).json({ detail: 'Generate agreement PDF before requesting signature.' });
      return;
    }

    const updated = await prisma.projectAgreement.update({
      where: { projectId: id },
      data: {
        status: 'signature_requested',
        signatureRequestedAt: new Date(),
      },
    });

    await sendAgreementSignatureRequestEmail(agreement.project, updated);

    await logProjectActivity({
      projectId: id,
      consultantId: agreement.project.consultantId,
      actorType: 'consultant',
      action: 'agreement_signature_requested',
      description: 'Consultant requested client signature for the agreement.',
      visibleToClient: true,
    });

    res.json({ id: updated.id, status: updated.status });
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
    const project = await prisma.project.findFirst({
      where: { id: projectId, consultantId: req.user!.id, isArchived: false },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await prisma.projectAgreement.findUnique({
      where: { projectId: project.id },
    });

    if (!agreement) {
      res.status(404).json({ detail: 'Agreement not found.' });
      return;
    }

    const type = req.query.type;
    let targetFile: string | null = null;
    if (type === 'basic') {
      targetFile = agreement.basicPdfFile;
    } else if (type === 'signed' || type === 'original_signed') {
      targetFile = agreement.signedPdfFile;
    } else {
      targetFile = agreement.signedPdfFile || agreement.basicPdfFile;
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
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        consultantId: req.user!.id,
        isArchived: false,
      },
      include: {
        client: true,
        consultant: true,
        clientProfile: true,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const agreement = await prisma.projectAgreement.findUnique({
      where: { projectId: project.id },
      include: {
        project: true,
      },
    });

    if (!agreement || !agreement.signedAt || !agreement.signedPdfFile) {
      res.status(404).json({ detail: 'Signed agreement PDF is not available.' });
      return;
    }

    // Coalesce overlapping requests for the same agreement into one in-flight send
    let inFlight = inFlightSignedEmailRetries.get(agreement.id);
    if (inFlight) {
      const result = await inFlight;
      res.status(result.status).json(result.data);
      return;
    }

    const retryPromise = (async () => {
      try {
        // Step 1: Send the email
        await sendSignedProjectAgreementEmail(project, agreement);

        // Step 2: Update database record
        try {
          const updatedAgreement = await prisma.projectAgreement.update({
            where: { id: agreement.id },
            data: {
              signedEmailFailedAt: null,
              signedEmailError: '',
            },
            include: {
              project: true,
            },
          });

          return {
            status: 200,
            data: serializeProjectAgreement(updatedAgreement, req),
          };
        } catch (dbUpdateError) {
          // Provider accepted email, but local database update failed.
          // Do NOT automatically resend! Accurately report delivery state uncertainty.
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
          await prisma.projectAgreement.update({
            where: { id: agreement.id },
            data: {
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

