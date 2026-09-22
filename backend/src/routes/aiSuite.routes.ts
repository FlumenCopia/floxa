import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as aiSuiteController from '../controllers/aiSuite.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/usage/', aiSuiteController.getAiSuiteUsage);
router.get('/usage', aiSuiteController.getAiSuiteUsage);
router.post('/run/', aiSuiteController.runAiSuiteTool);
router.post('/run', aiSuiteController.runAiSuiteTool);

export default router;
