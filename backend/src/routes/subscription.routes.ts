import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getPublicPlans,
  getMySubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionInvoices,
} from '../controllers/subscription.controller.js';

const router = Router();

// Public route to view plans
router.get('/plans', getPublicPlans);

// Authenticated consultant routes
router.use(requireAuth);
router.get('/usage', getMySubscription);
router.post('/create-order', createSubscriptionOrder);
router.post('/verify-payment', verifySubscriptionPayment);
router.get('/invoices', getSubscriptionInvoices);

export default router;
