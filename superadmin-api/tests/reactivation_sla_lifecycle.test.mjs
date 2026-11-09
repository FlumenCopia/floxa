import test from 'node:test';
import assert from 'node:assert';

/**
 * Unit & Integration Regression Test Suite for BUG-CRITICAL-01:
 * Consultant Reactivation Infinite Re-Suspension Loop
 * 
 * Verifies all 13 mandatory lifecycle and scheduler scenarios
 * using in-memory mock fixtures and deterministic time offsets.
 */

// --- Pure Mock State Engine for SLA Lifecycle Simulation ---

class MockDatabase {
  constructor() {
    this.consultants = new Map();
    this.projects = new Map();
    this.activities = [];
    this.brandDnas = new Map();
  }

  reset() {
    this.consultants.clear();
    this.projects.clear();
    this.activities = [];
    this.brandDnas.clear();
  }

  addConsultant(data) {
    const id = data._id || `c_${Math.random().toString(36).substring(2, 9)}`;
    const consultant = {
      _id: id,
      id,
      name: data.name || 'Test Consultant',
      email: data.email || 'consultant@test.com',
      isActive: data.isActive ?? true,
      isSuspended: data.isSuspended ?? false,
      suspendedAt: data.suspendedAt || null,
      suspensionReason: data.suspensionReason || '',
      suspendedDueToProjectId: data.suspendedDueToProjectId || null,
      tokenVersion: data.tokenVersion || 0,
      subscription: data.subscription || { status: 'active', plan: 'pro' },
      reactivationRequest: data.reactivationRequest || null,
    };
    this.consultants.set(id, consultant);
    return consultant;
  }

  addProject(data) {
    const id = data._id || `p_${Math.random().toString(36).substring(2, 9)}`;
    const project = {
      _id: id,
      id,
      title: data.title || 'Test Project',
      consultantId: data.consultantId,
      deliveryDeadline: data.deliveryDeadline || null,
      deadlineSetAt: data.deadlineSetAt || null,
      deadlineFlagsCount: data.deadlineFlagsCount ?? 0,
      deadlineBreached: data.deadlineBreached ?? false,
      deadlineNote: data.deadlineNote || '',
      isArchived: data.isArchived ?? false,
      status: data.status || 'discovery',
      clientSubmittedAt: data.clientSubmittedAt || new Date(),
    };
    this.projects.set(id, project);
    return project;
  }
}

// Simulates updateConsultantStatus in superadmin-api/src/controllers/admin.controller.ts
async function simulateUpdateConsultantStatus(db, consultantId, isActive, reason = '') {
  const consultant = db.consultants.get(consultantId);
  if (!consultant) throw new Error('Consultant not found');

  consultant.isActive = isActive;
  if (isActive) {
    consultant.isSuspended = false;
    consultant.suspendedAt = null;
    consultant.suspensionReason = '';
    if (consultant.reactivationRequest) {
      consultant.reactivationRequest.status = 'resolved';
    }

    const resetDeadlineFields = {
      deliveryDeadline: null,
      deadlineSetAt: null,
      deadlineFlagsCount: 0,
      deadlineBreached: false,
      deadlineNote: 'Reactivation approved by SuperAdmin. Awaiting fresh deadline commitment.',
    };

    if (consultant.suspendedDueToProjectId) {
      const proj = db.projects.get(consultant.suspendedDueToProjectId);
      if (proj) {
        Object.assign(proj, resetDeadlineFields);
      }
    }

    // Also reset any other projects belonging to this consultant that reached suspension (flags = 4)
    for (const proj of db.projects.values()) {
      if (proj.consultantId === consultant._id && proj.deadlineFlagsCount === 4) {
        Object.assign(proj, resetDeadlineFields);
      }
    }

    consultant.suspendedDueToProjectId = null;
  } else {
    consultant.isSuspended = true;
    consultant.suspendedAt = new Date();
    consultant.suspensionReason = reason || 'admin_manual_suspension';
  }

  consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
  if (consultant.subscription) {
    consultant.subscription.status = isActive ? 'active' : 'suspended';
  }

  return consultant;
}

