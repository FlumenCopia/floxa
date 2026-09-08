import { Router } from 'express';
import multer from 'multer';
import { clientPortalAccess, clientOnlyAction } from '../middleware/portal.middleware.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import * as portalController from '../controllers/portal.controller.js';
import * as generatedAgreementController from '../controllers/generatedAgreement.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Consultant project switcher dropdown
router.get('/client-list/', requireAuth, portalController.getClientList);

// Public / Password verify routes
router.post('/:portal_token/verify-password/', portalController.verifyPortalPassword);
router.post('/:portal_token/logout/', portalController.logoutPortal);

// Protected client portal routes (also check optionalAuth for consultant support mode)
router.use('/:portal_token', optionalAuth, clientPortalAccess);

router.get('/:portal_token/', portalController.getPortalProject);
router.get('/:portal_token/brand-dna/', portalController.getPortalBrandDNA);
router.get('/:portal_token/discovery/', portalController.getPortalDiscovery);
router.post('/:portal_token/discovery/', portalController.savePortalDiscovery);

router.get('/:portal_token/moodboards/', portalController.getPortalMoodboards);
router.get('/:portal_token/moodboards/:asset_id/image/', portalController.downloadPortalMoodboardImage);
router.post('/:portal_token/moodboards/:moodboard_id/select/', portalController.selectPortalMoodboard);

router.get('/:portal_token/concepts/', portalController.getPortalConcepts);
router.get('/:portal_token/concepts/:asset_id/image/', portalController.downloadPortalConceptImage);
router.get('/:portal_token/concepts/:asset_id/file/', portalController.downloadPortalConceptFile);
router.post('/:portal_token/concepts/:concept_id/feedback/', portalController.submitConceptFeedback);

router.get('/:portal_token/deliverables/', portalController.getPortalDeliverables);
router.get('/:portal_token/deliverables/:asset_id/file/', portalController.downloadPortalDeliverableFile);

router.get('/:portal_token/agreement/', portalController.getPortalAgreement);
router.get('/:portal_token/agreement/pdf/', portalController.downloadPortalAgreementPdf);
router.get('/:portal_token/agreement/file/', portalController.downloadPortalAgreementPdf);
router.post('/:portal_token/agreement/sign/', clientOnlyAction, upload.single('signature_image'), portalController.signPortalAgreement);

router.get('/:portal_token/generated-agreement/', generatedAgreementController.getPortalGeneratedAgreement);
router.get('/:portal_token/generated-agreement/pdf/', generatedAgreementController.downloadPortalGeneratedAgreementPdf);
router.post('/:portal_token/generated-agreement/accept/', clientOnlyAction, generatedAgreementController.acceptPortalGeneratedAgreement);

router.get('/:portal_token/payments/', portalController.getPortalPayments);
router.post('/:portal_token/payments/:milestone_id/create-order/', clientOnlyAction, portalController.createPortalPaymentOrder);
router.post('/:portal_token/payments/verify/', clientOnlyAction, portalController.verifyPortalPayment);

router.post('/:portal_token/sign-off/', clientOnlyAction, portalController.portalSignOff);

router.get('/:portal_token/activities/', portalController.getPortalActivities);
router.post('/:portal_token/activities/mark-read/', portalController.markPortalActivitiesRead);

router.get('/:portal_token/help-status/', portalController.getPortalHelpStatus);
router.get('/:portal_token/support-status/', portalController.getPortalHelpStatus);
router.get('/:portal_token/support-request/active/', portalController.getPortalHelpStatus);

router.post('/:portal_token/help-request/', portalController.requestPortalHelp);
router.post('/:portal_token/support-request/', portalController.requestPortalHelp);

router.post('/:portal_token/help-resolve/', portalController.resolvePortalHelp);
router.post('/:portal_token/support-resolve/', portalController.resolvePortalHelp);

export default router;
