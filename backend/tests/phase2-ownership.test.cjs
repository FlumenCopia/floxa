'use strict';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestFixtures,
  models,
} = require('./helpers.cjs');

const { Moodboard } = models;

test('Phase 2: Project & Resource Ownership IDOR Protection', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();

  // Create two distinct consultants and projects
  const fixturesA = await createTestFixtures();
  const fixturesB = await createTestFixtures();

  const tokenA = createTestToken(fixturesA.consultant._id.toString(), fixturesA.consultant.email);
  const tokenB = createTestToken(fixturesB.consultant._id.toString(), fixturesB.consultant.email);

  // Create a moodboard under Project A
  const moodboardA = await Moodboard.create({
    projectId: fixturesA.project._id,
    title: 'Moodboard Project A',
    image: '/uploads/moodboards/test.jpg',
  });

  t.after(async () => {
    await Moodboard.deleteOne({ _id: moodboardA._id });
    await fixturesA.cleanup();
    await fixturesB.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('2.1 Owner consultant can access owned project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${fixturesA.project._id}/`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    assert.strictEqual(res.status, 200, `Expected 200 for owned project, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.id, fixturesA.project._id.toString());
  });

  await t.test('2.2 Cross-consultant project access returns safe 404 without disclosure', async () => {
    // Consultant B tries to access Project A
    const res = await fetch(`${baseUrl}/api/projects/${fixturesA.project._id}/`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    assert.strictEqual(res.status, 404, `Expected 404 for cross-consultant access, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.detail, 'Expected safe detail message');
  });

  await t.test('2.3 Parent project and child resource IDs must match', async () => {
    // Consultant B tries to update Moodboard A under Project B (mismatch)
    const res = await fetch(`${baseUrl}/api/projects/${fixturesB.project._id}/moodboard/${moodboardA._id}/`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ title: 'Hacked Title' }),
    });

    assert.strictEqual(res.status, 404, `Expected 404 for mismatched child resource, got ${res.status}`);
    // Confirm Moodboard A was not modified
    const check = await Moodboard.findById(moodboardA._id);
    assert.strictEqual(check.title, 'Moodboard Project A', 'Resource should remain unmodified');
  });

  await t.test('2.4 Invalid ObjectIds return controlled 404 error without stack trace', async () => {
    const res = await fetch(`${baseUrl}/api/projects/invalid-malformed-object-id/`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    assert.strictEqual(res.status, 404, `Expected 404 for invalid ObjectId, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.detail && body.detail.startsWith('Project not found'), `Expected 'Project not found', got '${body.detail}'`);
    assert.strictEqual(body.stack, undefined, 'Stack trace must not be exposed');
  });

  await t.test('2.5 Request-provided consultant ID cannot override JWT identity', async () => {
    // Consultant A creates a project with consultant_id pointing to Consultant B
    const res = await fetch(`${baseUrl}/api/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        title: 'Tamper Consultant ID Project',
        client_name: 'Test Client',
        client_email: 'test@client.com',
        company_name: 'Test Co',
        sector: 'Technology',
        consultant_id: fixturesB.consultant._id.toString(), // Attacker tries to impersonate B
      }),
    });

    assert.strictEqual(res.status, 201, `Expected 201 created, got ${res.status}`);
    const body = await res.json();
    const projectId = body.id || body.project?.id;
    assert.ok(projectId, 'Project ID must exist in response');

    // Verify consultantId in DB is Consultant A (from JWT), NOT Consultant B
    const createdProject = await models.Project.findById(projectId);
    assert.strictEqual(
      createdProject.consultantId.toString(),
      fixturesA.consultant._id.toString(),
      'Project must belong to authenticated JWT consultant'
    );

    // Cleanup created project and client
    if (projectId) {
      await models.Project.deleteOne({ _id: projectId });
      if (createdProject.clientId) {
        await models.Client.deleteOne({ _id: createdProject.clientId });
      }
    }
  });
});
