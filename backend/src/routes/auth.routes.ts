import { Router } from 'express';
import multer from 'multer';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const loginLimiter = createRateLimiter({
  keyPrefix: 'auth_login',
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please wait before trying again.',
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase(),
});

const passwordResetLimiter = createRateLimiter({
  keyPrefix: 'auth_pw_reset',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset requests. Please try again later.',
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase(),
});

const reactivationLimiter = createRateLimiter({
  keyPrefix: 'auth_reactivate',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many reactivation requests. Please try again later.',
  keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase(),
});

router.get('/csrf/', authController.getCsrf);
router.post('/login/', loginLimiter, authController.login);
router.post('/request-reactivation/', reactivationLimiter, authController.requestReactivation);
router.post('/token/refresh/', authController.refreshToken);
router.get('/me/', requireAuth, authController.getMe);
router.patch('/me/', requireAuth, upload.single('avatar'), authController.updateMe);
router.post('/change-password/', requireAuth, authController.changePassword);
router.post('/forgot-password/', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password/', passwordResetLimiter, authController.resetPassword);
router.post('/logout/', authController.logout);

// Mobile device push notification tokens
router.post('/device-token/', optionalAuth, authController.registerDeviceToken);
router.post('/device-token/unregister/', optionalAuth, authController.unregisterDeviceToken);


export default router;
