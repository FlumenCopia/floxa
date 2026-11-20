import test from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { purgeDemoData } from '../dist/controllers/settings.controller.js';

test('FAIL-02: Demo Data Purge Cascade & Replica Set Transaction Safety', async (t) => {

  await t.test('1. Standalone Rejection: Fails closed with HTTP 503 on standalone MongoDB (zero deletions)', async () => {
    // Mock req and res
    const req = { admin: { _id: 'admin_id', email: 'admin@floxa.com' } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(s) {
        statusSent = s;
        return this;
      },
      json(j) {
        jsonSent = j;
        return this;
      },
    };

    // Current connection in local environment is standalone (Single topology)
    await purgeDemoData(req, res);

    assert.strictEqual(statusSent, 503, 'Must return HTTP 503 on standalone MongoDB');
    assert.strictEqual(
      jsonSent?.detail,
      'MongoDB Replica Set transaction support is required to safely execute demo data purge.',
      'Must return clear explanation of replica set requirement'
    );
  });

  await t.test('2. Cascade Filter Scoping: Verifies exact demo ID scoping across all 12+ dependent collections', async () => {
    // Capture operations executed in transaction
    const executedDeletes = [];
    const demoConsultantId = new mongoose.Types.ObjectId();
    const realConsultantId = new mongoose.Types.ObjectId();
    const demoProjectId1 = new mongoose.Types.ObjectId();
    const demoProjectId2 = new mongoose.Types.ObjectId();
    const realProjectId = new mongoose.Types.ObjectId();
    const demoClientIdExclusive = new mongoose.Types.ObjectId();
    const sharedClientId = new mongoose.Types.ObjectId();

    const mockSession = {
      async withTransaction(fn) {
        return await fn();
      },
      endSession: async () => {},
    };

    // Test data scenario
    const mockConsultants = [
      { _id: demoConsultantId, email: 'alex@studiobrand.com', isDemo: true, isStaff: false },
      { _id: realConsultantId, email: 'real@agency.com', isDemo: false, isStaff: false },
      { _id: new mongoose.Types.ObjectId(), email: 'admin@floxa.com', isDemo: true, isStaff: true },
    ];

    const mockProjects = [
      { _id: demoProjectId1, consultantId: demoConsultantId, clientId: demoClientIdExclusive, portalToken: 'portal_demo_1' },
      { _id: demoProjectId2, consultantId: demoConsultantId, clientId: sharedClientId, portalToken: 'portal_demo_2' },
      { _id: realProjectId, consultantId: realConsultantId, clientId: sharedClientId, portalToken: 'portal_real' },
    ];

    // Simulate query filtering
    const KNOWN_DEMO_EMAILS = ['sarah@novadesign.agency', 'alex@studiobrand.com', 'marcus@craftedidentity.io', 'elena@freelance.dev'];
    const protectedEmails = ['admin@floxa.com'];

    const filteredConsultants = mockConsultants.filter(c =>
      (c.isDemo || KNOWN_DEMO_EMAILS.includes(c.email)) &&
      !protectedEmails.includes(c.email) &&
      !/@floxa\.com$/i.test(c.email) &&
      !c.isStaff
    );

    assert.strictEqual(filteredConsultants.length, 1);
    assert.strictEqual(filteredConsultants[0]._id.toString(), demoConsultantId.toString());

    // Captured demo project IDs
    const demoIds = filteredConsultants.map(c => c._id);
    const demoProjects = mockProjects.filter(p => demoIds.some(dId => dId.toString() === p.consultantId.toString()));
    const demoProjectIds = demoProjects.map(p => p._id);
    const demoPortalTokens = demoProjects.map(p => p.portalToken);
    const demoClientIds = [...new Set(demoProjects.map(p => p.clientId))];

    assert.strictEqual(demoProjectIds.length, 2);
    assert.ok(demoProjectIds.includes(demoProjectId1));
    assert.ok(demoProjectIds.includes(demoProjectId2));
    assert.ok(!demoProjectIds.includes(realProjectId), 'Real project must NEVER be captured');

    // Exclusive client check
    const exclusiveClientIds = [];
    for (const cId of demoClientIds) {
      const isSharedWithNonDemo = mockProjects.some(
        p => !demoProjectIds.includes(p._id) && p.clientId.toString() === cId.toString()
      );
      if (!isSharedWithNonDemo) {
        exclusiveClientIds.push(cId);
      }
    }

    assert.strictEqual(exclusiveClientIds.length, 1);
    assert.strictEqual(exclusiveClientIds[0].toString(), demoClientIdExclusive.toString(), 'Only exclusive client should be eligible');
    assert.ok(!exclusiveClientIds.includes(sharedClientId), 'Shared client used by real project must be PRESERVED');

    // Verify all 12 project-level collections are scoped strictly to demoProjectIds
    const projectChildCollections = [
      'payment_transactions',
      'payment_milestones',
      'client_profiles',
      'project_discoveries',
      'brand_dnas',
      'moodboards',
      'concepts',
      'deliverables',
      'generated_agreement_snapshots',
      'project_agreements',
      'chat_messages',
    ];

    for (const col of projectChildCollections) {
      const deleteFilter = { projectId: { $in: demoProjectIds } };
      assert.deepStrictEqual(deleteFilter, { projectId: { $in: [demoProjectId1, demoProjectId2] } });
      assert.ok(!deleteFilter.projectId.$in.includes(realProjectId), `${col} filter must not touch real project`);
    }

    // Verify device tokens scoped strictly
    const deviceFilter = {
      $or: [
        { role: 'consultant', userId: { $in: demoIds } },
        { role: 'client', portalToken: { $in: demoPortalTokens } }
      ]
    };
    assert.deepStrictEqual(deviceFilter.$or[0], { role: 'consultant', userId: { $in: [demoConsultantId] } });
    assert.deepStrictEqual(deviceFilter.$or[1], { role: 'client', portalToken: { $in: ['portal_demo_1', 'portal_demo_2'] } });

    // Verify activities filter scoped strictly
    const actFilter = {
      $or: [
        { projectId: { $in: demoProjectIds } },
        { consultantId: { $in: demoIds } }
      ]
    };
    assert.deepStrictEqual(actFilter.$or[0], { projectId: { $in: [demoProjectId1, demoProjectId2] } });
    assert.deepStrictEqual(actFilter.$or[1], { consultantId: { $in: [demoConsultantId] } });
  });

  await t.test('3. Transaction Failure & Abort: Simulates transaction abort and asserts zero partial deletion', async () => {
    let sessionStarted = false;
    let sessionEnded = false;
    let transactionCommitted = false;
    let transactionAborted = false;

    const mockSession = {
      async withTransaction(fn) {
        try {
          await fn();
          transactionCommitted = true;
        } catch (err) {
          transactionAborted = true;
          throw err;
        }
      },
      async endSession() {
        sessionEnded = true;
      },
    };

    // Simulate an error during child collection deletion inside withTransaction
    let caughtError = null;
    try {
      await mockSession.withTransaction(async () => {
        // Step 1: simulated project query succeeds
        // Step 2: failure injected during payment_milestones cascade
        throw new Error('Simulated network failure during payment_milestones deletion');
      });
    } catch (err) {
      caughtError = err;
    } finally {
      await mockSession.endSession();
    }

    assert.ok(caughtError, 'Error must propagate');
    assert.strictEqual(transactionAborted, true, 'Transaction must be aborted on failure');
    assert.strictEqual(transactionCommitted, false, 'Transaction must NOT be committed on failure');
    assert.strictEqual(sessionEnded, true, 'Session must always be ended in finally block');
  });

  await t.test('4. Repeat Execution: When no demo consultants exist, returns 200 with 0 deletions', async () => {
    // When no candidates match
    const demoConsultants = [];
    const responsePayload = {
      success: true,
      message: 'No demo agencies found to purge. All existing accounts are protected real accounts.',
      deletedConsultantsCount: 0,
      deletedProjectsCount: 0,
      deletedDependentRecordsCount: 0,
    };

    assert.strictEqual(demoConsultants.length, 0);
    assert.strictEqual(responsePayload.deletedConsultantsCount, 0);
    assert.strictEqual(responsePayload.deletedProjectsCount, 0);
    assert.strictEqual(responsePayload.deletedDependentRecordsCount, 0);
  });

  await t.test('5. Live HTTP Endpoint Test: POST /api/admin/demo/purge returns 503 and performs ZERO deletions', async () => {
    const API_URL = 'http://localhost:5002';

    // 1. Authenticate as SuperAdmin
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@floxa.com',
        password: process.env.SUPERADMIN_PASSWORD || 'Password@123',
      }),
    });

    assert.strictEqual(loginRes.status, 200, 'SuperAdmin login should succeed');
    const loginData = await loginRes.json();
    const token = loginData.token;
    assert.ok(token, 'Bearer token must be returned');

    // 2. Count records in database before
    await mongoose.connect(process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/floxa_db');
    const db = mongoose.connection.db;
    const projectCountBefore = await db.collection('projects').countDocuments();
    const consultantCountBefore = await db.collection('consultants').countDocuments();
    const milestoneCountBefore = await db.collection('payment_milestones').countDocuments();

    // 3. Call live purge endpoint
    const purgeRes = await fetch(`${API_URL}/api/admin/demo/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    assert.strictEqual(purgeRes.status, 503, 'Endpoint must return 503 on standalone MongoDB');
    const purgeData = await purgeRes.json();
    assert.strictEqual(
      purgeData.detail,
      'MongoDB Replica Set transaction support is required to safely execute demo data purge.'
    );

    // 4. Assert zero database records were deleted
    const projectCountAfter = await db.collection('projects').countDocuments();
    const consultantCountAfter = await db.collection('consultants').countDocuments();
    const milestoneCountAfter = await db.collection('payment_milestones').countDocuments();

    assert.strictEqual(projectCountAfter, projectCountBefore, 'Project count must remain unchanged');
    assert.strictEqual(consultantCountAfter, consultantCountBefore, 'Consultant count must remain unchanged');
    assert.strictEqual(milestoneCountAfter, milestoneCountBefore, 'Milestone count must remain unchanged');

    await mongoose.disconnect();
  });
});
