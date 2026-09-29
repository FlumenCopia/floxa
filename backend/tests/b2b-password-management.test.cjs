'use strict';

const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestFixtures,
  models,
} = require('./helpers.cjs');

// Import email service dispatcher helper from compiled dist
const emailService = require('../dist/services/email.service.js');

test('FLOXA Phase 5: B2B Customer Password Management Verification', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();
  const fixtures = await createTestFixtures();

  let capturedEmails = [];
  emailService.setTestEmailDispatcher(async (mail) => {
    capturedEmails.push(mail);
  });

  const testEmail = `b2b_pwd_test_${Date.now()}@example.com`;
  const initialPassword = 'InitialPassword2026!';
  const changedPassword = 'ChangedPassword2026!';
  const resetPasswordVal = 'ResetPassword2026!#$';
  let createdConsultantId = null;

  t.after(async () => {
    emailService.setTestEmailDispatcher(null);
    if (createdConsultantId) {
      await models.Consultant.deleteOne({ _id: createdConsultantId });
    }
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  // Setup initial consultant
  await t.test('0. Setup test consultant in database', async () => {
    const hashedPassword = await bcrypt.hash(initialPassword, 10);
    const consultant = await models.Consultant.create({
      name: 'Test Customer CEO',
      email: testEmail.toLowerCase(),
      password: hashedPassword,
      company: 'Test Agency Co',
      phone: '+1-555-0987',
      isActive: true,
      tokenVersion: 0,
    });
    assert.ok(consultant._id);
    createdConsultantId = consultant._id;
  });

  let initialAccessToken = '';
  let initialRefreshToken = '';
  let initialCookieHeader = '';

  await t.test('1. Customer logs in with initial password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: initialPassword }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.access);
    assert.ok(body.refresh);
    assert.strictEqual(body.password, undefined, 'Password should never be returned');
    assert.strictEqual(body.consultant?.password, undefined, 'Password hash should never be returned');

    initialAccessToken = body.access;
    initialRefreshToken = body.refresh;

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    initialCookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
  });

  // --- 2. CHANGE PASSWORD TESTS ---
  await t.test('2. Change Password Validations', async (t2) => {
    await t2.test('2.1 Rejects when fields are missing', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({ currentPassword: '' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('required'));
    });

    await t2.test('2.2 Rejects short new password (< 8 chars)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: 'short',
          confirmPassword: 'short',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('8 characters'));
    });

    await t2.test('2.3 Rejects confirmation mismatch', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: changedPassword,
          confirmPassword: 'DifferentPassword123!',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('match'));
    });

    await t2.test('2.4 Rejects incorrect current password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({
          currentPassword: 'WrongPassword999!',
          newPassword: changedPassword,
          confirmPassword: changedPassword,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('incorrect'));
    });

    await t2.test('2.5 Rejects identical old and new password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: initialPassword,
          confirmPassword: initialPassword,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('cannot be the same'));
    });

    await t2.test('2.6 Successfully changes password with valid inputs', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${initialAccessToken}`,
        },
        body: JSON.stringify({
          currentPassword: initialPassword,
          newPassword: changedPassword,
          confirmPassword: changedPassword,
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.detail, 'Password changed successfully.');
      assert.strictEqual(data.password, undefined);
    });

    await t2.test('2.7 Old password rejected on login after change', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: initialPassword }),
      });
      assert.strictEqual(res.status, 400);
    });

    await t2.test('2.8 New password accepted on login after change', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: changedPassword }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.access);
    });

    await t2.test('2.9 Previous access token (with old tokenVersion) rejected by requireAuth', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me/`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${initialAccessToken}`,
        },
      });
      assert.strictEqual(res.status, 401, 'Old access token should be revoked');
    });

    await t2.test('2.10 Previous refresh token (with old tokenVersion) rejected by /token/refresh/', async () => {
      const res = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: initialRefreshToken }),
      });
      assert.strictEqual(res.status, 401, 'Old refresh token should be revoked');
    });
  });

  // --- 3. FORGOT PASSWORD & ENUMERATION TESTS ---
  let extractedRawToken = '';

  await t.test('3. Forgot Password Flow & Enumeration Protection', async (t3) => {
    capturedEmails = [];

    await t3.test('3.1 Rejects empty email with 400', async () => {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' }),
      });
      assert.strictEqual(res.status, 400);
    });

    await t3.test('3.2 Unknown email returns uniform generic success response without dispatching email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent_user_9999@unknown-domain.com' }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.detail, 'If an account exists for this email, a password reset link has been sent.');
      assert.strictEqual(capturedEmails.length, 0, 'No email should be dispatched for unknown user');
    });

    await t3.test('3.3 Valid email returns identical generic response and sends reset email', async () => {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail.toUpperCase() }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.detail, 'If an account exists for this email, a password reset link has been sent.');

      assert.strictEqual(capturedEmails.length, 1, 'Should dispatch 1 reset email');
      const email = capturedEmails[0];
      assert.strictEqual(email.to, testEmail.toLowerCase());
      assert.ok(email.subject.includes('Reset'));

      // Extract raw token from reset URL
      const match = email.text.match(/token=([a-f0-9]+)/i);
      assert.ok(match && match[1], 'Reset email must contain token');
      extractedRawToken = match[1];
    });

    await t3.test('3.4 Token security: DB stores hash of token, not the raw token', async () => {
      const doc = await models.Consultant.findById(createdConsultantId);
      assert.ok(doc.passwordResetToken);
      assert.notStrictEqual(doc.passwordResetToken, extractedRawToken, 'Raw token must never be stored in DB');

      // Verify SHA-256 match
      const expectedHash = crypto.createHash('sha256').update(extractedRawToken).digest('hex');
      assert.strictEqual(doc.passwordResetToken, expectedHash, 'DB token must be sha256 hash of raw token');

      // Verify expiration is ~30 minutes in future
      const now = Date.now();
      const expires = new Date(doc.passwordResetExpires).getTime();
      assert.ok(expires > now + 25 * 60 * 1000, 'Expiration should be ~30 minutes in future');
      assert.ok(expires <= now + 31 * 60 * 1000);
    });
  });

  // --- 4. RESET PASSWORD TESTS ---
  await t.test('4. Reset Password Validations & Completion', async (t4) => {
    await t4.test('4.1 Rejects invalid reset token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid_raw_token_that_does_not_exist',
          newPassword: resetPasswordVal,
          confirmPassword: resetPasswordVal,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('invalid or has expired'));
    });

    await t4.test('4.2 Rejects expired reset token', async () => {
      // Artificially expire the token in DB
      await models.Consultant.findByIdAndUpdate(createdConsultantId, {
        passwordResetExpires: new Date(Date.now() - 60 * 1000), // 1 minute in the past
      });

      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: extractedRawToken,
          newPassword: resetPasswordVal,
          confirmPassword: resetPasswordVal,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('invalid or has expired'));

      // Restore expiration for remaining tests
      await models.Consultant.findByIdAndUpdate(createdConsultantId, {
        passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
      });
    });

    await t4.test('4.3 Rejects password mismatch during reset', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: extractedRawToken,
          newPassword: resetPasswordVal,
          confirmPassword: 'MismatchPassword999!',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('match'));
    });

    await t4.test('4.4 Rejects password same as current during reset', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: extractedRawToken,
          newPassword: changedPassword, // Currently active password
          confirmPassword: changedPassword,
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('cannot be the same'));
    });

    await t4.test('4.5 Successfully resets password with valid token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: extractedRawToken,
          newPassword: resetPasswordVal,
          confirmPassword: resetPasswordVal,
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.detail.includes('successfully'));

      // Verify token invalidated in DB (single-use check)
      const doc = await models.Consultant.findById(createdConsultantId);
      assert.strictEqual(doc.passwordResetToken, null, 'Reset token must be wiped after use');
      assert.strictEqual(doc.passwordResetExpires, null, 'Reset expiry must be wiped after use');
    });

    await t4.test('4.6 Rejects reused token (single-use guarantee)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: extractedRawToken,
          newPassword: 'AnotherPassword999!',
          confirmPassword: 'AnotherPassword999!',
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.detail.includes('invalid or has expired'));
    });

    await t4.test('4.7 Old password rejected on login after reset', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: changedPassword }),
      });
      assert.strictEqual(res.status, 400);
    });

    await t4.test('4.8 New reset password accepted on login', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: resetPasswordVal }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.access);
      assert.ok(body.refresh);
    });
  });

  // --- 5. B2C CLIENT PORTAL ISOLATION CHECK ---
  await t.test('5. B2C Client Portal routes remain 100% operational (strict isolation)', async () => {
    const portalRes = await fetch(`${baseUrl}/api/client-portal/${fixtures.project.portalToken}/`, {
      method: 'GET',
    });
    assert.strictEqual(portalRes.status, 200, 'B2C client portal lookup must remain unaffected');
    const portalData = await portalRes.json();
    assert.ok(portalData.project || portalData.id || portalData.title, 'B2C Client Portal payload must remain valid');
  });
});
