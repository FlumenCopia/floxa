import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedRequest, FileUploadRequest } from '../types/express.js';
import path from 'path';
import { prisma } from '../prisma/client.js';
import { saveFile, optimizeImageBuffer, validateUploadedFile, resolveSafeMediaPath, streamLocalFile } from '../services/storage.service.js';
import { logProjectActivity, recalculatePaymentMilestones, calculateProjectProgress } from '../services/project.service.js';
import { serializeMoodboard, serializeConcept, serializeDeliverable, serializePaymentMilestone } from '../utils/serializer.js';
import { generateBrandDeliverablesPdf } from '../services/pdf.service.js';

// ==================== MOODBOARDS ====================

export async function getMoodboards(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const moodboards = await prisma.moodboard.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(moodboards.map((m) => serializeMoodboard(m, baseUrl)));
  } catch (err) {
    next(err);
  }
}

export async function createMoodboard(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { title, description } = req.body as { title?: any; description?: any };

    if (!title || !req.file) {
      res.status(400).json({ detail: 'Title and image file are required.' });
      return;
    }

    validateUploadedFile(req.file, 'moodboard_image');
    const { buffer, filename } = await optimizeImageBuffer(req.file.buffer, req.file.originalname);
    const savedPath = await saveFile('moodboards', filename, buffer, req.file.mimetype);

    const moodboard = await prisma.moodboard.create({
      data: {
        projectId: id,
        title: title.trim(),
        description: (description || '').trim(),
        image: savedPath,
        isShared: true,
      },
    });

    const project = await prisma.project.findUnique({ where: { id } });
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: project.consultantId,
        actorType: 'consultant',
        action: 'moodboard_created',
        description: `Consultant uploaded moodboard: ${moodboard.title}`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeMoodboard(moodboard, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteMoodboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, moodboard_id } = req.params;
    await prisma.moodboard.delete({
      where: { id: moodboard_id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ==================== CONCEPTS ====================

export async function getConcepts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const concepts = await prisma.concept.findMany({
      where: { projectId: id },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(concepts.map((c) => serializeConcept(c, baseUrl)));
  } catch (err) {
    next(err);
  }
}

export async function createConcept(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { title, description } = req.body as { title?: any; description?: any };

    const project = await prisma.project.findFirst({
      where: {
        id,
        consultantId: req.user?.id,
        isArchived: false,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    if (!title) {
      res.status(400).json({ detail: 'Title is required.' });
      return;
    }

    let imagePath: string | undefined;
    let filePath: string | undefined;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (files && files.image && files.image[0]) {
      const imgFile = files.image[0];
      validateUploadedFile(imgFile, 'concept_image');
      const { buffer, filename } = await optimizeImageBuffer(imgFile.buffer, imgFile.originalname);
      imagePath = await saveFile('concepts', filename, buffer, imgFile.mimetype);
    }

    if (files && files.file && files.file[0]) {
      const docFile = files.file[0];
      validateUploadedFile(docFile, 'concept_file');
      filePath = await saveFile('concepts/files', docFile.originalname, docFile.buffer, docFile.mimetype);
    }

    // Get current max version
    const latest = await prisma.concept.findFirst({
      where: { projectId: id },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version || 0) + 1;

    const concept = await prisma.concept.create({
      data: {
        projectId: id,
        title: title.trim(),
        description: (description || '').trim(),
        image: imagePath,
        file: filePath,
        version,
        status: 'draft',
      },
    });

    await logProjectActivity({
      projectId: id,
      consultantId: project.consultantId,
      actorType: 'consultant',
      action: 'concept_uploaded',
      description: 'You uploaded 1 concept.',
      metadata: {
        concept_id: concept.id,
        concept_title: concept.title,
        concept_count: 1,
      },
      visibleToClient: false,
    });

    await recalculatePaymentMilestones(id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeConcept(concept, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function updateConcept(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;
    const { title, description } = req.body as { title?: any; description?: any };

    const project = await prisma.project.findFirst({
      where: {
        id,
        consultantId: req.user?.id,
        isArchived: false,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const concept = await prisma.concept.findFirst({
      where: {
        id: concept_id,
        projectId: id,
      },
    });

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    if (concept.status === 'approved') {
      res.status(400).json({ detail: 'Approved concepts cannot be edited.' });
      return;
    }

    const data: Prisma.ConceptUpdateInput = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (files && files.image && files.image[0]) {
      const imgFile = files.image[0];
      validateUploadedFile(imgFile, 'concept_image');
      const { buffer, filename } = await optimizeImageBuffer(imgFile.buffer, imgFile.originalname);
      data.image = await saveFile('concepts', filename, buffer, imgFile.mimetype);
    }

    if (files && files.file && files.file[0]) {
      const docFile = files.file[0];
      validateUploadedFile(docFile, 'concept_file');
      data.file = await saveFile('concepts/files', docFile.originalname, docFile.buffer, docFile.mimetype);
    }

    if (concept.status === 'shared' || concept.status === 'changes_requested') {
      data.status = 'draft';
    }

    const updated = await prisma.concept.update({
      where: { id: concept_id },
      data,
    });

    await recalculatePaymentMilestones(id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeConcept(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        consultantId: req.user?.id,
        isArchived: false,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const concept = await prisma.concept.findFirst({
      where: {
        id: concept_id,
        projectId: id,
      },
    });

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    if (concept.status === 'approved') {
      res.status(400).json({ detail: 'Approved concepts cannot be deleted.' });
      return;
    }

    if (concept.status === 'shared' || concept.status === 'changes_requested') {
      await logProjectActivity({
        projectId: id,
        consultantId: project.consultantId,
        actorType: 'consultant',
        action: 'concept_removed',
        description: `A previously shared concept is no longer available: ${concept.title}`,
        metadata: {
          concept_id: concept.id,
          concept_title: concept.title,
        },
        visibleToClient: true,
      });
    }

    await prisma.concept.delete({ where: { id: concept_id } });
    await recalculatePaymentMilestones(id);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function shareConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;

    // 1. Verify project exists, belongs to consultant, and is not archived
    const project = await prisma.project.findFirst({
      where: {
        id,
        consultantId: req.user?.id,
        isArchived: false,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    // 2. Verify concept exists and belongs to this project
    const concept = await prisma.concept.findFirst({
      where: {
        id: concept_id,
        projectId: id,
      },
    });

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    // 3. Validation: Approved concepts cannot be shared again
    if (concept.status === 'approved') {
      res.status(400).json({ detail: 'Approved concepts cannot be shared again.' });
      return;
    }

    // 4. Check if concept was previously shared to determine activity action & description
    const existingActivities = await prisma.projectActivity.findMany({
      where: {
        projectId: id,
        visibleToClient: true,
        action: { in: ['concept_shared', 'concept_reshared'] },
      },
      select: { metadata: true },
    });

    const wasPreviouslyShared = existingActivities.some((act) => {
      try {
        if (!act.metadata) return false;
        const parsed = JSON.parse(act.metadata);
        return parsed.concept_id === concept.id;
      } catch {
        return false;
      }
    });

    const activityAction = wasPreviouslyShared ? 'concept_reshared' : 'concept_shared';
    const activityDescription = wasPreviouslyShared
      ? `An updated concept is ready for your review: ${concept.title}`
      : `A new concept is ready for your review: ${concept.title}`;

    // 5. Update concept status to shared
    const updatedConcept = await prisma.concept.update({
      where: { id: concept_id },
      data: { status: 'shared' },
    });

    // 6. Recalculate payment milestones
    await recalculatePaymentMilestones(id);

    // 7. Log project activity
    await logProjectActivity({
      projectId: id,
      consultantId: project.consultantId,
      actorType: 'consultant',
      action: activityAction,
      description: activityDescription,
      metadata: {
        concept_id: concept.id,
        concept_title: concept.title,
        version: concept.version,
      },
      visibleToClient: true,
    });

    // 8. Recalculate project progress
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
        data: { progress: newProgress },
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeConcept(updatedConcept, baseUrl));
  } catch (err) {
    next(err);
  }
}

// ==================== DELIVERABLES ====================

export async function getDeliverablesSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        consultantId: req.user!.id,
        isArchived: false,
      },
      include: {
        moodboards: true,
        concepts: true,
        paymentMilestones: true,
        deliverables: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Selected moodboards (fallback to all moodboards if none selected)
    let moodboards = project.moodboards.filter((m) => m.isSelected);
    if (moodboards.length === 0) {
      moodboards = project.moodboards;
    }

    // Approved concepts (fallback to all concepts if none approved)
    let concepts = project.concepts.filter((c) => c.status === 'approved');
    if (concepts.length === 0) {
      concepts = project.concepts;
    }

    const serializedMoodboards = moodboards.map((m) => serializeMoodboard(m, baseUrl));
    const serializedConcepts = concepts.map((c) => serializeConcept(c, baseUrl));
    const serializedMilestones = project.paymentMilestones.map((m) => serializePaymentMilestone(m));
    const serializedDeliverables = project.deliverables.map((d) => serializeDeliverable(d, baseUrl));

    res.status(200).json({
      selected_moodboards: serializedMoodboards,
      approved_concepts: serializedConcepts,
      payment_milestones: serializedMilestones,
      deliverables: serializedDeliverables,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeliverables(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deliverables = await prisma.deliverable.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(deliverables.map((d) => serializeDeliverable(d, baseUrl)));
  } catch (err) {
    next(err);
  }
}

export async function createDeliverable(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { title, description } = req.body as { title?: any; description?: any };

    if (!title || !req.file) {
      res.status(400).json({ detail: 'Title and file are required.' });
      return;
    }

    validateUploadedFile(req.file, 'deliverable_file');
    const savedPath = await saveFile('deliverables', req.file.originalname, req.file.buffer, req.file.mimetype);

    const deliverable = await prisma.deliverable.create({
      data: {
        projectId: id,
        title: title.trim(),
        description: (description || '').trim(),
        file: savedPath,
        status: 'draft',
      },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeDeliverable(deliverable, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function updateDeliverable(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { deliverable_id } = req.params;
    const { title, description } = req.body as { title?: any; description?: any };

    const data: Prisma.DeliverableUpdateInput = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();

    if (req.file) {
      validateUploadedFile(req.file, 'deliverable_file');
      data.file = await saveFile('deliverables', req.file.originalname, req.file.buffer, req.file.mimetype);
    }

    const updated = await prisma.deliverable.update({
      where: { id: deliverable_id },
      data,
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeDeliverable(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteDeliverable(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, deliverable_id } = req.params;
    await prisma.deliverable.delete({ where: { id: deliverable_id } });
    await recalculatePaymentMilestones(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function shareDeliverable(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, deliverable_id } = req.params;
    const deliverable = await prisma.deliverable.update({
      where: { id: deliverable_id },
      data: { status: 'shared' },
    });

    await recalculatePaymentMilestones(id);

    const project = await prisma.project.findUnique({ where: { id } });
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: project.consultantId,
        actorType: 'consultant',
        action: 'deliverable_shared',
        description: `Deliverable shared with client: ${deliverable.title}`,
        visibleToClient: true,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeDeliverable(deliverable, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function autoGenerateDeliverables(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, consultantId: req.user!.id, isArchived: false },
      include: {
        client: true,
        consultant: true,
        brandDNA: true,
        discovery: true,
        moodboards: true,
        concepts: true,
        paymentMilestones: true,
        deliverables: true,
      },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    // Clean up any empty placeholder dummy deliverables from earlier buggy runs
    await prisma.deliverable.deleteMany({
      where: {
        projectId: id,
        file: '',
        title: {
          in: [
            'Primary Brand Logo Kit (PNG, SVG, Vector)',
            'Brand Typography & Color System Spec',
            'Comprehensive Brand Identity Guidelines',
          ],
        },
      },
    });

    // Generate real PDF buffer with client selected/approved data
    const pdfBuffer = await generateBrandDeliverablesPdf(project);
    const filename = `Brand_Delivery_Package_${project.id}.pdf`;
    const savedPath = await saveFile('deliverables', filename, pdfBuffer, 'application/pdf');

    const description =
      'Auto-generated comprehensive Brand Delivery Package & Strategy Guide including moodboards, concepts, Brand DNA, and payment records.';

    // Check if deliverable already exists for this project (upsert)
    const existing = await prisma.deliverable.findFirst({
      where: {
        projectId: id,
        title: { contains: 'Brand Delivery Package', mode: 'insensitive' },
      },
    });

    let deliverable;
    if (existing) {
      deliverable = await prisma.deliverable.update({
        where: { id: existing.id },
        data: {
          file: savedPath,
          description,
        },
      });
    } else {
      deliverable = await prisma.deliverable.create({
        data: {
          projectId: id,
          title: 'Brand Delivery Package & Strategy Guide.pdf',
          description,
          file: savedPath,
          status: 'draft',
        },
      });
    }

    // Log project activity
    await logProjectActivity({
      projectId: id,
      consultantId: project.consultantId,
      actorType: 'consultant',
      action: 'deliverable_uploaded',
      description: 'Auto-generated final Brand Delivery Package PDF.',
      metadata: {
        deliverable_id: deliverable.id,
        deliverable_title: deliverable.title,
        auto_generated: true,
      },
      visibleToClient: false,
    });

    const allDeliverables = await prisma.deliverable.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      deliverable: serializeDeliverable(deliverable, baseUrl),
      deliverables: allDeliverables.map((d) => serializeDeliverable(d, baseUrl)),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadMoodboardImage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const moodboardId = req.params.moodboard_id;

    const project = await prisma.project.findFirst({
      where: { id: projectId, consultantId: req.user!.id, isArchived: false },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const moodboard = await prisma.moodboard.findFirst({
      where: { id: moodboardId, projectId: project.id },
    });

    if (!moodboard || !moodboard.image) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(moodboard.image);
    if (!safePath) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    streamLocalFile(safePath, res, { isAttachment: false });
  } catch (err) {
    next(err);
  }
}

export async function downloadConceptAsset(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const conceptId = req.params.concept_id;

    const project = await prisma.project.findFirst({
      where: { id: projectId, consultantId: req.user!.id, isArchived: false },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const concept = await prisma.concept.findFirst({
      where: { id: conceptId, projectId: project.id },
    });

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    const isImage = req.params.asset_type === 'image' || req.path.endsWith('/image/');
    const target = isImage ? concept.image : concept.file;

    if (!target) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(target);
    if (!safePath) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    streamLocalFile(safePath, res, {
      isAttachment: !isImage,
      filename: path.basename(target),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadDeliverableFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const deliverableId = req.params.deliverable_id;

    const project = await prisma.project.findFirst({
      where: { id: projectId, consultantId: req.user!.id, isArchived: false },
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const deliverable = await prisma.deliverable.findFirst({
      where: { id: deliverableId, projectId: project.id },
    });

    if (!deliverable || !deliverable.file) {
      res.status(404).json({ detail: 'Deliverable not found.' });
      return;
    }

    const safePath = resolveSafeMediaPath(deliverable.file);
    if (!safePath) {
      res.status(404).json({ detail: 'File not found.' });
      return;
    }

    streamLocalFile(safePath, res, {
      isAttachment: false,
      filename: path.basename(deliverable.file),
    });
  } catch (err) {
    next(err);
  }
}
