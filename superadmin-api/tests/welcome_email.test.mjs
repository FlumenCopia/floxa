import test from 'node:test';
import assert from 'node:assert';
import {
  sendCustomerWelcomeEmail,
  sendPasswordResetNoticeEmail,
  setTestEmailDispatcher,
} from '../dist/services/email.service.js';

test('SuperAdmin Welcome & Password Notification Email Service', async (t) => {
  let capturedEmails = [];

  t.beforeEach(() => {
    capturedEmails = [];
    setTestEmailDispatcher(async (mail) => {
      capturedEmails.push(mail);
    });
  });

  t.afterEach(() => {
    setTestEmailDispatcher(null);
  });

  await t.test('1. sendCustomerWelcomeEmail formats credentials and login link properly', async () => {
    const result = await sendCustomerWelcomeEmail({
      name: 'Alice Johnson',
      email: 'alice@agency.com',
      rawPassword: 'TempSecretPassword2026!#',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedEmails.length, 1);

    const email = capturedEmails[0];
    assert.strictEqual(email.to, 'alice@agency.com');
    assert.ok(email.subject.includes('Welcome to FLOXA'));
    assert.ok(email.text.includes('alice@agency.com'));
    assert.ok(email.text.includes('TempSecretPassword2026!#'));
    assert.ok(email.text.includes('/login'));

    // HTML checks
    assert.ok(email.html.includes('alice@agency.com'));
    assert.ok(email.html.includes('TempSecretPassword2026!#'));
    assert.ok(email.html.includes('Sign In to Your Account'));
  });

  await t.test('2. sendPasswordResetNoticeEmail formats new password properly', async () => {
    const result = await sendPasswordResetNoticeEmail({
      name: 'Bob Smith',
      email: 'bob@agency.com',
      rawPassword: 'NewAssignedPassword999!',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(capturedEmails.length, 1);

    const email = capturedEmails[0];
    assert.strictEqual(email.to, 'bob@agency.com');
    assert.ok(email.subject.includes('Password Updated'));
    assert.ok(email.text.includes('bob@agency.com'));
    assert.ok(email.text.includes('NewAssignedPassword999!'));
    assert.ok(email.html.includes('NewAssignedPassword999!'));
  });

  await t.test('3. Handles missing SMTP gracefully when no dispatcher is set', async () => {
    setTestEmailDispatcher(null);

    const origUser = process.env.EMAIL_HOST_USER;
    const origPass = process.env.EMAIL_HOST_PASSWORD;
    process.env.EMAIL_HOST_USER = '';
    process.env.EMAIL_HOST_PASSWORD = '';

    try {
      const result = await sendCustomerWelcomeEmail({
        name: 'Charlie Test',
        email: 'charlie@test.com',
        rawPassword: 'Password123!',
      });

      // Must not throw an unhandled exception
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not configured'));
    } finally {
      if (origUser) process.env.EMAIL_HOST_USER = origUser;
      if (origPass) process.env.EMAIL_HOST_PASSWORD = origPass;
    }
  });
});
