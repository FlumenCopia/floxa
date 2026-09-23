import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.middleware.js';
import {
  getMetrics,
  getConsultants,
  getConsultantDetails,
  updateConsultantStatus,
  updateConsultantPlan,
  updateConsultantAiQuota,
  getProjects,
} from '../controllers/admin.controller.js';
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  getAnnouncement,
  updateAnnouncement,
  exportConsultantsCsv,
  exportProjectsCsv,
  getIntegrations,
  updateIntegrations,
  testGeminiConnection,
  purgeDemoData,
} from '../controllers/settings.controller.js';

const router = Router();

router.use(requireAdminAuth);

// Overview & Operations
router.get('/metrics', getMetrics);
router.get('/consultants', getConsultants);
router.get('/consultants/:id/details', getConsultantDetails);
router.patch('/consultants/:id/status', updateConsultantStatus);
router.patch('/consultants/:id/plan', updateConsultantPlan);
router.patch('/consultants/:id/ai-quota', updateConsultantAiQuota);
router.get('/projects', getProjects);

// Profile & Security (Phase 3)
router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.put('/password', changeAdminPassword);

// Announcements & Broadcasts (Phase 3)
router.get('/announcement', getAnnouncement);
router.put('/announcement', updateAnnouncement);

// CSV Data Exports (Phase 3)
router.get('/export/consultants.csv', exportConsultantsCsv);
router.get('/export/projects.csv', exportProjectsCsv);

// Real API Keys & Integrations
router.get('/integrations', getIntegrations);
router.put('/integrations', updateIntegrations);
router.post('/integrations/test-gemini', testGeminiConnection);

// Demo Data Governance
router.post('/demo/purge', purgeDemoData);

export default router;
