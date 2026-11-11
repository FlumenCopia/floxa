import { Router } from 'express';
import { adminLogin, getAdminMe, adminLogout, getAdminCsrf } from '../controllers/auth.controller.js';
import { requireAdminAuth } from '../middleware/auth.middleware.js';
import { createLoginRateLimiter } from '../utils/security.js';

const router = Router();
const loginLimiter = createLoginRateLimiter(15, 15 * 60 * 1000);

router.get('/csrf', getAdminCsrf);
router.post('/login', loginLimiter, adminLogin);
router.get('/me', requireAdminAuth, getAdminMe);
router.post('/logout', adminLogout);

export default router;
