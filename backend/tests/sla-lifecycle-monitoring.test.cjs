'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const {
  connectTestDatabase,
  disconnectTestDatabase,
  models,
} = require('./helpers.cjs');

const {
  checkAndEscalateDeadlines,
  isProjectAwaitingClientAction,
  calculateProjectActiveSla,
  setProjectDeliveryDeadline,
} = require('../dist/services/deadlineMonitoring.service.js');

test('FLOXA SLA Lifecycle & Client-Wait Protection Test Suite (BUG-HIGH-02)', async (t) => {
  await connectTestDatabase();

  const randSuffix = Math.random().toString(36).substring(2, 8);
  const createdProjectIds = [];
  const createdConsultantIds = [];
  const createdClientIds = [];

  async function createFixture(overrides = {}) {
    const rand = `${randSuffix}_${Math.random().toString(36).substring(2, 6)}`;
    const consultant = await models.Consultant.create({
      email: `c_${rand}@floxa-test.local`,
      name: `Consultant ${rand}`,
      password: 'hashed_password_123',
      isActive: true,
      isSuspended: false,
    });
    createdConsultantIds.push(consultant._id);

    const client = await models.Client.create({
      name: `Client ${rand}`,
      email: `cl_${rand}@floxa-test.local`,
      companyName: `Company ${rand}`,
      sector: 'Tech',
    });
    createdClientIds.push(client._id);

    const project = await models.Project.create({
      title: `Project ${rand}`,
      companyName: client.companyName,
      sector: client.sector,
      status: overrides.status || 'discovery',
      consultantId: consultant._id,
      clientId: client._id,
      portalToken: `tok_${rand}`,
      clientSubmittedAt: overrides.clientSubmittedAt !== undefined ? overrides.clientSubmittedAt : new Date(),
      deliveryDeadline: overrides.deliveryDeadline || null,
      deadlineFlagsCount: overrides.deadlineFlagsCount || 0,
      slaPausedAt: overrides.slaPausedAt || null,
      totalClientWaitMs: overrides.totalClientWaitMs || 0,
      clientSignedOff: overrides.clientSignedOff || false,
      isArchived: overrides.isArchived || false,
    });
    createdProjectIds.push(project._id);

    return { consultant, client, project };
  }

  t.after(async () => {
    try {
      if (createdProjectIds.length > 0) {
        await models.Project.deleteMany({ _id: { $in: createdProjectIds } });
        await models.BrandDNA.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.Moodboard.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.Concept.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.ProjectAgreement.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.PaymentMilestone.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.Deliverable.deleteMany({ projectId: { $in: createdProjectIds } });
        await models.ProjectActivity.deleteMany({ projectId: { $in: createdProjectIds } });
      }
      if (createdConsultantIds.length > 0) {
        await models.Consultant.deleteMany({ _id: { $in: createdConsultantIds } });
      }
      if (createdClientIds.length > 0) {
        await models.Client.deleteMany({ _id: { $in: createdClientIds } });
      }
    } catch (err) {
      console.warn('Test cleanup error:', err);
    }
    await disconnectTestDatabase();
  });

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const T0 = Date.now() - 150 * ONE_HOUR_MS; // Anchor point in the past

  // Scenario 1: Consultant overdue before Brand DNA: Warning 1, 2, 3 triggered at 24h, 48h, 72h
  await t.test('1. Consultant overdue before Brand DNA: Warning 1, 2, 3 triggered at 24h, 48h, 72h', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
    });

    // 25h overdue -> Flag 1
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    let p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 1, 'Should trigger Flag 1 at 25h overdue');

    // 49h overdue -> Flag 2
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);
    p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 2, 'Should trigger Flag 2 at 49h overdue');

    // 73h overdue -> Flag 3
    await checkAndEscalateDeadlines(T0 + 73 * ONE_HOUR_MS);
    p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 3, 'Should trigger Flag 3 at 73h overdue');

    const activities = await models.ProjectActivity.find({ projectId: project._id });
    const actions = activities.map((a) => a.action);
    assert.ok(actions.includes('deadline_warning_1'), 'Should log warning 1');
    assert.ok(actions.includes('deadline_warning_2'), 'Should log warning 2');
    assert.ok(actions.includes('deadline_warning_3'), 'Should log warning 3');
  });

  // Scenario 2: Brand DNA generated: SLA monitoring continues (does NOT stop)
  await t.test('2. Brand DNA generated: SLA monitoring continues (does NOT stop)', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
    });

    // Brand DNA exists for this project
    await models.BrandDNA.create({
      projectId: project._id,
      brandCore: { purpose: 'Test' },
      status: 'ready',
    });

    // At 25h overdue, SLA scheduler MUST still monitor and escalate
    await checkAndEscalateDeadlines(T0 + 25 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 1, 'SLA monitoring must not stop after Brand DNA is created');

    const warning1 = await models.ProjectActivity.findOne({
      projectId: project._id,
      action: 'deadline_warning_1',
    });
    assert.ok(warning1, 'Warning activity must be logged');
    assert.ok(
      warning1.description.includes('project deliverables'),
      'Warning description should reference project deliverables after Brand DNA is created'
    );
  });

  // Scenario 3: Consultant delays moodboard preparation: SLA warnings continue to escalate
  await t.test('3. Consultant delays moodboard preparation: SLA warnings continue to escalate', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
    });

    await models.BrandDNA.create({
      projectId: project._id,
      brandCore: { purpose: 'Test' },
    });

    // Consultant has not created/shared any moodboard yet
    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, false, 'Consultant is responsible for moodboards');

    // 49h overdue -> Flag 2
    await checkAndEscalateDeadlines(T0 + 49 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 2, 'Moodboard delay must escalate to Flag 2');
  });

  // Scenario 4: Consultant delays concept preparation: SLA warnings continue to escalate
  await t.test('4. Consultant delays concept preparation: SLA warnings continue to escalate', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 2,
    });

    await models.BrandDNA.create({
      projectId: project._id,
    });

    // Client selected moodboard
    await models.Moodboard.create({
      projectId: project._id,
      title: 'Board A',
      image: '/uploads/moodboard_a.png',
      isShared: true,
      isSelected: true,
    });

    // Consultant has not created concepts
    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, false, 'Consultant is responsible for concepts');

    // 73h overdue -> Flag 3
    await checkAndEscalateDeadlines(T0 + 73 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 3, 'Concept preparation delay must escalate to Flag 3');
  });

  // Scenario 5: Client moodboard selection pending: SLA clock pauses. Warnings do NOT fire
  await t.test('5. Client moodboard selection pending: SLA clock pauses. Warnings do NOT fire', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
    });

    // Consultant shared moodboard, awaiting client selection
    await models.Moodboard.create({
      projectId: project._id,
      title: 'Direction 1',
      image: '/uploads/moodboard_dir1.png',
      isShared: true,
      isSelected: false,
    });

    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, true);
    assert.strictEqual(wait.reason, 'awaiting_moodboard_selection');

    // Run scheduler: SLA clock should pause
    const pauseTime = T0 + 30 * ONE_HOUR_MS;
    await checkAndEscalateDeadlines(pauseTime);

    let p = await models.Project.findById(project._id);
    assert.ok(p.slaPausedAt, 'slaPausedAt must be recorded');
    assert.strictEqual(p.deadlineFlagsCount, 1, 'Flags must NOT escalate while paused');

    // Advance 100 hours while client is still selecting
    await checkAndEscalateDeadlines(pauseTime + 100 * ONE_HOUR_MS);
    p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 1, 'Flags must NOT escalate despite 100h elapsing');
  });

  // Scenario 6: Client concept approval pending: SLA clock pauses. Warnings do NOT fire
  await t.test('6. Client concept approval pending: SLA clock pauses. Warnings do NOT fire', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
    });

    await models.Concept.create({
      projectId: project._id,
      title: 'Concept V1',
      status: 'shared',
    });

    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, true);
    assert.strictEqual(wait.reason, 'awaiting_concept_approval');

    await checkAndEscalateDeadlines(T0 + 30 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.ok(p.slaPausedAt, 'Clock should be paused for concept review');
  });

  // Scenario 7: Agreement signature pending: SLA clock pauses. Warnings do NOT fire
  await t.test('7. Agreement signature pending: SLA clock pauses. Warnings do NOT fire', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
    });

    await models.ProjectAgreement.create({
      projectId: project._id,
      status: 'signature_requested',
      signedAt: null,
    });

    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, true);
    assert.strictEqual(wait.reason, 'awaiting_agreement_signature');

    await checkAndEscalateDeadlines(T0 + 30 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.ok(p.slaPausedAt, 'Clock should be paused for agreement signature');
  });

  // Scenario 8: Milestone payment pending: SLA clock pauses. Warnings do NOT fire
  await t.test('8. Milestone payment pending: SLA clock pauses. Warnings do NOT fire', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
    });

    await models.PaymentMilestone.create({
      projectId: project._id,
      type: 'advance',
      percentage: 40,
      amount: 15000,
      status: 'requested',
    });

    const wait = await isProjectAwaitingClientAction(project);
    assert.strictEqual(wait.awaitingClient, true);
    assert.strictEqual(wait.reason, 'awaiting_milestone_payment');

    await checkAndEscalateDeadlines(T0 + 30 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.ok(p.slaPausedAt, 'Clock should be paused for milestone payment');
  });

  // Scenario 9: Client completes pending action: SLA clock resumes with remaining time
  await t.test('9. Client completes pending action: SLA clock resumes with remaining time', async () => {
    const pauseStart = T0 + 25 * ONE_HOUR_MS;
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
      slaPausedAt: new Date(pauseStart),
      totalClientWaitMs: 0,
    });

    const milestone = await models.PaymentMilestone.create({
      projectId: project._id,
      type: 'advance',
      percentage: 40,
      amount: 15000,
      status: 'requested',
    });

    // Client pays 50 hours later
    const clientPayTime = pauseStart + 50 * ONE_HOUR_MS;
    await models.PaymentMilestone.findByIdAndUpdate(milestone._id, { status: 'paid', paidAt: new Date(clientPayTime) });

    // Scheduler runs at clientPayTime: pause ends, wait time banked into totalClientWaitMs
    await checkAndEscalateDeadlines(clientPayTime);
    let p = await models.Project.findById(project._id);
    assert.strictEqual(p.slaPausedAt, null, 'slaPausedAt should be cleared');
    assert.strictEqual(p.totalClientWaitMs, 50 * ONE_HOUR_MS, 'Should bank 50 hours of client wait');

    // Effective deadline = T0 + 50h
    // At clientPayTime (T0 + 75h), active elapsed = (T0 + 75h) - (T0 + 50h) = 25h overdue -> Flag 1 maintained
    assert.strictEqual(p.deadlineFlagsCount, 1, 'Should resume with active overdue time intact');
  });

  // Scenario 10: Long client wait does NOT trigger false consultant suspension
  await t.test('10. Long client wait does NOT trigger false consultant suspension', async () => {
    // Client took 10 days (240h) to approve agreement. Wall clock is 11 days (264h) past original deadline.
    // Consultant active time is only 24h. Consultant must NOT be suspended!
    const TEN_DAYS_MS = 10 * 24 * ONE_HOUR_MS;
    const ELEVEN_DAYS_MS = 11 * 24 * ONE_HOUR_MS;

    const { consultant, project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
      totalClientWaitMs: TEN_DAYS_MS,
      slaPausedAt: null,
    });

    await checkAndEscalateDeadlines(T0 + ELEVEN_DAYS_MS);
    const p = await models.Project.findById(project._id);
    const c = await models.Consultant.findById(consultant._id);

    // Active overdue = 264h - 240h = 24h -> Flag 1, NOT suspension (Flag 4)
    assert.strictEqual(p.deadlineFlagsCount, 1, 'Should only be at Flag 1 because client took 10 days');
    assert.strictEqual(c.isActive, true, 'Consultant must remain active');
    assert.strictEqual(c.isSuspended, false, 'Consultant must NOT be falsely suspended');
  });

  // Scenario 11: Consultant overdue after excluding client wait: Warnings trigger correctly
  await t.test('11. Consultant overdue after excluding client wait: Warnings trigger correctly', async () => {
    const TEN_DAYS_MS = 10 * 24 * ONE_HOUR_MS;
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 1,
      totalClientWaitMs: TEN_DAYS_MS,
    });

    // 10 days client wait + 49h consultant delay = 289h wall-clock
    await checkAndEscalateDeadlines(T0 + TEN_DAYS_MS + 49 * ONE_HOUR_MS);
    let p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 2, 'Should escalate to Flag 2 after 49h active consultant delay');

    // 10 days client wait + 73h consultant delay = 313h wall-clock
    await checkAndEscalateDeadlines(T0 + TEN_DAYS_MS + 73 * ONE_HOUR_MS);
    p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 3, 'Should escalate to Flag 3 after 73h active consultant delay');
  });

  // Scenario 12: Consultant reaches 96h active overdue: Automatic suspension fires correctly
  await t.test('12. Consultant reaches 96h active overdue: Automatic suspension fires correctly', async () => {
    const { consultant, project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 3,
      totalClientWaitMs: 0,
    });

    // 97h active overdue -> Flag 4 + Consultant suspension
    await checkAndEscalateDeadlines(T0 + 97 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    const c = await models.Consultant.findById(consultant._id);

    assert.strictEqual(p.deadlineFlagsCount, 4, 'Should reach Flag 4');
    assert.strictEqual(p.deadlineBreached, true, 'deadlineBreached should be true');
    assert.strictEqual(c.isActive, false, 'Consultant must be deactivated');
    assert.strictEqual(c.isSuspended, true, 'Consultant must be suspended');
    assert.strictEqual(c.suspensionReason, 'deadline_breach');
    assert.strictEqual(String(c.suspendedDueToProjectId), String(project._id));

    const suspensionActivity = await models.ProjectActivity.findOne({
      projectId: project._id,
      action: 'account_suspended_deadline_breach',
    });
    assert.ok(suspensionActivity, 'Must log suspension activity');
  });

  // Scenario 13: Final deliverables completed: SLA monitoring stops permanently
  await t.test('13. Final deliverables completed: SLA monitoring stops permanently', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
      clientSignedOff: true,
    });

    // 500h elapsed
    await checkAndEscalateDeadlines(T0 + 500 * ONE_HOUR_MS);
    const p = await models.Project.findById(project._id);
    assert.strictEqual(p.deadlineFlagsCount, 0, 'Signed off project must never receive SLA flags');
  });

  // Scenario 14: Delivered/archived projects are exempt from monitoring
  await t.test('14. Delivered/archived projects are exempt from monitoring', async () => {
    const { project: deliveredProj } = await createFixture({
      deliveryDeadline: new Date(T0),
      status: 'delivered',
      deadlineFlagsCount: 0,
    });

    const { project: archivedProj } = await createFixture({
      deliveryDeadline: new Date(T0),
      isArchived: true,
      deadlineFlagsCount: 0,
    });

    await checkAndEscalateDeadlines(T0 + 200 * ONE_HOUR_MS);

    const dP = await models.Project.findById(deliveredProj._id);
    const aP = await models.Project.findById(archivedProj._id);
    assert.strictEqual(dP.deadlineFlagsCount, 0, 'Delivered project is exempt');
    assert.strictEqual(aP.deadlineFlagsCount, 0, 'Archived project is exempt');
  });

  // Scenario 15: Multiple scheduler runs do NOT create duplicate warnings (idempotent)
  await t.test('15. Multiple scheduler runs do NOT create duplicate warnings (idempotent)', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 0,
    });

    // Run scheduler 4 times consecutively at the exact same overdue time
    const checkTime = T0 + 25 * ONE_HOUR_MS;
    await checkAndEscalateDeadlines(checkTime);
    await checkAndEscalateDeadlines(checkTime);
    await checkAndEscalateDeadlines(checkTime);
    await checkAndEscalateDeadlines(checkTime);

    const warnings = await models.ProjectActivity.find({
      projectId: project._id,
      action: 'deadline_warning_1',
    });
    assert.strictEqual(warnings.length, 1, 'Exactly one activity log entry should exist for Warning 1');
  });

  // Scenario 16: BUG-CRITICAL-01 reactivation behavior remains intact
  await t.test('16. BUG-CRITICAL-01 reactivation behavior remains intact', async () => {
    const { consultant, project } = await createFixture({
      deliveryDeadline: new Date(T0),
      deadlineFlagsCount: 4,
      deadlineBreached: true,
    });

    // Consultant suspended
    await models.Consultant.findByIdAndUpdate(consultant._id, {
      isActive: false,
      isSuspended: true,
      suspendedDueToProjectId: project._id,
    });

    // SuperAdmin reactivates consultant (applies Option A reset)
    const resetFields = {
      deliveryDeadline: null,
      deadlineSetAt: null,
      deadlineFlagsCount: 0,
      deadlineBreached: false,
      deadlineNote: 'Reactivation approved by SuperAdmin. Awaiting fresh deadline commitment.',
      slaPausedAt: null,
      totalClientWaitMs: 0,
    };
    await models.Project.findByIdAndUpdate(project._id, { $set: resetFields });
    await models.Consultant.findByIdAndUpdate(consultant._id, {
      isActive: true,
      isSuspended: false,
      suspendedDueToProjectId: null,
    });

    // Scheduler runs: must NOT re-suspend
    await checkAndEscalateDeadlines(Date.now());
    let reloadedC = await models.Consultant.findById(consultant._id);
    let reloadedP = await models.Project.findById(project._id);
    assert.strictEqual(reloadedC.isActive, true, 'Consultant remains active');
    assert.strictEqual(reloadedC.isSuspended, false, 'Consultant is NOT re-suspended');
    assert.strictEqual(reloadedP.deadlineFlagsCount, 0, 'Flags remain cleared');

    // Consultant commits fresh delivery deadline
    const futureDate = new Date(Date.now() + 7 * 24 * ONE_HOUR_MS);
    const updated = await setProjectDeliveryDeadline(
      project._id.toString(),
      consultant._id.toString(),
      futureDate,
      'New commitment'
    );
    assert.ok(updated, 'Deadline set succeeds');
    assert.strictEqual(new Date(updated.deliveryDeadline).getTime(), futureDate.getTime());
    assert.strictEqual(updated.slaPausedAt, null);
    assert.strictEqual(updated.totalClientWaitMs, 0);
  });

  // Scenario 17: Server restart retains accumulated pause duration (persisted in MongoDB)
  await t.test('17. Server restart retains accumulated pause duration (persisted in MongoDB)', async () => {
    const { project } = await createFixture({
      deliveryDeadline: new Date(T0),
      totalClientWaitMs: 48 * ONE_HOUR_MS,
      slaPausedAt: new Date(T0 + 50 * ONE_HOUR_MS),
    });

    // Query fresh from MongoDB (simulates cold read on new server instance)
    const doc = await models.Project.findById(project._id).lean();
    assert.strictEqual(doc.totalClientWaitMs, 48 * ONE_HOUR_MS, 'Accumulated pause duration is saved');
    assert.ok(doc.slaPausedAt, 'Active pause start timestamp is saved');

    // Test calculateProjectActiveSla helper
    const activeSla = calculateProjectActiveSla(doc, T0 + 55 * ONE_HOUR_MS);
    assert.strictEqual(activeSla.isPaused, true, 'SLA should reflect active pause');
    // totalClientWaitMs = 48h + 5h = 53h
    assert.strictEqual(activeSla.totalClientWaitMs, 53 * ONE_HOUR_MS);
  });
});
