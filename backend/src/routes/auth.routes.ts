import { Router } from 'express';
import multer from 'multer';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/csrf/', authController.getCsrf);
router.post('/login/', authController.login);
router.post('/request-reactivation/', authController.requestReactivation);
router.post('/token/refresh/', authController.refreshToken);
router.get('/me/', requireAuth, authController.getMe);
router.patch('/me/', requireAuth, upload.single('avatar'), authController.updateMe);
router.post('/change-password/', requireAuth, authController.changePassword);
router.post('/forgot-password/', authController.forgotPassword);
router.post('/reset-password/', authController.resetPassword);
router.post('/logout/', authController.logout);

export default router;