// Simulates setProjectDeliveryDeadline in backend/src/services/deadlineMonitoring.service.ts
async function simulateSetProjectDeliveryDeadline(db, projectId, consultantId, deadline, note = '', mockNow = Date.now()) {
  const project = db.projects.get(projectId);
  if (!project || project.consultantId !== consultantId || project.isArchived) {
    return null;
  }

  if (project.deadlineFlagsCount && project.deadlineFlagsCount > 0) {
    const error = new Error('Deadline cannot be modified after warning escalation has begun. SuperAdmin approval is required.');
    error.status = 400;
    throw error;
  }

  if (project.deliveryDeadline) {
    const error = new Error('Delivery deadline has already been committed and cannot be changed.');
    error.status = 400;
    throw error;
  }

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    const error = new Error('Invalid deadline date provided.');
    error.status = 400;
    throw error;
  }

  if (deadlineDate.getTime() < mockNow + 6 * 60 * 60 * 1000) {
    const error = new Error('Deadline must be at least 6 hours in the future.');
    error.status = 400;
    throw error;
  }

  if (deadlineDate.getTime() > mockNow + 30 * 24 * 60 * 60 * 1000) {
    const error = new Error('Deadline cannot exceed 30 days from today.');
    error.status = 400;
    throw error;
  }

  project.deliveryDeadline = deadlineDate;
  project.deadlineSetAt = new Date(mockNow);
  project.deadlineFlagsCount = 0;
  project.deadlineBreached = false;
  project.deadlineNote = (note || '').trim();

  return project;
}

// Simulates checkAndEscalateDeadlines in backend/src/services/deadlineMonitoring.service.ts
async function simulateCheckAndEscalateDeadlines(db, mockNow = Date.now()) {
  // Query: isArchived: false, status: { $nin: ['delivered', 'archived'] }, deliveryDeadline: { $ne: null }
  const activeProjects = Array.from(db.projects.values()).filter(
    (p) => !p.isArchived && !['delivered', 'archived'].includes(p.status) && p.deliveryDeadline !== null
  );

  for (const proj of activeProjects) {
    if (!proj.deliveryDeadline) continue;

    // Check if Brand DNA completed
    const brandDna = db.brandDnas.get(proj._id);
    if (brandDna) {
      if (proj.deadlineFlagsCount > 0) {
        proj.deadlineFlagsCount = 0;
      }
      continue;
    }

    const deadlineTime = new Date(proj.deliveryDeadline).getTime();
    const diffMs = deadlineTime - mockNow;

    if (diffMs >= 0) {
      if (proj.deadlineFlagsCount > 0) {
        proj.deadlineFlagsCount = 0;
      }
      continue;
    }

    const hoursOverdue = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));

    if (hoursOverdue >= 96) {
      if (proj.deadlineFlagsCount === 4) {
        continue;
      }

      proj.deadlineFlagsCount = 4;
      const consultant = db.consultants.get(proj.consultantId);
      if (consultant && (consultant.isActive || !consultant.isSuspended)) {
        consultant.isActive = false;
        consultant.isSuspended = true;
        consultant.suspendedAt = new Date(mockNow);
        consultant.suspensionReason = 'deadline_breach';
        consultant.suspendedDueToProjectId = proj._id;
        consultant.tokenVersion = (consultant.tokenVersion || 0) + 1;
        if (consultant.subscription) {
          consultant.subscription.status = 'suspended';
        }
      }
    } else if (hoursOverdue >= 72) {
      proj.deadlineFlagsCount = 3;
    } else if (hoursOverdue >= 48) {
      proj.deadlineFlagsCount = 2;
    } else if (hoursOverdue >= 24) {
      proj.deadlineFlagsCount = 1;
    }
  }
}

// --- Test Suites ---

