'use strict';

const path = require('path');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const http = require('http');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const {
  connectTestDatabase,
  disconnectTestDatabase,
  startTestServer,
  closeTestServer,
  models,
} = require('./helpers.cjs');

const {
  checkAndEscalateDeadlines,
  onBrandDnaCompleted,
} = require('../dist/services/deadlineMonitoring.service.js');

const { hashPassword } = require('../dist/utils/crypto.js');
const { generateTokens } = require('../dist/services/auth.service.js');
const { serializeProject } = require('../dist/utils/serializer.js');

async function runHttpRequest({ method, path: reqPath, headers = {}, body = null, port = 5000 }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json || data,
          });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  console.log('=== STARTING FLOXA COMPLETE SLA MONITORING E2E VERIFICATION ===\n');

  const conn = await connectTestDatabase();
  const db = conn.db;

  // Record initial baseline
  const initialCounts = {
    projects: await db.collection('projects').countDocuments(),
    consultants: await db.collection('consultants').countDocuments(),
    milestones: await db.collection('payment_milestones').countDocuments(),
    activities: await db.collection('project_activities').countDocuments(),
    deliverables: await db.collection('deliverables').countDocuments(),
  };

  console.log('1. Database Baseline Counts:', JSON.stringify(initialCounts));

  const runId = Math.random().toString(36).substring(2, 8);
  const createdProjectIds = [];
  const createdConsultantIds = [];
  const createdClientIds = [];
  const results = [];

  function recordResult(testName, expected, actual, passed) {
    results.push({ testName, expected, actual, passed });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}`);
    if (!passed) {
      console.error(`   Expected: ${expected}`);
      console.error(`   Actual:   ${actual}`);
    }
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const T0 = Date.now() - 150 * ONE_HOUR_MS; // Fixed anchor point in the past

  try {
    // -------------------------------------------------------------------------
    // SETUP FIXTURES FOR SLA THRESHOLD TESTS (Section 2 & Section 5)
    // -------------------------------------------------------------------------
    console.log('\n--- Setting up dedicated test fixtures ---');
    const passwordHash = await hashPassword('TestSlaPass123!');
    const consultant = await models.Consultant.create({
      email: `test_sla_consultant_${runId}@floxa-test.local`,
      name: `SLA Test Consultant ${runId}`,
      password: passwordHash,
      isActive: true,
      isSuspended: false,
      tokenVersion: 0,
    });
    createdConsultantIds.push(consultant._id);

    const client = await models.Client.create({
      name: `SLA Test Client ${runId}`,
      email: `test_sla_client_${runId}@floxa-test.local`,
      companyName: `SLA Test Corp ${runId}`,
      sector: 'Technology',
    });
    createdClientIds.push(client._id);

    const project1 = await models.Project.create({
      title: `SLA Lifecycle Project ${runId}`,
      companyName: client.companyName,
      sector: client.sector,
      status: 'discovery',
      consultantId: consultant._id,
      clientId: client._id,
      portalToken: `sla_token_1_${runId}`,
      clientSubmittedAt: new Date(T0 - 200 * ONE_HOUR_MS),
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
      slaPausedAt: null,
      totalClientWaitMs: 0,
      clientSignedOff: false,
      isArchived: false,
    });
    createdProjectIds.push(project1._id);

    const tokens = generateTokens(consultant);
    const consultantAccessToken = tokens.access;

    // -------------------------------------------------------------------------
    // TEST 1: WARNING 1 (25 hours overdue)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Warning 1 (25h Overdue) ---');
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);

    const p1AfterW1 = await models.Project.findById(project1._id);
    const cAfterW1 = await models.Consultant.findById(consultant._id);
    const actW1 = await models.ProjectActivity.find({ projectId: project1._id, action: 'deadline_warning_1' });
    const serializedW1 = serializeProject(p1AfterW1);

    recordResult(
      'Warning 1 - deadlineFlagsCount === 1',
      '1',
      String(p1AfterW1.deadlineFlagsCount),
      p1AfterW1.deadlineFlagsCount === 1
    );
    recordResult(
      'Warning 1 - Activity logged once with action deadline_warning_1',
      '1 activity',
      `${actW1.length} activities`,
      actW1.length === 1
    );
    recordResult(
      'Warning 1 - Description mentions 24h Overdue',
      'contains Warning 1 (24h Overdue)',
      actW1[0]?.description || '',
      Boolean(actW1[0]?.description?.includes('Warning 1 (24h Overdue)'))
    );
    recordResult(
      'Warning 1 - Consultant remains active & not suspended',
      'isActive: true, isSuspended: false',
      `isActive: ${cAfterW1.isActive}, isSuspended: ${cAfterW1.isSuspended}`,
      cAfterW1.isActive === true && cAfterW1.isSuspended === false
    );
    recordResult(
      'Warning 1 - Serializer reports deadline_status flag_1',
      'flag_1',
      serializedW1.deadline_status,
      serializedW1.deadline_status === 'flag_1'
    );

    // Idempotency: Second scan at 25h must not create duplicate activity or change flags
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const actW1Dup = await models.ProjectActivity.find({ projectId: project1._id, action: 'deadline_warning_1' });
    recordResult(
      'Warning 1 - Idempotent scan generates no duplicates',
      '1 activity',
      `${actW1Dup.length} activities`,
      actW1Dup.length === 1
    );

    // -------------------------------------------------------------------------
    // TEST 2: WARNING 2 (49 hours overdue)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Warning 2 (49h Overdue) ---');
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);

    const p1AfterW2 = await models.Project.findById(project1._id);
    const cAfterW2 = await models.Consultant.findById(consultant._id);
    const actW2 = await models.ProjectActivity.find({ projectId: project1._id, action: 'deadline_warning_2' });
    const serializedW2 = serializeProject(p1AfterW2);

    recordResult(
      'Warning 2 - deadlineFlagsCount === 2',
      '2',
      String(p1AfterW2.deadlineFlagsCount),
      p1AfterW2.deadlineFlagsCount === 2
    );
    recordResult(
      'Warning 2 - Activity logged once with action deadline_warning_2',
      '1 activity',
      `${actW2.length} activities`,
      actW2.length === 1
    );
    recordResult(
      'Warning 2 - Description mentions 48h Overdue',
      'contains Warning 2 (48h Overdue)',
      actW2[0]?.description || '',
      Boolean(actW2[0]?.description?.includes('Warning 2 (48h Overdue)'))
    );
    recordResult(
      'Warning 2 - Consultant remains active & not suspended',
      'isActive: true, isSuspended: false',
      `isActive: ${cAfterW2.isActive}, isSuspended: ${cAfterW2.isSuspended}`,
      cAfterW2.isActive === true && cAfterW2.isSuspended === false
    );
    recordResult(
      'Warning 2 - Serializer reports deadline_status flag_2',
      'flag_2',
      serializedW2.deadline_status,
      serializedW2.deadline_status === 'flag_2'
    );

    // Idempotency: Second scan at 49h must not duplicate
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);
    const actW2Dup = await models.ProjectActivity.find({ projectId: project1._id, action: 'deadline_warning_2' });
    recordResult(
      'Warning 2 - Idempotent scan generates no duplicates',
      '1 activity',
      `${actW2Dup.length} activities`,
      actW2Dup.length === 1
    );

    // -------------------------------------------------------------------------
    // TEST 3: WARNING 3 (73 hours overdue)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Warning 3 (73h Overdue) ---');
    await checkAndEscalateDeadlines(T0 + 73 * ONE_HOUR_MS);

    const p1AfterW3 = await models.Project.findById(project1._id);
    const cAfterW3 = await models.Consultant.findById(consultant._id);
    const actW3 = await models.ProjectActivity.find({ projectId: project1._id, action: 'deadline_warning_3' });
    const serializedW3 = serializeProject(p1AfterW3);

    recordResult(
      'Warning 3 - deadlineFlagsCount === 3',
      '3',
      String(p1AfterW3.deadlineFlagsCount),
      p1AfterW3.deadlineFlagsCount === 3
    );
    recordResult(
      'Warning 3 - Activity logged once with action deadline_warning_3',
      '1 activity',
      `${actW3.length} activities`,
      actW3.length === 1
    );
    recordResult(
      'Warning 3 - Description mentions Final Notice (72h Overdue)',
      'contains Warning 3 - Final Notice (72h Overdue)',
      actW3[0]?.description || '',
      Boolean(actW3[0]?.description?.includes('Warning 3 - Final Notice (72h Overdue)'))
    );
    recordResult(
      'Warning 3 - Consultant remains active & not suspended',
      'isActive: true, isSuspended: false',
      `isActive: ${cAfterW3.isActive}, isSuspended: ${cAfterW3.isSuspended}`,
      cAfterW3.isActive === true && cAfterW3.isSuspended === false
    );
    recordResult(
      'Warning 3 - Serializer reports deadline_status flag_3',
      'flag_3',
      serializedW3.deadline_status,
      serializedW3.deadline_status === 'flag_3'
    );

    // -------------------------------------------------------------------------
    // TEST 4 & 5: LIVE WEBSOCKET TERMINATION & SUSPENSION (97 hours overdue)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4 & 5: Live WebSocket Connection & Flag 4 Suspension (97h Overdue) ---');

    const serverInfo = await startTestServer();

    // Connect a real WebSocket client to the in-process server
    let wsCloseCode = null;
    let wsCloseReason = null;
    let wsConnected = false;

    const wsUrl = `${serverInfo.wsUrl}/ws/support/consultant?token=${consultantAccessToken}&consultant_id=${consultant._id}`;
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => {
      ws.on('open', () => {
        wsConnected = true;
        resolve();
      });
      ws.on('close', (code, reason) => {
        wsCloseCode = code;
        wsCloseReason = reason ? reason.toString() : '';
      });
      ws.on('error', (err) => {
        console.warn('WS error:', err.message);
        resolve();
      });
      // Safety timeout
      setTimeout(resolve, 2000);
    });

    recordResult(
      'WebSocket - Consultant connected successfully to /ws/support/consultant',
      'connected: true',
      `connected: ${wsConnected}`,
      wsConnected === true
    );

    // Now execute 97h escalation to trigger Flag 4 suspension
    await checkAndEscalateDeadlines(T0 + 97 * ONE_HOUR_MS);

    // Allow socket disconnect event to arrive
    await new Promise((resolve) => setTimeout(resolve, 800));

    const p1AfterSusp = await models.Project.findById(project1._id);
    const cAfterSusp = await models.Consultant.findById(consultant._id);
    const actSusp = await models.ProjectActivity.find({
      projectId: project1._id,
      action: 'account_suspended_deadline_breach',
    });
    const serializedSusp = serializeProject(p1AfterSusp);

    recordResult(
      'Suspension - deadlineFlagsCount === 4 and deadlineBreached === true',
      'flags: 4, breached: true',
      `flags: ${p1AfterSusp.deadlineFlagsCount}, breached: ${p1AfterSusp.deadlineBreached}`,
      p1AfterSusp.deadlineFlagsCount === 4 && p1AfterSusp.deadlineBreached === true
    );
    recordResult(
      'Suspension - Consultant isSuspended === true, isActive === false, reason === deadline_breach',
      'isSuspended: true, isActive: false, reason: deadline_breach',
      `isSuspended: ${cAfterSusp.isSuspended}, isActive: ${cAfterSusp.isActive}, reason: ${cAfterSusp.suspensionReason}`,
      cAfterSusp.isSuspended === true &&
        cAfterSusp.isActive === false &&
        cAfterSusp.suspensionReason === 'deadline_breach'
    );
    recordResult(
      'Suspension - Consultant tokenVersion incremented to revoke existing tokens',
      'tokenVersion: 1',
      `tokenVersion: ${cAfterSusp.tokenVersion}`,
      cAfterSusp.tokenVersion === 1
    );
    recordResult(
      'Suspension - Activity logged with action account_suspended_deadline_breach',
      '1 activity',
      `${actSusp.length} activities`,
      actSusp.length === 1
    );
    recordResult(
      'Suspension - Serializer reports deadline_status suspended',
      'suspended',
      serializedSusp.deadline_status,
      serializedSusp.deadline_status === 'suspended'
    );
    recordResult(
      'Suspension - WebSocket closed with code 4001',
      'code 4001, reason: Account suspended due to SLA breach',
      `code: ${wsCloseCode}, reason: ${wsCloseReason}`,
      wsCloseCode === 4001 && wsCloseReason.includes('Account suspended due to SLA breach')
    );

    // -------------------------------------------------------------------------
    // TEST 6: AUTHENTICATION LOCKOUT (API returns HTTP 403)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: API Lockout Verification after Suspension ---');
    const apiRes = await runHttpRequest({
      method: 'GET',
      path: '/api/projects',
      port: serverInfo.port,
      headers: {
        Authorization: `Bearer ${consultantAccessToken}`,
      },
    });

    recordResult(
      'API Lockout - Suspended consultant rejected with HTTP 403',
      'status: 403',
      `status: ${apiRes.status}`,
      apiRes.status === 403
    );
    recordResult(
      'API Lockout - Error code is ACCOUNT_SUSPENDED_DEADLINE_BREACH',
      'ACCOUNT_SUSPENDED_DEADLINE_BREACH',
      apiRes.body?.code || '',
      apiRes.body?.code === 'ACCOUNT_SUSPENDED_DEADLINE_BREACH'
    );

    // -------------------------------------------------------------------------
    // TEST 7: FAIL-03 ISSUE 1 (Premature SLA Pause on Partial Deliverables)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: FAIL-03 Issue 1 - Premature SLA Pause on Partial Deliverables ---');
    const project2 = await models.Project.create({
      title: `FAIL-03 Issue 1 Project ${runId}`,
      companyName: client.companyName,
      sector: client.sector,
      status: 'concepts',
      consultantId: consultant._id,
      clientId: client._id,
      portalToken: `sla_token_2_${runId}`,
      clientSubmittedAt: new Date(T0 - 200 * ONE_HOUR_MS),
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
      slaPausedAt: null,
      totalClientWaitMs: 0,
      clientSignedOff: false,
      isArchived: false,
    });
    createdProjectIds.push(project2._id);

    // Create 1 shared deliverable and 1 draft deliverable
    const deliv1 = await models.Deliverable.create({
      projectId: project2._id,
      title: 'Shared Deliverable 1',
      description: 'Brand Guidelines Document',
      status: 'shared',
      file: 'uploads/deliv1.pdf',
    });
    const deliv2 = await models.Deliverable.create({
      projectId: project2._id,
      title: 'Draft Deliverable 2',
      description: 'Social Media Kit',
      status: 'draft',
      file: 'uploads/deliv2.zip',
    });

    // Run monitoring at 25h overdue: SLA must NOT pause because draft deliverable remains
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const p2AfterScan1 = await models.Project.findById(project2._id);

    recordResult(
      'FAIL-03 Issue 1 - SLA does NOT pause when draft deliverables remain',
      'slaPausedAt: null',
      `slaPausedAt: ${p2AfterScan1.slaPausedAt}`,
      p2AfterScan1.slaPausedAt === null
    );
    recordResult(
      'FAIL-03 Issue 1 - Warning 1 escalates despite partial deliverables shared',
      'deadlineFlagsCount: 1',
      `deadlineFlagsCount: ${p2AfterScan1.deadlineFlagsCount}`,
      p2AfterScan1.deadlineFlagsCount === 1
    );

    // Now update draft deliverable to shared (all deliverables shared, 0 draft)
    await models.Deliverable.findByIdAndUpdate(deliv2._id, { $set: { status: 'shared', sharedWithClient: true } });

    // Run monitoring again: now SLA SHOULD pause for final client review!
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const p2AfterScan2 = await models.Project.findById(project2._id);

    recordResult(
      'FAIL-03 Issue 1 - SLA PAUSES when all deliverables are shared',
      'slaPausedAt: not null',
      `slaPausedAt: ${p2AfterScan2.slaPausedAt}`,
      p2AfterScan2.slaPausedAt !== null
    );

    // Advance time to 49h while paused: SLA clock is frozen, flags must NOT escalate
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);
    const p2AfterScan3 = await models.Project.findById(project2._id);

    recordResult(
      'FAIL-03 Issue 1 - SLA clock remains frozen while waiting for client sign-off',
      'deadlineFlagsCount: 1',
      `deadlineFlagsCount: ${p2AfterScan3.deadlineFlagsCount}`,
      p2AfterScan3.deadlineFlagsCount === 1
    );

    // -------------------------------------------------------------------------
    // TEST 8: FAIL-03 ISSUE 2 (Repeated SLA Warnings after Brand DNA)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: FAIL-03 Issue 2 - Warning Flag Preservation on Brand DNA Completion ---');
    const project3 = await models.Project.create({
      title: `FAIL-03 Issue 2 Project ${runId}`,
      companyName: client.companyName,
      sector: client.sector,
      status: 'discovery',
      consultantId: consultant._id,
      clientId: client._id,
      portalToken: `sla_token_3_${runId}`,
      clientSubmittedAt: new Date(T0 - 200 * ONE_HOUR_MS),
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
      slaPausedAt: null,
      totalClientWaitMs: 0,
      clientSignedOff: false,
      isArchived: false,
    });
    createdProjectIds.push(project3._id);

    // Escalate to Warning 1 at 25h overdue
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const p3BeforeBrand = await models.Project.findById(project3._id);
    recordResult(
      'FAIL-03 Issue 2 - Setup: Project at Warning 1',
      'deadlineFlagsCount: 1',
      `deadlineFlagsCount: ${p3BeforeBrand.deadlineFlagsCount}`,
      p3BeforeBrand.deadlineFlagsCount === 1
    );

    // Call onBrandDnaCompleted()
    await onBrandDnaCompleted(project3._id.toString());
    const p3AfterBrand = await models.Project.findById(project3._id);

    recordResult(
      'FAIL-03 Issue 2 - onBrandDnaCompleted preserves deadlineFlagsCount (does NOT reset to 0)',
      'deadlineFlagsCount: 1',
      `deadlineFlagsCount: ${p3AfterBrand.deadlineFlagsCount}`,
      p3AfterBrand.deadlineFlagsCount === 1
    );

    // Run scan at 25h again: must not duplicate Warning 1
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const p3ActW1 = await models.ProjectActivity.find({ projectId: project3._id, action: 'deadline_warning_1' });
    recordResult(
      'FAIL-03 Issue 2 - Warning 1 is not re-issued after Brand DNA completion',
      '1 activity',
      `${p3ActW1.length} activities`,
      p3ActW1.length === 1
    );

    // Advance to 49h: should cleanly advance to Warning 2
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);
    const p3AfterW2 = await models.Project.findById(project3._id);
    const p3ActW2 = await models.ProjectActivity.find({ projectId: project3._id, action: 'deadline_warning_2' });

    recordResult(
      'FAIL-03 Issue 2 - Project advances cleanly to Warning 2 at 49h overdue',
      'deadlineFlagsCount: 2, 1 warning_2 activity',
      `deadlineFlagsCount: ${p3AfterW2.deadlineFlagsCount}, ${p3ActW2.length} activities`,
      p3AfterW2.deadlineFlagsCount === 2 && p3ActW2.length === 1
    );

    console.log('\n=== ALL E2E VERIFICATIONS COMPLETE ===\n');
  } catch (err) {
    console.error('TEST CAUGHT ERROR:', err);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log('--- Cleaning up dedicated test fixtures ---');
    if (createdProjectIds.length > 0) {
      await models.Project.deleteMany({ _id: { $in: createdProjectIds } });
      await models.Deliverable.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.ProjectActivity.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.BrandDNA.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.Moodboard.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.Concept.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.ProjectAgreement.deleteMany({ projectId: { $in: createdProjectIds } });
      await models.PaymentMilestone.deleteMany({ projectId: { $in: createdProjectIds } });
    }
    if (createdConsultantIds.length > 0) {
      await models.Consultant.deleteMany({ _id: { $in: createdConsultantIds } });
    }
    if (createdClientIds.length > 0) {
      await models.Client.deleteMany({ _id: { $in: createdClientIds } });
    }

    const finalCounts = {
      projects: await db.collection('projects').countDocuments(),
      consultants: await db.collection('consultants').countDocuments(),
      milestones: await db.collection('payment_milestones').countDocuments(),
      activities: await db.collection('project_activities').countDocuments(),
      deliverables: await db.collection('deliverables').countDocuments(),
    };

    console.log('Database Final Counts:', JSON.stringify(finalCounts));
    const countsMatch = JSON.stringify(initialCounts) === JSON.stringify(finalCounts);
    console.log('Counts Match Exactly Baseline:', countsMatch);

    await closeTestServer();
    await disconnectTestDatabase();

    // Summary
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;
    console.log(`\nResults: ${passedCount} PASSED, ${failedCount} FAILED (${results.length} Total)`);

    if (failedCount > 0 || !countsMatch) {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in E2E verification:', err);
  process.exit(1);
});
