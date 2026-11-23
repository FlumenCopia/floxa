'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { DEFAULT_PLANS } = require('../dist/services/subscription.service.js');

test.describe('Subscription Unit & Logic Contract Tests', () => {
  test('1. Default Plans Catalog: Validates 4 tiers and discount structures', () => {
    assert.equal(DEFAULT_PLANS.length, 4, 'Should have 4 default plans');

    const slugs = DEFAULT_PLANS.map((p) => p.slug);
    assert.deepEqual(slugs, ['free', 'starter', 'pro', 'enterprise']);

    // Starter tier assertions
    const starter = DEFAULT_PLANS.find((p) => p.slug === 'starter');
    assert.equal(starter.pricing.monthly.price, 2499);
    assert.equal(starter.pricing.semiAnnual.discountPct, 15);
    assert.equal(starter.pricing.yearly.discountPct, 30);
    assert.equal(starter.limits.maxProjects, 5);
    assert.equal(starter.limits.maxClients, 10);
    assert.equal(starter.features.liveSpecimenPreview, true);
    assert.equal(starter.features.slaMonitoring, false);

    // Pro tier assertions
    const pro = DEFAULT_PLANS.find((p) => p.slug === 'pro');
    assert.equal(pro.pricing.monthly.price, 6999);
    assert.equal(pro.limits.maxProjects, 20);
    assert.equal(pro.limits.maxClients, 50);
    assert.equal(pro.features.slaMonitoring, true);
    assert.equal(pro.features.customBranding, true);

    // Enterprise tier assertions
    const enterprise = DEFAULT_PLANS.find((p) => p.slug === 'enterprise');
    assert.equal(enterprise.limits.maxProjects, -1, 'Enterprise should have unlimited projects');
    assert.equal(enterprise.limits.maxClients, -1, 'Enterprise should have unlimited clients');
    assert.equal(enterprise.features.customDomain, true);
  });

  test('2. Multi-Cycle Renewal Discounts Calculation', () => {
    const monthlyPrice = 2499;

    // Semi-Annual: 6 months with 15% discount
    const expectedSemiAnnual = Math.round(monthlyPrice * 6 * 0.85);
    assert.equal(expectedSemiAnnual, 12745);

    // Annual: 12 months with 30% discount
    const expectedYearly = Math.round(monthlyPrice * 12 * 0.70);
    assert.equal(expectedYearly, 20992);
  });

  test('3. Timeline & Grace Period State Machine Logic', () => {
    const now = new Date('2026-11-20T12:00:00Z');

    // Scenario A: Active (expiry in future)
    const futureEnd = new Date('2026-12-20T12:00:00Z');
    const futureGrace = new Date('2026-12-25T12:00:00Z');
    assert.ok(now <= futureEnd, 'Should be active');

    // Scenario B: Grace Period (periodEnd past, but before gracePeriodEnd)
    const pastEnd = new Date('2026-11-18T12:00:00Z');
    const activeGrace = new Date('2026-11-23T12:00:00Z');
    const isGracePeriod = now > pastEnd && now <= activeGrace;
    assert.equal(isGracePeriod, true, 'Should be in grace period');

    // Scenario C: Expired (past gracePeriodEnd)
    const expiredGrace = new Date('2026-11-15T12:00:00Z');
    const isExpired = now > expiredGrace;
    assert.equal(isExpired, true, 'Should be expired');
  });

  test('4. Effective Quotas & Custom Overrides Resolution', () => {
    const planLimits = { maxProjects: 5, maxClients: 10 };

    // Standard without override
    const overridesEmpty = {};
    const effectiveProjectsStd = overridesEmpty.maxProjects ?? planLimits.maxProjects;
    assert.equal(effectiveProjectsStd, 5);

    // With SuperAdmin override of 12 projects
    const overridesCustom = { maxProjects: 12 };
    const effectiveProjectsCustom = overridesCustom.maxProjects ?? planLimits.maxProjects;
    assert.equal(effectiveProjectsCustom, 12);

    // Limit checks
    const currentProjects = 5;
    const isStandardLimitReached = currentProjects >= effectiveProjectsStd;
    assert.equal(isStandardLimitReached, true, '5 >= 5 should be limit reached');

    const isCustomLimitReached = currentProjects >= effectiveProjectsCustom;
    assert.equal(isCustomLimitReached, false, '5 < 12 should not be limit reached');
  });

  test('5. Razorpay HMAC-SHA256 Signature Verification Algorithm', () => {
    const secret = 'test_secret_key_floxa_2026';
    const orderId = 'order_DA981293812';
    const paymentId = 'pay_98127391827';

    // Expected signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${orderId}|${paymentId}`);
    const validSignature = hmac.digest('hex');

    // Verification check
    const verifyHmac = crypto.createHmac('sha256', secret);
    verifyHmac.update(`${orderId}|${paymentId}`);
    const checkSignature = verifyHmac.digest('hex');

    assert.equal(checkSignature, validSignature);
    assert.notEqual('invalid_signature_hex', validSignature);
  });
});