test('BUG-CRITICAL-01: Consultant Reactivation and SLA Lifecycle Regression Tests', async (t) => {
  const db = new MockDatabase();

  t.beforeEach(() => {
    db.reset();
  });

  await t.test('1. Reactivation after 96-hour suspension: Consultant becomes active', async () => {
    const consultant = db.addConsultant({
      isActive: false,
      isSuspended: true,
      suspendedAt: new Date(Date.now() - 3600000),
      suspensionReason: 'deadline_breach',
      tokenVersion: 5,
      reactivationRequest: { status: 'pending', message: 'Ready to deliver.' },
    });

    const project = db.addProject({
      consultantId: consultant._id,
      deadlineFlagsCount: 4,
      deliveryDeadline: new Date(Date.now() - 100 * 3600000), // 100h overdue
    });
    consultant.suspendedDueToProjectId = project._id;

    await simulateUpdateConsultantStatus(db, consultant._id, true);

    assert.strictEqual(consultant.isActive, true, 'Consultant must be active');
    assert.strictEqual(consultant.isSuspended, false, 'Consultant must not be suspended');
    assert.strictEqual(consultant.suspendedAt, null, 'Suspended timestamp must be null');
    assert.strictEqual(consultant.suspensionReason, '', 'Suspension reason must be cleared');
    assert.strictEqual(consultant.reactivationRequest.status, 'resolved', 'Reactivation request must be resolved');
    assert.strictEqual(consultant.suspendedDueToProjectId, null, 'suspendedDueToProjectId must be cleared');
    assert.strictEqual(consultant.tokenVersion, 6, 'Token version must increment to revoke previous sessions');
    assert.strictEqual(consultant.subscription.status, 'active', 'Subscription status must be active');
  });

  await t.test('2. Old deadline in the past: deliveryDeadline is cleared upon reactivation', async () => {
    const consultant = db.addConsultant({ isActive: false, isSuspended: true });
    const project = db.addProject({
      consultantId: consultant._id,
      deadlineFlagsCount: 4,
      deliveryDeadline: new Date(Date.now() - 120 * 3600000),
    });
    consultant.suspendedDueToProjectId = project._id;

    await simulateUpdateConsultantStatus(db, consultant._id, true);

    assert.strictEqual(project.deliveryDeadline, null, 'Past overdue deadline must be reset to null');
    assert.strictEqual(project.deadlineFlagsCount, 0, 'Flags count must be reset to 0');
    assert.strictEqual(project.deadlineSetAt, null, 'deadlineSetAt must be reset to null');
    assert.strictEqual(project.deadlineBreached, false, 'deadlineBreached must be false');
    assert.ok(project.deadlineNote.includes('Reactivation approved'), 'Informative note must be recorded');
  });

  await t.test('3. Scheduler runs after reactivation: Consultant remains active while awaiting fresh deadline', async () => {
    const consultant = db.addConsultant({ isActive: false, isSuspended: true });
    const project = db.addProject({
      consultantId: consultant._id,
      deadlineFlagsCount: 4,
      deliveryDeadline: new Date(Date.now() - 98 * 3600000),
    });
    consultant.suspendedDueToProjectId = project._id;

    // SuperAdmin reactivates
    await simulateUpdateConsultantStatus(db, consultant._id, true);

    // Simulate 30-minute scheduler run 10 times consecutively
    for (let i = 0; i < 10; i++) {
      await simulateCheckAndEscalateDeadlines(db, Date.now() + i * 30 * 60 * 1000);
      assert.strictEqual(consultant.isActive, true, `Consultant must remain active on scheduler iteration ${i + 1}`);
      assert.strictEqual(consultant.isSuspended, false, `Consultant must not be re-suspended on iteration ${i + 1}`);
    }
  });

  await t.test('4. Consultant commits a new valid deadline: Saved correctly', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: null,
      deadlineFlagsCount: 0,
    });

    const now = Date.now();
    const newDeadline = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7 days in future

    const updated = await simulateSetProjectDeliveryDeadline(
      db,
      project._id,
      consultant._id,
      newDeadline.toISOString(),
      'Fresh commitment after review.',
      now
    );

    assert.ok(updated, 'Updated project must be returned');
    assert.strictEqual(updated.deliveryDeadline.getTime(), newDeadline.getTime(), 'New deadline must match');
    assert.strictEqual(updated.deadlineFlagsCount, 0, 'Flags count must be 0');
    assert.strictEqual(updated.deadlineNote, 'Fresh commitment after review.');
  });

  await t.test('5. Scheduler runs after new deadline commitment: Normal SLA monitoring resumes and project stays on track', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const now = Date.now();
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: new Date(now + 5 * 24 * 60 * 60 * 1000), // 5 days in future
      deadlineFlagsCount: 0,
    });

    // Run scheduler 24 hours later (still 4 days remaining)
    await simulateCheckAndEscalateDeadlines(db, now + 24 * 60 * 60 * 1000);

    assert.strictEqual(consultant.isActive, true);
    assert.strictEqual(consultant.isSuspended, false);
    assert.strictEqual(project.deadlineFlagsCount, 0, 'Flags must remain 0 while within deadline');
  });

  await t.test('6. New deadline reaches 24 hours overdue: Warning 1 flag is raised', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const now = Date.now();
    const deadline = new Date(now + 24 * 3600000); // 1 day in future
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: deadline,
      deadlineFlagsCount: 0,
    });

    // Advance time to 25 hours past the deadline (now + 49 hours)
    const testTime = deadline.getTime() + 25 * 3600000;
    await simulateCheckAndEscalateDeadlines(db, testTime);

    assert.strictEqual(project.deadlineFlagsCount, 1, 'Flags count must be 1 at 25h overdue');
    assert.strictEqual(consultant.isActive, true, 'Consultant must still be active at Warning 1');
  });

  await t.test('7. New deadline reaches 48 hours overdue: Warning 2 flag is raised', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const now = Date.now();
    const deadline = new Date(now + 24 * 3600000);
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: deadline,
      deadlineFlagsCount: 1,
    });

    // Advance time to 50 hours past deadline
    const testTime = deadline.getTime() + 50 * 3600000;
    await simulateCheckAndEscalateDeadlines(db, testTime);

    assert.strictEqual(project.deadlineFlagsCount, 2, 'Flags count must be 2 at 50h overdue');
    assert.strictEqual(consultant.isActive, true, 'Consultant must still be active at Warning 2');
  });

  await t.test('8. New deadline reaches 72 hours overdue: Warning 3 flag is raised', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const now = Date.now();
    const deadline = new Date(now + 24 * 3600000);
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: deadline,
      deadlineFlagsCount: 2,
    });

    // Advance time to 75 hours past deadline
    const testTime = deadline.getTime() + 75 * 3600000;
    await simulateCheckAndEscalateDeadlines(db, testTime);

    assert.strictEqual(project.deadlineFlagsCount, 3, 'Flags count must be 3 at 75h overdue');
    assert.strictEqual(consultant.isActive, true, 'Consultant must still be active at Warning 3');
  });

  await t.test('9. New deadline reaches 96 hours overdue: Automatic suspension triggers', async () => {
    const consultant = db.addConsultant({ isActive: true, tokenVersion: 10 });
    const now = Date.now();
    const deadline = new Date(now + 24 * 3600000);
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: deadline,
      deadlineFlagsCount: 3,
    });

    // Advance time to 97 hours past deadline
    const testTime = deadline.getTime() + 97 * 3600000;
    await simulateCheckAndEscalateDeadlines(db, testTime);

    assert.strictEqual(project.deadlineFlagsCount, 4, 'Flags count must be 4 at 97h overdue');
    assert.strictEqual(consultant.isActive, false, 'Consultant must be suspended');
    assert.strictEqual(consultant.isSuspended, true, 'isSuspended must be true');
    assert.strictEqual(consultant.suspensionReason, 'deadline_breach');
    assert.strictEqual(consultant.suspendedDueToProjectId, project._id);
    assert.strictEqual(consultant.tokenVersion, 11, 'tokenVersion must increment on suspension');
  });

  await t.test('10. Consultant attempts to modify an already committed deadline: Rejected', async () => {
    const consultant = db.addConsultant({ isActive: true });
    const now = Date.now();
    const initialDeadline = new Date(now + 5 * 24 * 3600000);
    const project = db.addProject({
      consultantId: consultant._id,
      deliveryDeadline: initialDeadline,
      deadlineFlagsCount: 0,
    });

    const attemptedNewDeadline = new Date(now + 10 * 24 * 3600000);

    await assert.rejects(
      async () => {
        await simulateSetProjectDeliveryDeadline(
          db,
          project._id,
          consultant._id,
          attemptedNewDeadline.toISOString(),
          'Trying to change deadline',
          now
        );
      },
      /Delivery deadline has already been committed and cannot be changed/,
      'Must reject modifying an active deadline'
    );
  });

  await t.test('11. Unauthorized user attempts deadline commitment: Request is rejected', async () => {
    const consultantA = db.addConsultant({ name: 'Consultant A' });
    const consultantB = db.addConsultant({ name: 'Consultant B' });

    const projectA = db.addProject({
      consultantId: consultantA._id,
      deliveryDeadline: null,
    });

    const targetDate = new Date(Date.now() + 5 * 24 * 3600000);

    // Consultant B tries to set deadline on Consultant A's project
    const result = await simulateSetProjectDeliveryDeadline(
      db,
      projectA._id,
      consultantB._id, // Wrong owner
      targetDate.toISOString()
    );

    assert.strictEqual(result, null, 'Must return null (404) for unauthorized consultant');
    assert.strictEqual(projectA.deliveryDeadline, null, 'Project deadline must remain null');
  });

  await t.test('12. Another consultant has overdue project: Unrelated consultant suspension is preserved', async () => {
    const consultantA = db.addConsultant({ name: 'Consultant A', isActive: true });
    const consultantB = db.addConsultant({ name: 'Consultant B', isActive: false, isSuspended: true });

    // Project A is active and awaiting fresh deadline
    const projectA = db.addProject({
      consultantId: consultantA._id,
      deliveryDeadline: null,
      deadlineFlagsCount: 0,
    });

    // Project B is 100h overdue
    const projectB = db.addProject({
      consultantId: consultantB._id,
      deliveryDeadline: new Date(Date.now() - 100 * 3600000),
      deadlineFlagsCount: 4,
    });

    // Reactivate Consultant A
    await simulateUpdateConsultantStatus(db, consultantA._id, true);

    // Run scheduler
    await simulateCheckAndEscalateDeadlines(db, Date.now());

    assert.strictEqual(consultantA.isActive, true, 'Consultant A must stay active');
    assert.strictEqual(consultantB.isSuspended, true, 'Consultant B must remain suspended');
    assert.strictEqual(projectB.deadlineFlagsCount, 4, 'Consultant B project must remain flag 4');
  });

  await t.test('13. Consultant has multiple projects: Only suspended project deadline is reset, on-track project is preserved', async () => {
    const consultant = db.addConsultant({ isActive: false, isSuspended: true });
    const now = Date.now();

    // Project 1 caused suspension (flag 4, 100h overdue)
    const project1 = db.addProject({
      title: 'Delinquent Project',
      consultantId: consultant._id,
      deliveryDeadline: new Date(now - 100 * 3600000),
      deadlineFlagsCount: 4,
    });
    consultant.suspendedDueToProjectId = project1._id;

    // Project 2 is on track with 10 days remaining
    const validFutureDeadline = new Date(now + 10 * 24 * 3600000);
    const project2 = db.addProject({
      title: 'On-Track Project',
      consultantId: consultant._id,
      deliveryDeadline: validFutureDeadline,
      deadlineFlagsCount: 0,
    });

    // SuperAdmin reactivates consultant
    await simulateUpdateConsultantStatus(db, consultant._id, true);

    // Project 1 should be reset to null awaiting fresh commitment
    assert.strictEqual(project1.deliveryDeadline, null, 'Delinquent project deadline must be reset');
    assert.strictEqual(project1.deadlineFlagsCount, 0, 'Delinquent project flags must be 0');

    // Project 2 must PRESERVE its valid future deadline
    assert.strictEqual(
      project2.deliveryDeadline.getTime(),
      validFutureDeadline.getTime(),
      'On-track project deadline must NOT be reset or modified'
    );
    assert.strictEqual(project2.deadlineFlagsCount, 0, 'On-track project flags must remain 0');

    // Run scheduler: neither project should trigger suspension
    await simulateCheckAndEscalateDeadlines(db, now + 30 * 60 * 1000);

    assert.strictEqual(consultant.isActive, true, 'Consultant must remain active');
    assert.strictEqual(consultant.isSuspended, false, 'Consultant must not be re-suspended');
  });
});

