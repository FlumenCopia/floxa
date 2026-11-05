import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireProjectOwnership } from '../middleware/auth.middleware.js';
import { requireProjectAccess } from '../middleware/portal.middleware.js';
import * as projectController from '../controllers/project.controller.js';
import * as clientController from '../controllers/client.controller.js';
import * as discoveryController from '../controllers/discovery.controller.js';
import * as creativeController from '../controllers/creative.controller.js';
import * as agreementController from '../controllers/agreement.controller.js';
import * as generatedAgreementController from '../controllers/generatedAgreement.controller.js';
import * as paymentController from '../controllers/payment.controller.js';
import * as chatController from '../controllers/chat.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Dual-auth project routes (accessible via verified client portal token OR consultant credentials)
router.get('/:id/client-profile/', requireProjectAccess, clientController.getClientProfile);
router.post('/:id/client-profile/', requireProjectAccess, clientController.saveClientProfile);
router.patch('/:id/client-profile/', requireProjectAccess, clientController.saveClientProfile);
router.get('/:id/discovery/', requireProjectAccess, discoveryController.getDiscovery);
router.post('/:id/discovery/', requireProjectAccess, discoveryController.saveDiscovery);
router.post('/:id/discovery/submit/', requireProjectAccess, discoveryController.submitDiscovery);

// All project management routes require consultant authentication
router.use(requireAuth);

// Core projects & analytics
router.get('/', projectController.getProjects);
router.post('/', projectController.createProject);
router.get('/analytics/', projectController.getAnalytics);
router.get('/activities/', projectController.getConsultantActivities);
router.post('/activities/mark-read/', projectController.markConsultantActivitiesRead);

// Chat conversations list for consultant
router.get('/chat/conversations/', chatController.getRecentConversations);

// Enforce project ownership on all single-project and sub-resource routes
router.use('/:id', requireProjectOwnership);

// Single project
router.get('/:id/', projectController.getProject);
router.patch('/:id/', projectController.updateProject);
router.patch('/:id/deadline/', projectController.setProjectDeadline);
router.post('/:id/deadline/', projectController.setProjectDeadline);
router.post('/:id/invite/retry/', projectController.retryInvite);
router.get('/:id/activities/', projectController.getProjectActivities);
router.post('/:id/activities/mark-read/', projectController.markProjectActivitiesRead);

// Project Chat Messages
router.get('/:id/messages/', chatController.getProjectMessages);
router.post('/:id/messages/', chatController.sendProjectMessageFallback);
router.post('/:id/messages/upload/', upload.single('file'), chatController.uploadProjectAttachment);
router.post('/:id/messages/read/', chatController.markProjectMessagesRead);


// Discovery consultant-only summary
router.get('/:id/discovery-summary/', discoveryController.getDiscoverySummary);

// Brand DNA
router.get('/:id/brand-dna/', discoveryController.getBrandDNA);
router.post('/:id/brand-dna/generate/', discoveryController.generateBrandDNA);
router.get('/:id/brand-dna/pdf/', discoveryController.downloadBrandDnaPdf);

// Moodboards
router.get('/:id/moodboards/', creativeController.getMoodboards);
router.get('/:id/moodboards/:moodboard_id/image/', creativeController.downloadMoodboardImage);
router.post('/:id/moodboards/', upload.single('image'), creativeController.createMoodboard);
router.patch('/:id/moodboards/:moodboard_id/', upload.single('image'), creativeController.updateMoodboard);
router.put('/:id/moodboards/:moodboard_id/', upload.single('image'), creativeController.updateMoodboard);
router.delete('/:id/moodboards/:moodboard_id/', creativeController.deleteMoodboard);
router.patch('/:id/moodboards/share-all/', creativeController.shareAllMoodboards);
router.post('/:id/moodboards/share-all/', creativeController.shareAllMoodboards);
router.patch('/:id/moodboards/:moodboard_id/share/', creativeController.shareMoodboard);
router.post('/:id/moodboards/:moodboard_id/share/', creativeController.shareMoodboard);

// Concepts
router.get('/:id/concepts/', creativeController.getConcepts);
router.patch('/:id/concepts/share-all/', creativeController.shareAllConcepts);
router.post('/:id/concepts/share-all/', creativeController.shareAllConcepts);
router.get('/:id/concepts/:concept_id/image/', creativeController.downloadConceptAsset);
router.get('/:id/concepts/:concept_id/file/', creativeController.downloadConceptAsset);
router.post(
  '/:id/concepts/',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
  creativeController.createConcept
);
router.patch(
  '/:id/concepts/:concept_id/',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
  creativeController.updateConcept
);
router.delete('/:id/concepts/:concept_id/', creativeController.deleteConcept);
router.patch('/:id/concepts/:concept_id/share/', creativeController.shareConcept);
router.post('/:id/concepts/:concept_id/share/', creativeController.shareConcept);

// Deliverables
router.get('/:id/deliverables/', creativeController.getDeliverables);
router.get('/:id/deliverables/summary/', creativeController.getDeliverablesSummary);
router.get('/:id/deliverables/:deliverable_id/file/', creativeController.downloadDeliverableFile);
router.post('/:id/deliverables/', upload.single('file'), creativeController.createDeliverable);
router.patch('/:id/deliverables/:deliverable_id/', upload.single('file'), creativeController.updateDeliverable);
router.delete('/:id/deliverables/:deliverable_id/', creativeController.deleteDeliverable);
router.patch('/:id/deliverables/:deliverable_id/share/', creativeController.shareDeliverable);
router.post('/:id/deliverables/auto-generate/', creativeController.autoGenerateDeliverables);

// Agreements (Basic Agreement & Digital Signing)
router.get('/:id/agreement/', agreementController.getAgreement);
router.get('/:id/agreement/:agreement_id/file/', agreementController.downloadAgreementFile);
router.get('/:id/agreement/file/', agreementController.downloadAgreementFile);
router.post('/:id/agreement/generate/', agreementController.generateAgreement);
router.post('/:id/agreement/share/', agreementController.shareAgreement);
router.post('/:id/agreement/request-signature/', agreementController.requestSignature);
router.post('/:id/agreement/retry-signed-email/', agreementController.retrySignedEmail);

// Generated Agreement Snapshots
router.get('/:id/generated-agreement/', generatedAgreementController.getGeneratedAgreement);
router.get('/:id/generated-agreement/pdf/', generatedAgreementController.downloadGeneratedAgreementPdf);
router.post('/:id/generated-agreement/pdf/regenerate/', generatedAgreementController.regenerateGeneratedAgreementPdf);
router.post('/:id/generated-agreement/share/', generatedAgreementController.shareGeneratedAgreement);

// Payments
router.get('/:id/payments/', paymentController.getMilestones);
router.post('/:id/payments/', paymentController.createMilestones);
router.post('/:id/payments/:milestone_id/request/', paymentController.requestMilestone);
router.post('/:id/payments/:milestone_id/mark-paid/', paymentController.markMilestonePaid);

// AI Assistant
router.post('/:id/assistant/chat/', projectController.chatAssistant);

export default router;
