import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { Moodboard } from '../models/moodboard.model.js';
import { Concept } from '../models/concept.model.js';
import { Deliverable } from '../models/deliverable.model.js';
import { Project } from '../models/project.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { BrandDNA } from '../models/brandDNA.model.js';
import { ProjectAgreement } from '../models/agreement.model.js';
import {
  saveFile,
  optimizeImageBuffer,
  generateWatermarkedImage,
  validateUploadedFile,
  resolveSafeMediaPath,
  streamLocalFile,
  deleteStoredFile,
} from '../services/storage.service.js';
import {
  logProjectActivity,
  recalculatePaymentMilestones,
  updateProjectProgress,
} from '../services/project.service.js';
import {
  serializeMoodboard,
  serializeConcept,
  serializeDeliverable,
  serializePaymentMilestone,
} from '../utils/serializer.js';
import { generateBrandDeliverablesPdf } from '../services/pdf.service.js';
import type { AuthenticatedRequest, FileUploadRequest } from '../types/express.js';

// ==================== MOODBOARDS ====================

export async function getMoodboards(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const moodboards = await Moodboard.find({ projectId: id }).sort({ createdAt: -1 });

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

    // Enforce Brand DNA and Agreement completion prerequisites
    const brandDna = await BrandDNA.findOne({ projectId: id });
    if (!brandDna) {
      res.status(400).json({ detail: 'Brand DNA must be completed before uploading moodboards.' });
      return;
    }

    const agreement = await ProjectAgreement.findOne({ projectId: id });
    const isAgreementSigned = Boolean(
      agreement?.signedAt || ['signed', 'active', 'completed', 'locked'].includes(agreement?.status || '')
    );
    if (!isAgreementSigned) {
      res.status(400).json({ detail: 'Agreement must be completed and signed before uploading moodboards.' });
      return;
    }

    validateUploadedFile(req.file, 'moodboard_image');
    const { buffer, filename } = await optimizeImageBuffer(req.file.buffer, req.file.originalname);
    const savedPath = await saveFile('moodboards', filename, buffer, req.file.mimetype);

    let savedWmPath: string | null = null;
    try {
      const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(buffer, filename);
      savedWmPath = await saveFile('moodboards/watermarked', wmFilename, wmBuffer, 'image/jpeg');
    } catch (wmErr) {
      console.error('[Moodboard] Watermark generation failed:', wmErr);
    }

    const isShared = req.body.is_shared === 'true' || req.body.is_shared === true || false;

    const moodboard = await Moodboard.create({
      projectId: id,
      title: title.trim(),
      description: (description || '').trim(),
      image: savedPath,
      watermarkImage: savedWmPath,
      isShared,
    });

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'moodboard_created',
        description: `Consultant uploaded moodboard: ${moodboard.title}`,
      });
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeMoodboard(moodboard, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function shareMoodboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, moodboard_id } = req.params;

    const moodboard = await Moodboard.findOneAndUpdate(
      { _id: moodboard_id, projectId: id },
      { $set: { isShared: true } },
      { new: true }
    );

    if (!moodboard) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'moodboard_shared',
        description: `Consultant shared moodboard: ${moodboard.title}`,
        visibleToClient: true,
      });
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeMoodboard(moodboard, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function shareAllMoodboards(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const drafts = await Moodboard.find({ projectId: id, isShared: false, isSelected: false });
    if (drafts.length === 0) {
      res.json({ detail: 'No draft moodboards to share.', shared_count: 0 });
      return;
    }

    await Moodboard.updateMany(
      { projectId: id, isShared: false, isSelected: false },
      { $set: { isShared: true } }
    );

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'moodboard_shared',
      description: `Consultant shared ${drafts.length} moodboard${drafts.length > 1 ? 's' : ''} with client`,
      visibleToClient: true,
    });
    await updateProjectProgress(id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const allMoodboards = await Moodboard.find({ projectId: id }).sort({ createdAt: -1 });
    res.json({
      detail: `Shared ${drafts.length} moodboard${drafts.length > 1 ? 's' : ''} with client.`,
      shared_count: drafts.length,
      moodboards: allMoodboards.map((m) => serializeMoodboard(m, baseUrl)),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMoodboard(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id, moodboard_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(moodboard_id)) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    const existing = await Moodboard.findOne({ _id: moodboard_id, projectId: id });
    if (!existing) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    const { title, description, clear_feedback } = req.body as {
      title?: any;
      description?: any;
      clear_feedback?: any;
    };
    const updateData: any = {};
    if (title !== undefined && String(title).trim()) {
      updateData.title = String(title).trim();
    }
    if (description !== undefined) {
      updateData.description = String(description).trim();
    }
    if (clear_feedback === 'true' || clear_feedback === true) {
      updateData.clientFeedback = '';
    }

    let newlySavedImage: string | null = null;
    let newlySavedWmImage: string | null = null;
    if (req.file) {
      validateUploadedFile(req.file, 'moodboard_image');
      const { buffer, filename } = await optimizeImageBuffer(req.file.buffer, req.file.originalname);
      newlySavedImage = await saveFile('moodboards', filename, buffer, req.file.mimetype);
      updateData.image = newlySavedImage;

      try {
        const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(buffer, filename);
        newlySavedWmImage = await saveFile('moodboards/watermarked', wmFilename, wmBuffer, 'image/jpeg');
        updateData.watermarkImage = newlySavedWmImage;
      } catch (wmErr) {
        console.error('[Moodboard] Watermark generation failed during update:', wmErr);
      }
    }

    let updated: any;
    try {
      updated = await Moodboard.findOneAndUpdate(
        { _id: moodboard_id, projectId: id },
        { $set: updateData },
        { new: true }
      );
    } catch (dbErr) {
      if (newlySavedImage) {
        await deleteStoredFile(newlySavedImage);
      }
      if (newlySavedWmImage) {
        await deleteStoredFile(newlySavedWmImage);
      }
      throw dbErr;
    }

    // Safely clean up old images if replacement succeeded
    if (newlySavedImage && existing.image && existing.image !== newlySavedImage) {
      await deleteStoredFile(existing.image);
    }
    if (newlySavedWmImage && existing.watermarkImage && existing.watermarkImage !== newlySavedWmImage) {
      await deleteStoredFile(existing.watermarkImage);
    }

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'moodboard_updated',
        description: `Consultant updated moodboard: ${updated?.title || existing.title}`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeMoodboard(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteMoodboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, moodboard_id } = req.params;

    const moodboard = await Moodboard.findOneAndDelete({ _id: moodboard_id, projectId: id });
    if (!moodboard) {
      res.status(404).json({ detail: 'Moodboard not found.' });
      return;
    }

    if (moodboard.image) {
      await deleteStoredFile(moodboard.image).catch(() => {});
    }
    if (moodboard.watermarkImage) {
      await deleteStoredFile(moodboard.watermarkImage).catch(() => {});
    }

    await updateProjectProgress(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function downloadMoodboardImage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const moodboardId = req.params.moodboard_id;

    const project = await Project.findOne({
      _id: projectId,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const moodboard = await Moodboard.findOne({ _id: moodboardId, projectId: project.id });
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

// ==================== CONCEPTS ====================

export async function getConcepts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const concepts = await Concept.find({ projectId: id }).sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(concepts.map((c) => serializeConcept(c, baseUrl)));
  } catch (err) {
    next(err);
  }
}

export async function createConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFile = files?.['image']?.[0];
    const assetFile = files?.['file']?.[0];

    const { title, description } = req.body as { title?: any; description?: any };

    if (!title) {
      res.status(400).json({ detail: 'Concept title is required.' });
      return;
    }

    // Enforce Brand DNA and Agreement completion prerequisites
    const brandDna = await BrandDNA.findOne({ projectId: id });
    if (!brandDna) {
      res.status(400).json({ detail: 'Brand DNA must be completed before uploading concepts.' });
      return;
    }

    const agreement = await ProjectAgreement.findOne({ projectId: id });
    const isAgreementSigned = Boolean(
      agreement?.signedAt || ['signed', 'active', 'completed', 'locked'].includes(agreement?.status || '')
    );
    if (!isAgreementSigned) {
      res.status(400).json({ detail: 'Agreement must be completed and signed before uploading concepts.' });
      return;
    }

    let savedImagePath: string | null = null;
    let savedWmImagePath: string | null = null;
    let savedFilePath: string | null = null;

    if (imageFile) {
      validateUploadedFile(imageFile, 'concept_image');
      const { buffer, filename } = await optimizeImageBuffer(imageFile.buffer, imageFile.originalname);
      savedImagePath = await saveFile('concepts', filename, buffer, imageFile.mimetype);

      try {
        const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(buffer, filename);
        savedWmImagePath = await saveFile('concepts/watermarked', wmFilename, wmBuffer, 'image/jpeg');
      } catch (wmErr) {
        console.error('[Concept] Watermark generation failed:', wmErr);
      }
    }

    if (assetFile) {
      validateUploadedFile(assetFile, 'concept_file');
      savedFilePath = await saveFile('concepts', assetFile.originalname, assetFile.buffer, assetFile.mimetype);
    }

    // Version number
    const highestVersion = await Concept.findOne({ projectId: id }).sort({ version: -1 });
    const nextVersion = (highestVersion?.version || 0) + 1;

    const concept = await Concept.create({
      projectId: id,
      title: title.trim(),
      description: (description || '').trim(),
      image: savedImagePath,
      watermarkImage: savedWmImagePath,
      file: savedFilePath,
      version: nextVersion,
      status: 'draft',
    });

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'concept_created',
        description: `Consultant uploaded Concept v${concept.version}: ${concept.title}`,
      });
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeConcept(concept, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function updateConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(concept_id)) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFile = files?.['image']?.[0];
    const assetFile = files?.['file']?.[0];

    const existing = await Concept.findOne({ _id: concept_id, projectId: id });
    if (!existing) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    const { title, description } = req.body as { title?: any; description?: any };
    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();

    let newlySavedImage: string | null = null;
    let newlySavedWmImage: string | null = null;
    let newlySavedAsset: string | null = null;

    if (imageFile) {
      validateUploadedFile(imageFile, 'concept_image');
      const { buffer, filename } = await optimizeImageBuffer(imageFile.buffer, imageFile.originalname);
      newlySavedImage = await saveFile('concepts', filename, buffer, imageFile.mimetype);
      updateData.image = newlySavedImage;

      try {
        const { buffer: wmBuffer, filename: wmFilename } = await generateWatermarkedImage(buffer, filename);
        newlySavedWmImage = await saveFile('concepts/watermarked', wmFilename, wmBuffer, 'image/jpeg');
        updateData.watermarkImage = newlySavedWmImage;
      } catch (wmErr) {
        console.error('[Concept] Watermark generation failed during update:', wmErr);
      }
    }

    if (assetFile) {
      validateUploadedFile(assetFile, 'concept_file');
      newlySavedAsset = await saveFile('concepts', assetFile.originalname, assetFile.buffer, assetFile.mimetype);
      updateData.file = newlySavedAsset;
    }

    let updated: any;
    try {
      updated = await Concept.findOneAndUpdate(
        { _id: concept_id, projectId: id },
        { $set: updateData },
        { new: true }
      );
    } catch (dbErr) {
      if (newlySavedImage) await deleteStoredFile(newlySavedImage);
      if (newlySavedWmImage) await deleteStoredFile(newlySavedWmImage);
      if (newlySavedAsset) await deleteStoredFile(newlySavedAsset);
      throw dbErr;
    }

    if (newlySavedImage && existing.image && existing.image !== newlySavedImage) {
      await deleteStoredFile(existing.image);
    }
    if (newlySavedWmImage && existing.watermarkImage && existing.watermarkImage !== newlySavedWmImage) {
      await deleteStoredFile(existing.watermarkImage);
    }
    if (newlySavedAsset && existing.file && existing.file !== newlySavedAsset) {
      await deleteStoredFile(existing.file);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeConcept(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;

    const concept = await Concept.findOneAndDelete({ _id: concept_id, projectId: id });
    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    if (concept.image) {
      await deleteStoredFile(concept.image).catch(() => {});
    }
    if (concept.watermarkImage) {
      await deleteStoredFile(concept.watermarkImage).catch(() => {});
    }
    if (concept.file) {
      await deleteStoredFile(concept.file).catch(() => {});
    }

    await updateProjectProgress(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function shareConcept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, concept_id } = req.params;

    const concept = await Concept.findOneAndUpdate(
      { _id: concept_id, projectId: id },
      { $set: { status: 'shared' } },
      { new: true }
    );

    if (!concept) {
      res.status(404).json({ detail: 'Concept not found.' });
      return;
    }

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'concept_shared',
        description: `Consultant shared concept: ${concept.title}`,
        visibleToClient: true,
      });
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeConcept(concept, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function shareAllConcepts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const drafts = await Concept.find({ projectId: id, status: 'draft' });
    if (drafts.length === 0) {
      res.json({ detail: 'No draft concepts to share.', shared_count: 0 });
      return;
    }

    await Concept.updateMany(
      { projectId: id, status: 'draft' },
      { $set: { status: 'shared' } }
    );

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'concept_shared',
      description: `Consultant shared ${drafts.length} concept${drafts.length > 1 ? 's' : ''} with client`,
      visibleToClient: true,
    });
    await updateProjectProgress(id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const allConcepts = await Concept.find({ projectId: id }).sort({ createdAt: -1 });
    res.json({
      detail: `Shared ${drafts.length} concept${drafts.length > 1 ? 's' : ''} with client.`,
      shared_count: drafts.length,
      concepts: allConcepts.map((c) => serializeConcept(c, baseUrl)),
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadConceptAsset(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const conceptId = req.params.concept_id;

    const project = await Project.findOne({
      _id: projectId,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const concept = await Concept.findOne({ _id: conceptId, projectId: project.id });
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

// ==================== DELIVERABLES ====================

export async function getDeliverables(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deliverables = await Deliverable.find({ projectId: id }).sort({ createdAt: -1 });

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

    const deliverable = await Deliverable.create({
      projectId: id,
      title: title.trim(),
      description: (description || '').trim(),
      file: savedPath,
      status: 'draft',
    });

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'deliverable_uploaded',
        description: `Consultant uploaded deliverable: ${deliverable.title}`,
      });
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(serializeDeliverable(deliverable, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function updateDeliverable(req: FileUploadRequest, res: Response, next: NextFunction) {
  try {
    const { id, deliverable_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(deliverable_id)) {
      res.status(404).json({ detail: 'Deliverable not found.' });
      return;
    }

    const { title, description } = req.body as { title?: any; description?: any };

    const existing = await Deliverable.findOne({ _id: deliverable_id, projectId: id });
    if (!existing) {
      res.status(404).json({ detail: 'Deliverable not found.' });
      return;
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();

    let newlySavedFile: string | null = null;
    if (req.file) {
      validateUploadedFile(req.file, 'deliverable_file');
      newlySavedFile = await saveFile('deliverables', req.file.originalname, req.file.buffer, req.file.mimetype);
      updateData.file = newlySavedFile;
    }

    let updated: any;
    try {
      updated = await Deliverable.findOneAndUpdate(
        { _id: deliverable_id, projectId: id },
        { $set: updateData },
        { new: true }
      );
    } catch (dbErr) {
      if (newlySavedFile) {
        await deleteStoredFile(newlySavedFile);
      }
      throw dbErr;
    }

    if (newlySavedFile && existing.file && existing.file !== newlySavedFile) {
      await deleteStoredFile(existing.file);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeDeliverable(updated, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function deleteDeliverable(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, deliverable_id } = req.params;

    const deliverable = await Deliverable.findOneAndDelete({ _id: deliverable_id, projectId: id });
    if (!deliverable) {
      res.status(404).json({ detail: 'Deliverable not found.' });
      return;
    }

    await updateProjectProgress(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function shareDeliverable(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id, deliverable_id } = req.params;

    const deliverable = await Deliverable.findOneAndUpdate(
      { _id: deliverable_id, projectId: id },
      { $set: { status: 'shared' } },
      { new: true }
    );

    if (!deliverable) {
      res.status(404).json({ detail: 'Deliverable not found.' });
      return;
    }

    const project = await Project.findById(id);
    if (project) {
      await logProjectActivity({
        projectId: id,
        consultantId: String(project.consultantId),
        actorType: 'consultant',
        action: 'deliverable_shared',
        description: `Consultant shared deliverable: ${deliverable.title}`,
        visibleToClient: true,
      });
      await recalculatePaymentMilestones(id);
      await updateProjectProgress(id);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json(serializeDeliverable(deliverable, baseUrl));
  } catch (err) {
    next(err);
  }
}

export async function downloadDeliverableFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id || req.params.project_id;
    const deliverableId = req.params.deliverable_id;

    const project = await Project.findOne({
      _id: projectId,
      consultantId: req.user!.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const deliverable = await Deliverable.findOne({ _id: deliverableId, projectId: project.id });
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

export async function autoGenerateDeliverables(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const project = await Project.findById(id).populate([
      'clientProfile',
      'discovery',
      'brandDNA',
      'moodboards',
      'concepts',
      'deliverables',
      'paymentMilestones',
    ]);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const pdfBuffer = await generateBrandDeliverablesPdf(project);
    const filename = `brand_deliverables_${project.portalToken || id}.pdf`;
    const savedPath = await saveFile('deliverables', filename, pdfBuffer, 'application/pdf');

    const description = 'Auto-generated Brand Delivery Package & Strategy Guide PDF.';

    let deliverable = await Deliverable.findOne({
      projectId: id,
      title: 'Brand Delivery Package & Strategy Guide.pdf',
    });

    if (deliverable) {
      deliverable = await Deliverable.findByIdAndUpdate(
        deliverable.id,
        { $set: { file: savedPath, description } },
        { new: true }
      );
    } else {
      deliverable = await Deliverable.create({
        projectId: id,
        title: 'Brand Delivery Package & Strategy Guide.pdf',
        description,
        file: savedPath,
        status: 'draft',
      });
    }

    await logProjectActivity({
      projectId: id,
      consultantId: String(project.consultantId),
      actorType: 'consultant',
      action: 'deliverable_uploaded',
      description: 'Auto-generated final Brand Delivery Package PDF.',
      metadata: {
        deliverable_id: deliverable!.id,
        deliverable_title: deliverable!.title,
        auto_generated: true,
      },
      visibleToClient: false,
    });

    const allDeliverables = await Deliverable.find({ projectId: id }).sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      deliverable: serializeDeliverable(deliverable, baseUrl),
      deliverables: allDeliverables.map((d) => serializeDeliverable(d, baseUrl)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeliverablesSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deliverables = await Deliverable.find({ projectId: id });

    const sharedCount = deliverables.filter((d) => d.status === 'shared').length;
    const draftCount = deliverables.filter((d) => d.status === 'draft').length;

    res.json({
      total: deliverables.length,
      shared: sharedCount,
      draft: draftCount,
    });
  } catch (err) {
    next(err);
  }
}
