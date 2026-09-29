'use strict';

const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestFixtures,
  models,
} = require('./helpers.cjs');

test('FLOXA B2B SaaS Customer Credential Provisioning & Authentication Verification', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();
  const fixtures = await createTestFixtures();

  const testEmail = `b2b_checkpoint_${Date.now()}@example.com`;
  const rawPassword = 'TempPassword2026!#';
  const newPassword = 'ResetPassword2026!@#';
  let createdConsultantId = null;

  t.after(async () => {
    if (createdConsultantId) {
      await models.Consultant.deleteOne({ _id: createdConsultantId });
    }
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('1. SuperAdmin creates B2B customer (schema compatibility & normalization)', async () => {
    const normalizedEmail = testEmail.trim().toLowerCase();
    const existing = await models.Consultant.findOne({ email: normalizedEmail });
    assert.strictEqual(existing, null, 'Customer should not already exist');

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const consultant = await models.Consultant.create({
      name: 'Acme Agency CEO',
      email: normalizedEmail,
      password: hashedPassword,
      company: 'Acme Digital Agency',
      phone: '+1-555-0199',
      isActive: true,
      isStaff: false,
      subscription: {
        plan: 'starter',
        status: 'active',
        maxProjects: 10,
      },
      aiUsage: {
        totalTokensUsed: 0,
        monthlyLimit: 500000,
      },
    });

    assert.ok(consultant._id, 'Consultant should be created with an _id');
    createdConsultantId = consultant._id;

    // Verify DB state
    const doc = await models.Consultant.findById(consultant._id);
    assert.strictEqual(doc.email, normalizedEmail);
    assert.strictEqual(doc.isActive, true);
    assert.ok(doc.password.startsWith('$2a$') || doc.password.startsWith('$2b$'), 'Password must be bcrypt hash');
    assert.strictEqual(doc.subscription?.plan, 'starter');
    assert.strictEqual(doc.subscription?.maxProjects, 10);
  });

  let authCookies = '';
  let csrfToken = '';
  let accessToken = '';
  let refreshTokenVal = '';

  await t.test('2. B2B Customer logs in via backend POST /api/auth/login/', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail.toUpperCase(), // Test case-insensitivity
        password: rawPassword,
      }),
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK login, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.access, 'Should return access token');
    assert.ok(body.refresh, 'Should return refresh token');
    assert.strictEqual(body.consultant?.email, testEmail.toLowerCase());
    assert.strictEqual(body.consultant?.name, 'Acme Agency CEO');

    accessToken = body.access;
    refreshTokenVal = body.refresh;

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    assert.ok(setCookies.length > 0, 'Should set auth cookies');
    
    authCookies = setCookies.map(c => c.split(';')[0]).join('; ');
    assert.ok(authCookies.includes('floxa_access'), 'Cookie header should include floxa_access');

    for (const c of setCookies) {
      if (c.startsWith('csrftoken=')) {
        csrfToken = c.split(';')[0].split('=')[1];
      }
    }
  });

  await t.test('3. B2B Customer accesses protected GET /api/auth/me/', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'GET',
      headers: {
        'Cookie': authCookies,
      },
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK for /auth/me/, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.email, testEmail.toLowerCase());
    assert.strictEqual(body.name, 'Acme Agency CEO');
    assert.strictEqual(body.company, 'Acme Digital Agency');
    assert.strictEqual(body.subscription?.plan, 'starter');
  });

  await t.test('4. Token refresh endpoint works via POST /api/auth/token/refresh/', async () => {
    const res = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh: refreshTokenVal,
      }),
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK for token refresh, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.detail, 'Token refreshed successfully.');
  });

  await t.test('5. SuperAdmin resets customer password and old password is rejected', async () => {
    // Reset password in DB matching resetConsultantPassword controller
    const newHash = await bcrypt.hash(newPassword, 10);
    await models.Consultant.updateOne({ _id: createdConsultantId }, { password: newHash });

    // Attempt login with old password
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: rawPassword,
      }),
    });
    assert.strictEqual(oldLoginRes.status, 400, 'Old password must be rejected');

    // Attempt login with newly assigned password
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: newPassword,
      }),
    });
    assert.strictEqual(newLoginRes.status, 200, 'New password must be accepted');
    const newBody = await newLoginRes.json();
    assert.strictEqual(newBody.consultant?.email, testEmail.toLowerCase());
  });

  await t.test('6. Removed public registration endpoint POST /api/auth/register/ returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Hacker Self-Register',
        email: 'hacker@example.com',
        password: 'password12345',
      }),
    });

    assert.strictEqual(res.status, 404, `Public registration must return 404 Not Found, got ${res.status}`);
  });

  await t.test('7. Removed Google OAuth endpoint POST /api/auth/google/ returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credential: 'fake_google_jwt_token',
      }),
    });

    assert.strictEqual(res.status, 404, `Google OAuth endpoint must return 404 Not Found, got ${res.status}`);
  });

  await t.test('8. B2C Client Portal routes remain 100% operational (strict isolation check)', async () => {
    const res = await fetch(`${baseUrl}/api/client-portal/${fixtures.project.portalToken}/`, {
      method: 'GET',
    });

    assert.strictEqual(res.status, 200, `B2C Client Portal must return 200 OK, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.project || body.id || body.title, 'B2C Client Portal payload must remain valid');
  });
});
