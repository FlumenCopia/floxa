import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';

const router = Router();

router.post('/razorpay/webhook/', paymentController.handleRazorpayWebhook);
router.post('/razorpay/webhook', paymentController.handleRazorpayWebhook);

export default router;
