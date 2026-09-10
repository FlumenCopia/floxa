'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestPortalToken,
  createTestFixtures,
  WebSocket,
} = require('./helpers.cjs');

test('Phase 1: WebSocket Authentication & Client-Only Protection', async (t) => {
  await connectTestDatabase();
  const { baseUrl, wsUrl } = await startTestServer();
  const fixtures = await createTestFixtures();

  const validToken = createTestToken(fixtures.consultant._id.toString(), fixtures.consultant.email, { expiresIn: '1h' });
  const expiredToken = createTestToken(fixtures.consultant._id.toString(), fixtures.consultant.email, { expiresIn: '-10s' });
  const validPortalToken = createTestPortalToken(fixtures.project.portalToken);

  t.after(async () => {
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('1.1 Consultant WebSocket rejects missing token', async () => {
    const ws = new WebSocket(`${wsUrl}/ws/support/consultant/`);
    const code = await new Promise((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode));
      ws.on('error', () => {});
    });
    assert.ok(code === 4001 || code === 4003 || code === 1008, `Expected auth rejection close code, got ${code}`);
  });

  await t.test('1.2 Consultant WebSocket rejects invalid JWT token', async () => {
    const ws = new WebSocket(`${wsUrl}/ws/support/consultant/?token=invalid_forged_token`);
    const code = await new Promise((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode));
      ws.on('error', () => {});
    });
    assert.ok(code === 4001 || code === 4003 || code === 1008, `Expected auth rejection code, got ${code}`);
  });

  await t.test('1.3 Consultant WebSocket rejects expired JWT token', async () => {
    const ws = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${expiredToken}`);
    const code = await new Promise((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode));
      ws.on('error', () => {});
    });
    assert.ok(code === 4001 || code === 4003 || code === 1008, `Expected auth rejection code for expired token, got ${code}`);
  });

  await t.test('1.4 Consultant WebSocket accepts valid JWT token', async () => {
    const ws = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${validToken}`);
    const opened = await new Promise((resolve) => {
      ws.on('open', () => resolve(true));
      ws.on('close', () => resolve(false));
      ws.on('error', () => resolve(false));
    });
    assert.strictEqual(opened, true, 'WebSocket should successfully open for valid JWT');
    ws.close();
  });

  await t.test('1.5 Consultant identity bound to JWT, spoofing consultant_id rejected', async () => {
    const fakeOtherId = new (require('mongoose').Types.ObjectId)().toString();
    const ws = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${validToken}&consultant_id=${fakeOtherId}`);
    const code = await new Promise((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode));
      ws.on('error', () => {});
    });
    assert.ok(code === 4001 || code === 4003, `Expected rejected close code when spoofing ID, got ${code}`);
  });

  await t.test('1.6 Consultant support mode cannot perform client-only signing action', async () => {
    const res = await fetch(`${baseUrl}/api/client-portal/${fixtures.project.portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`,
        'x-support-mode': 'true',
        'x-consultant-support': fixtures.consultant._id.toString(),
      },
      body: JSON.stringify({ signature: 'Test Signature' }),
    });

    assert.strictEqual(res.status, 403, `Expected 403 for support mode client action, got ${res.status}`);
    const body = await res.json();
    assert.ok(
      body.detail && (body.detail.includes('reserved for the client') || body.detail.includes('consultant support mode')),
      `Expected client-only message, got ${JSON.stringify(body)}`
    );
  });

  await t.test('1.7 Verified clients remain allowed to access portal', async () => {
    const res = await fetch(`${baseUrl}/api/client-portal/${fixtures.project.portalToken}/`, {
      method: 'GET',
    });

    assert.strictEqual(res.status, 200, `Expected 200 for valid client portal route, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.project || body.id || body.title, `Expected project payload, got ${JSON.stringify(body)}`);
  });
});
