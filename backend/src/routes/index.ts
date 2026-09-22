import { Router } from 'express';
import authRoutes from './auth.routes.js';
import projectRoutes from './project.routes.js';
import portalRoutes from './portal.routes.js';
import paymentRoutes from './payment.routes.js';
import aiSuiteRoutes from './aiSuite.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/client-portal', portalRoutes);
router.use('/payments', paymentRoutes);
router.use('/ai-suite', aiSuiteRoutes);

export default router;
