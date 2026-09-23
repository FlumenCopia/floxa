import { Router } from 'express';
import { adminLogin, getAdminMe, adminLogout } from '../controllers/auth.controller.js';
import { requireAdminAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', adminLogin);
router.get('/me', requireAdminAuth, getAdminMe);
router.post('/logout', adminLogout);

export default router;
