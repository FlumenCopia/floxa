'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  SubscriptionPlan,
  SubscriptionTransaction,
  Consultant,
  Project,
  Client,
} = require('../dist/models/index.js');
const {
  ensureDefaultSubscriptionPlans,
  getConsultantSubscriptionDetails,
  checkConsultantProjectQuota,
  checkConsultantClientQuota,
  adjustConsultantTimeline,
  overrideConsultantQuota,
} = require('../dist/services/subscription.service.js');
const {
  connectTestDatabase,
  disconnectTestDatabase,
  startTestServer,
  closeTestServer,
  createTestToken,
  models,
} = require('./helpers.cjs');

test('Dynamic Subscription & Quota Enforcement Engine', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();

  let consultant = null;

  t.after(async () => {
    if (consultant) {
      await models.Project.deleteMany({ consultantId: consultant._id });
      await models.Consultant.deleteOne({ _id: consultant._id });
    }
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('1. Baseline Plans Seeding: ensureDefaultSubscriptionPlans populates Free, Starter, Pro, Enterprise', async () => {
    await ensureDefaultSubscriptionPlans();

    const plans = await SubscriptionPlan.find().lean();
    assert.ok(plans.length >= 4, 'At least 4 baseline plans should be seeded');

    const slugs = plans.map((p) => p.slug);
    assert.ok(slugs.includes('free'), 'Should have free tier');
    assert.ok(slugs.includes('starter'), 'Should have starter tier');
    assert.ok(slugs.includes('pro'), 'Should have pro tier');
    assert.ok(slugs.includes('enterprise'), 'Should have enterprise tier');

    const proPlan = plans.find((p) => p.slug === 'pro');
    assert.equal(proPlan.limits.maxProjects, 20);
    assert.equal(proPlan.limits.maxClients, 50);
    assert.equal(proPlan.features.slaMonitoring, true);
    assert.equal(proPlan.features.liveSpecimenPreview, true);
  });

  await t.test('2. Dynamic Plan Creation: SuperAdmin can create custom tiers with quotas and feature matrix', async () => {
    const customSlug = `agency-elite-${Date.now()}`;
    const customPlan = await SubscriptionPlan.create({
      name: 'Agency Elite Tier',
      slug: customSlug,
      description: 'Exclusive tier for high-end boutique brand studios',
      badge: 'Exclusive',
      pricing: {
        monthly: { price: 9999, discountPct: 0 },
        semiAnnual: { price: 50995, discountPct: 15 },
        yearly: { price: 83990, discountPct: 30 },
        currency: 'INR',
      },
      limits: {
        maxProjects: 35,
        maxClients: 80,
        maxAiRunsPerMonth: 800,
        maxStorageMb: 20480,
        maxTeamMembers: 10,
      },
      features: {
        slaMonitoring: true,
        customBranding: true,
        customDomain: true,
        liveSpecimenPreview: true,
        aiProposalGenerator: true,
        brandDnaMoodboards: true,
        prioritySupport: true,
        analyticsExport: true,
        featureBulletPoints: ['Up to 35 projects', 'Up to 80 clients', 'Custom Domain'],
      },
      isActive: true,
      isPublic: true,
    });

    assert.ok(customPlan._id);
    assert.equal(customPlan.slug, customSlug);
    assert.equal(customPlan.limits.maxProjects, 35);
    assert.equal(customPlan.pricing.yearly.price, 83990);
  });

  await t.test('3. Quota Evaluation & Metric Resolution for Consultants', async () => {
    consultant = await models.Consultant.create({
      name: 'Studio Design Founder',
      email: `founder_${Date.now()}@agency.com`,
      password: 'HashedPassword123!',
      company: 'Studio Alpha',
      isActive: true,
      subscription: {
        plan: 'starter',
        status: 'active',
        billingCycle: 'monthly',
        maxProjects: 3,
        maxClients: 5,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days remaining
        gracePeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      },
    });

    const details = await getConsultantSubscriptionDetails(consultant._id);
    assert.ok(details, 'Details should be returned');
    assert.equal(details.status, 'active');
    assert.equal(details.projects.max, 3);
    assert.equal(details.clients.max, 5);
    assert.equal(details.projects.current, 0);
    assert.equal(details.projects.isLimitReached, false);
    assert.ok(details.daysRemaining > 0);
  });

  await t.test('4. Project Quota Enforcement: Blocks creation when active projects reach maximum limit', async () => {
    // Consultant has maxProjects: 3
    const client = await models.Client.create({
      name: 'Acme Corp',
      email: `acme_${Date.now()}@test.com`,
      companyName: 'Acme',
      sector: 'Retail',
    });

    // Create 3 active projects
    for (let i = 1; i <= 3; i++) {
      await models.Project.create({
        consultantId: consultant._id,
        clientId: client._id,
        title: `Test Project ${i}`,
        companyName: 'Acme',
        sector: 'Retail',
        projectValue: 50000,
        advancePercentage: 50,
        midPercentage: 25,
        finalPercentage: 25,
        portalToken: `token-${Date.now()}-${i}`,
        progress: 10,
        isArchived: false,
      });
    }

    // Now consultant is at 3/3 projects
    const quotaCheck = await checkConsultantProjectQuota(consultant._id);
    assert.equal(quotaCheck.allowed, false, 'Project creation should be disallowed when limit reached');
    assert.equal(quotaCheck.code, 'SUBSCRIPTION_LIMIT_REACHED');
    assert.equal(quotaCheck.current, 3);
    assert.equal(quotaCheck.max, 3);
  });

  await t.test('5. SuperAdmin Custom Quota Override: Allows consultant to expand capacity without changing tier', async () => {
    // SuperAdmin gives consultant an override of maxProjects: 6
    await overrideConsultantQuota(consultant._id.toString(), { maxProjects: 6 });

    const quotaAfterOverride = await checkConsultantProjectQuota(consultant._id);
    assert.equal(quotaAfterOverride.allowed, true, 'Should now be allowed after override');
    assert.equal(quotaAfterOverride.max, 6, 'Effective max should reflect override');
    assert.equal(quotaAfterOverride.current, 3);
  });

  await t.test('6. SuperAdmin Timeline Adjustment: Extends expiry date and logs audit trail', async () => {
    const originalDetails = await getConsultantSubscriptionDetails(consultant._id);
    const oldEnd = originalDetails.currentPeriodEnd;

    // Extend by 30 days
    const adjustmentRes = await adjustConsultantTimeline(
      consultant._id.toString(),
      30,
      'Promotion extension by superadmin',
      'admin@floxa.com'
    );

    assert.equal(adjustmentRes.success, true);
    assert.ok(adjustmentRes.newPeriodEnd > oldEnd, 'New expiry should be further in the future');

    // Verify audit log in consultant document
    const updatedConsultant = await models.Consultant.findById(consultant._id).lean();
    const adjustments = updatedConsultant.subscription.timelineAdjustments;
    assert.ok(adjustments.length >= 1, 'Should have recorded adjustment entry');
    assert.equal(adjustments[adjustments.length - 1].daysAdded, 30);
    assert.equal(adjustments[adjustments.length - 1].reason, 'Promotion extension by superadmin');
    assert.equal(adjustments[adjustments.length - 1].adjustedBy, 'admin@floxa.com');
  });

  await t.test('7. Expiration & Grace Period Transitions', async () => {
    // Simulate expired subscription
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const pastGraceDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    await models.Consultant.findByIdAndUpdate(consultant._id, {
      'subscription.currentPeriodEnd': pastDate,
      'subscription.gracePeriodEnd': pastGraceDate,
    });

    const expiredDetails = await getConsultantSubscriptionDetails(consultant._id);
    assert.equal(expiredDetails.isExpired, true, 'Should evaluate as expired');
    assert.equal(expiredDetails.status, 'expired');

    const expiredQuotaCheck = await checkConsultantProjectQuota(consultant._id);
    assert.equal(expiredQuotaCheck.allowed, false);
    assert.equal(expiredQuotaCheck.code, 'SUBSCRIPTION_EXPIRED');

    // Simulate grace period (period end has passed, but within 5-day grace window)
    const recentPeriodEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const futureGraceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days in future

    await models.Consultant.findByIdAndUpdate(consultant._id, {
      'subscription.currentPeriodEnd': recentPeriodEnd,
      'subscription.gracePeriodEnd': futureGraceEnd,
    });

    const graceDetails = await getConsultantSubscriptionDetails(consultant._id);
    assert.equal(graceDetails.isGracePeriod, true, 'Should evaluate as in grace period');
    assert.equal(graceDetails.isExpired, false);
  });

  await t.test('8. HTTP API Contract: GET /api/subscription/plans returns dynamic plans', async () => {
    const res = await fetch(`${baseUrl}/api/subscription/plans`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), 'Should return array of plans');
    assert.ok(body.length >= 4);

    const firstPlan = body[0];
    assert.ok(firstPlan.name);
    assert.ok(firstPlan.pricing);
    assert.ok(firstPlan.limits);
  });

  await t.test('9. HTTP API Contract: POST /api/projects returns HTTP 403 SUBSCRIPTION_LIMIT_REACHED when at capacity', async () => {
    // Reset consultant to active but with maxProjects: 3 and 3 active projects
    await models.Consultant.findByIdAndUpdate(consultant._id, {
      'subscription.currentPeriodEnd': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      'subscription.gracePeriodEnd': new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      'subscription.maxProjects': 3,
      'subscription.customLimitOverrides.maxProjects': 3,
    });

    const token = createTestToken(consultant._id.toString(), consultant.email);

    const projectPayload = {
      client: 'Over Limit Client',
      email: `overlimit_${Date.now()}@example.com`,
      company: 'Over Limit Co',
      sector: 'Tech',
      value: 100000,
      advance: 50,
      mid: 25,
      final: 25,
    };

    const res = await fetch(`${baseUrl}/api/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(projectPayload),
    });

    assert.equal(res.status, 403, 'Should reject with 403 Forbidden on quota breach');
    const body = await res.json();
    assert.equal(body.code, 'SUBSCRIPTION_LIMIT_REACHED');
    assert.ok(body.limit);
    assert.equal(body.limit.resource, 'projects');
    assert.equal(body.limit.current, 3);
    assert.equal(body.limit.max, 3);
  });
});
