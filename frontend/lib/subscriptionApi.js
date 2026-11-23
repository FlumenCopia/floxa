import { apiRequest } from "./api.js";

/**
 * Fetch consultant's live subscription usage and quotas.
 */
export async function getSubscriptionUsage() {
  return apiRequest("/subscription/usage");
}

/**
 * Fetch catalog of public dynamic plans.
 */
export async function getSubscriptionPlans() {
  return apiRequest("/subscription/plans");
}

/**
 * Initiate Razorpay subscription order.
 */
export async function createSubscriptionOrder(planSlug, billingCycle = "monthly") {
  return apiRequest("/subscription/create-order", {
    method: "POST",
    body: JSON.stringify({ planSlug, billingCycle }),
  });
}

/**
 * Verify Razorpay payment and renew/upgrade subscription.
 */
export async function verifySubscriptionPayment(payload) {
  return apiRequest("/subscription/verify-payment", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch invoice history for consultant.
 */
export async function getSubscriptionInvoices() {
  return apiRequest("/subscription/invoices");
}
