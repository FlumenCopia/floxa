'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestPortalToken,
  createTestFixtures,
  models,
  JWT_SECRET,
  ENV,
  WebSocket,
} = require('./helpers.cjs');

const { disconnectConsultantSockets } = require('../dist/websocket/socketServer.js');
const { completePaymentMilestone } = require('../dist/services/payment.service.js');
const {
  isProjectAwaitingClientAction,
  checkAndEscalateDeadlines,
} = require('../dist/services/deadlineMonitoring.service.js');
const { serializeConsultant } = require('../dist/utils/serializer.js');
const { encryptSecret, decryptSecret } = require('../dist/utils/crypto.js');
const { clearRateLimitStore } = require('../dist/middleware/rateLimit.middleware.js');

function parseCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const firstPart = String(header || '').split(';')[0];
    const idx = firstPart.indexOf('=');
    if (idx > 0) {
      cookies[firstPart.slice(0, idx).trim()] = decodeURIComponent(firstPart.slice(idx + 1).trim());
    }
  }
  return cookies;
}

test('Security & Functional Audit Regression Suite', async (t) => {
  await connectTestDatabase();
  const { baseUrl, wsUrl } = await startTestServer();
  const fixtures = await createTestFixtures();

  const cleanupHooks = [];

  t.after(async () => {
    for (const fn of cleanupHooks.reverse()) {
      try {
        await fn();
      } catch (_) {}
    }
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  // =========================================================================
  // AUTH-01 & AUTH-02 & AUTH-09: WS Portal Password Gate, Suspension, RoleSpoof
  // =========================================================================
  await t.test('AUTH-01: WS /ws/support/:portal_token enforces portalPasswordHash and rejects mismatched/missing token', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const pwHash = await bcrypt.hash('SecretPortal123!', 10);
    const protectedProject = await models.Project.create({
      title: `Protected Portal ${rand}`,
      companyName: 'Protected Inc',
      sector: 'Security',
      status: 'discovery',
      consultantId: fixtures.consultant._id,
      clientId: fixtures.client._id,
      portalToken: `prot_ws_${rand}_${Date.now()}`,
      portalPasswordHash: pwHash,
      progress: 10,
    });
    const otherProject = await models.Project.create({
      title: `Other Portal ${rand}`,
      companyName: 'Other Inc',
      sector: 'Security',
      status: 'discovery',
      consultantId: fixtures.consultant._id,
      clientId: fixtures.client._id,
      portalToken: `other_ws_${rand}_${Date.now()}`,
      portalPasswordHash: pwHash,
      progress: 10,
    });

    cleanupHooks.push(async () => {
      await models.Project.deleteOne({ _id: protectedProject._id });
      await models.Project.deleteOne({ _id: otherProject._id });
    });

    // 1) Missing portal_access_token -> 4003
    const wsNoAccess = new WebSocket(`${wsUrl}/ws/support/${protectedProject.portalToken}/`);
    const code1 = await new Promise((resolve) => {
      wsNoAccess.on('close', (c) => resolve(c));
      wsNoAccess.on('error', () => {});
    });
    assert.strictEqual(code1, 4003, `Expected 4003 when portal access token missing, got ${code1}`);

    // 2) Cross-project valid portal_access_token -> 4003
    const otherAccess = createTestPortalToken(otherProject.portalToken);
    const wsWrongProj = new WebSocket(
      `${wsUrl}/ws/support/${protectedProject.portalToken}/?portal_access_token=${encodeURIComponent(otherAccess)}`
    );
    const code2 = await new Promise((resolve) => {
      wsWrongProj.on('close', (c) => resolve(c));
      wsWrongProj.on('error', () => {});
    });
    assert.strictEqual(code2, 4003, `Expected 4003 on cross-project access token, got ${code2}`);

    // 3) Correct portal_access_token -> connects cleanly
    const goodAccess = createTestPortalToken(protectedProject.portalToken);
    const wsGood = new WebSocket(
      `${wsUrl}/ws/support/${protectedProject.portalToken}/?portal_access_token=${encodeURIComponent(goodAccess)}`
    );
    await new Promise((resolve, reject) => {
      wsGood.on('open', resolve);
      wsGood.on('error', reject);
      wsGood.on('close', (c) => reject(new Error(`Unexpected close ${c}`)));
    });
    wsGood.close();
  });

  await t.test('AUTH-02: Suspended or tokenVersion-bumped consultant is rejected on HTTP, Support Mode, and WS', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const tempConsultant = await models.Consultant.create({
      email: `auth02_${rand}@floxa.local`,
      name: `Auth02 ${rand}`,
      password: await bcrypt.hash('TestPass123!', 10),
      isActive: true,
      isSuspended: false,
      tokenVersion: 1,
    });
    const tempProject = await models.Project.create({
      title: `Auth02 Proj ${rand}`,
      companyName: 'Auth02 Corp',
      sector: 'Tech',
      status: 'discovery',
      consultantId: tempConsultant._id,
      clientId: fixtures.client._id,
      portalToken: `auth02_portal_${rand}_${Date.now()}`,
      progress: 10,
    });

    cleanupHooks.push(async () => {
      await models.Project.deleteOne({ _id: tempProject._id });
      await models.Consultant.deleteOne({ _id: tempConsultant._id });
    });

    const staleToken = jwt.sign(
      { userId: tempConsultant._id.toString(), email: tempConsultant.email, tokenVersion: 1, tokenType: 'access' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Connect consultant WS while active
    const ws = new WebSocket(
      `${wsUrl}/ws/support/consultant/?token=${encodeURIComponent(staleToken)}&projectId=${tempProject._id.toString()}`
    );
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Suspend consultant + bump tokenVersion, then trigger disconnectConsultantSockets
    await models.Consultant.updateOne(
      { _id: tempConsultant._id },
      { $set: { isSuspended: true }, $inc: { tokenVersion: 1 } }
    );
    const wsClosedPromise = new Promise((resolve) => ws.on('close', (c) => resolve(c)));
    disconnectConsultantSockets(tempConsultant._id.toString());
    const closeCode = await wsClosedPromise;
    assert.strictEqual(closeCode, 4001);

    // HTTP requireAuth rejects suspended consultant
    const meRes = await fetch(`${baseUrl}/api/auth/me/`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert.ok(meRes.status === 401 || meRes.status === 403, `Expected 401/403, got ${meRes.status}`);

    // Support Mode with suspended consultant token fails closed (401/403)
    const supportRes = await fetch(
      `${baseUrl}/api/client-portal/${tempProject.portalToken}/?support=true`,
      {
        headers: {
          Authorization: `Bearer ${staleToken}`,
          'x-support-mode': 'true',
        },
      }
    );
    assert.ok(supportRes.status === 401 || supportRes.status === 403, `Expected 401/403 on Support Mode, got ${supportRes.status}`);

    // Reconnecting WS with stale/suspended token closes with 4001
    const ws2 = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${encodeURIComponent(staleToken)}`);
    const closeCode2 = await new Promise((resolve) => {
      ws2.on('close', (c) => resolve(c));
      ws2.on('error', () => {});
    });
    assert.strictEqual(closeCode2, 4001);
  });

  await t.test('AUTH-03: Refresh token returns rotated { access, refresh } and rejects access-type / alg:none tokens', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const email = `refresh_${rand}@floxa.local`;
    const password = 'ValidPassword123!';
    const consultant = await models.Consultant.create({
      email,
      name: `Refresh User ${rand}`,
      password: await bcrypt.hash(password, 10),
      isActive: true,
      tokenVersion: 0,
    });
    cleanupHooks.push(async () => {
      await models.Consultant.deleteOne({ _id: consultant._id });
    });

    clearRateLimitStore();
    const loginRes = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.access);
    assert.ok(loginData.refresh);

    // Try using access token against /token/refresh/ -> 401
    const wrongTypeRes = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: loginData.access }),
    });
    assert.strictEqual(wrongTypeRes.status, 401);

    // Forge alg:none JWT
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ userId: consultant._id.toString(), email, tokenVersion: 0, tokenType: 'refresh' })
    ).toString('base64url');
    const algNoneToken = `${header}.${payload}.`;
    const algNoneRes = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: algNoneToken }),
    });
    assert.strictEqual(algNoneRes.status, 401);

    // Valid refresh succeeds & returns both access and refresh
    const refreshRes = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: loginData.refresh }),
    });
    assert.strictEqual(refreshRes.status, 200);
    const refreshed = await refreshRes.json();
    assert.ok(refreshed.access);
    assert.ok(refreshed.refresh);
  });

  await t.test('AUTH-04: /auth/device-token/ rejects unauthenticated consultant registration and unverified password-portal clients', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const pwHash = await bcrypt.hash('PortalSecret99!', 10);
    const lockedProject = await models.Project.create({
      title: `DeviceToken Locked ${rand}`,
      companyName: 'DT Corp',
      sector: 'Tech',
      status: 'discovery',
      consultantId: fixtures.consultant._id,
      clientId: fixtures.client._id,
      portalToken: `dt_locked_${rand}_${Date.now()}`,
      portalPasswordHash: pwHash,
      progress: 10,
    });
    cleanupHooks.push(async () => {
      await models.DeviceToken.deleteMany({ projectId: lockedProject._id });
      await models.Project.deleteOne({ _id: lockedProject._id });
    });

    // Unauthenticated consultant device token -> 401
    const unauthConsultantRes = await fetch(`${baseUrl}/api/auth/device-token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: `ExponentPushToken[fake-${rand}]`,
        userRole: 'consultant',
        platform: 'android',
      }),
    });
    assert.strictEqual(unauthConsultantRes.status, 401);

    // Unverified password-protected client device token -> 403
    const unverifiedClientRes = await fetch(`${baseUrl}/api/auth/device-token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: `ExponentPushToken[client-${rand}]`,
        userRole: 'client',
        portalToken: lockedProject.portalToken,
        platform: 'ios',
      }),
    });
    assert.ok(
      unverifiedClientRes.status === 401 || unverifiedClientRes.status === 403,
      `Expected 401/403 for unverified client device-token registration, got ${unverifiedClientRes.status}`
    );
  });

  // =========================================================================
  // SEC-01: CSRF double-submit enforcement (x-client-portal-token & fake Bearer & refresh cookie)
  // =========================================================================
  await t.test('SEC-01: CSRF blocks cookie-auth requests claiming x-client-portal-token or invalid Bearer, and protects refresh cookie', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const email = `csrf_${rand}@floxa.local`;
    const password = 'CsrfPassword123!';
    const consultant = await models.Consultant.create({
      email,
      name: `CSRF ${rand}`,
      password: await bcrypt.hash(password, 10),
      isActive: true,
    });
    cleanupHooks.push(async () => {
      await models.Consultant.deleteOne({ _id: consultant._id });
    });

    clearRateLimitStore();
    const loginRes = await fetch(`${baseUrl}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.strictEqual(loginRes.status, 200);
    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    const cookieMap = parseCookies(setCookies);
    const accessCookie = cookieMap[ENV.AUTH_ACCESS_COOKIE_NAME];
    const refreshCookie = cookieMap[ENV.AUTH_REFRESH_COOKIE_NAME];
    assert.ok(accessCookie);
    assert.ok(refreshCookie);

    const cookieHeader = `${ENV.AUTH_ACCESS_COOKIE_NAME}=${accessCookie}; ${ENV.AUTH_REFRESH_COOKIE_NAME}=${refreshCookie}`;

    // 1) POST /api/projects/ with access cookie + x-client-portal-token (no X-CSRFToken) -> 403
    const portalHeaderBypassAttempt = await fetch(`${baseUrl}/api/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'x-client-portal-token': fixtures.project.portalToken,
      },
      body: JSON.stringify({ title: 'Should Fail CSRF' }),
    });
    assert.strictEqual(portalHeaderBypassAttempt.status, 403);

    // 2) POST /api/projects/ with access cookie + invalid Bearer token (no X-CSRFToken) -> 403
    const fakeBearerBypassAttempt = await fetch(`${baseUrl}/api/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        Authorization: 'Bearer invalid.forged.jwt',
      },
      body: JSON.stringify({ title: 'Should Fail CSRF' }),
    });
    assert.strictEqual(fakeBearerBypassAttempt.status, 403);

    // 3) POST /api/auth/token/refresh/ with ONLY refresh cookie (no X-CSRFToken) -> 403
    const refreshNoCsrfAttempt = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ENV.AUTH_REFRESH_COOKIE_NAME}=${refreshCookie}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(refreshNoCsrfAttempt.status, 403);

    // 4) Fetch /api/auth/csrf/ and send matching csrftoken cookie + X-CSRFToken header -> succeeds (200)
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf/`, {
      headers: { Cookie: `${ENV.AUTH_REFRESH_COOKIE_NAME}=${refreshCookie}` },
    });
    assert.strictEqual(csrfRes.status, 200);
    const csrfData = await csrfRes.json();
    const csrfCookies = parseCookies(csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : []);
    const csrfVal = csrfCookies.csrftoken || csrfData.csrfToken;
    assert.ok(csrfVal);

    const refreshWithCsrf = await fetch(`${baseUrl}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${ENV.AUTH_REFRESH_COOKIE_NAME}=${refreshCookie}; csrftoken=${csrfVal}`,
        'X-CSRFToken': csrfVal,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(refreshWithCsrf.status, 200);
  });

  // =========================================================================
  // AUTH-09 & AUTH-10: WS Role Spoofing & Support Mode Client-Only Enforcement
  // =========================================================================
  await t.test('AUTH-09 & AUTH-10: WS client cannot spoof senderRole=consultant; Support Mode blocked from clientOnlyAction routes', async () => {
    const token = createTestToken(fixtures.consultant._id.toString(), fixtures.consultant.email);

    // Connect client socket and wait for INITIAL_STATE (ensures server registered ws.on('message'))
    const wsClient = new WebSocket(`${wsUrl}/ws/support/${fixtures.project.portalToken}/`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for INITIAL_STATE')), 3000);
      wsClient.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      wsClient.on('message', function onInit(raw) {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type === 'INITIAL_STATE') {
            clearTimeout(timer);
            wsClient.off('message', onInit);
            resolve();
          }
        } catch (_) {}
      });
    });

    const receivedChat = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for CHAT_MESSAGE_NEW echo')), 4000);
      wsClient.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'CHAT_MESSAGE_NEW' && msg.message?.text === 'Spoof attempt message') {
            clearTimeout(timer);
            resolve(msg);
          }
        } catch (_) {}
      });
      wsClient.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE_SEND',
          senderRole: 'consultant',
          senderName: 'Evil Spoofer',
          messageType: 'text',
          text: 'Spoof attempt message',
        })
      );
    });

    assert.strictEqual(receivedChat.message.senderRole, 'client');
    wsClient.close();

    // Clean up chat message created during test
    await models.ChatMessage.deleteMany({ projectId: fixtures.project._id, text: 'Spoof attempt message' });

    // Support Mode blocked on discovery/submit/, moodboards/:id/select/, moodboards/:id/feedback/, concepts/:id/feedback/
    const fakeId = fixtures.project._id.toString();
    const supportRoutes = [
      `/api/client-portal/${fixtures.project.portalToken}/discovery/submit/`,
      `/api/client-portal/${fixtures.project.portalToken}/moodboards/${fakeId}/select/`,
      `/api/client-portal/${fixtures.project.portalToken}/moodboards/${fakeId}/feedback/`,
      `/api/client-portal/${fixtures.project.portalToken}/concepts/${fakeId}/feedback/`,
    ];

    for (const urlPath of supportRoutes) {
      const res = await fetch(`${baseUrl}${urlPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-support-mode': 'true',
        },
        body: JSON.stringify({ comment: 'Support spoof test' }),
      });
      assert.strictEqual(res.status, 403, `Expected 403 on Support Mode ${urlPath}, got ${res.status}`);
    }
  });

  // =========================================================================
  // PAY-01 / PAY-02 / PAY-03 / PAY-04: Webhook Idempotency, Race & Milestone Integrity
  // =========================================================================
  await t.test('PAY-02 & PAY-03: Concurrent completePaymentMilestone and duplicate webhooks yield 1 canonical outcome; createMilestones preserves paid milestones', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const webhookSecret = `whsec_test_${rand}`;
    const consultant = await models.Consultant.create({
      email: `pay_${rand}@floxa.local`,
      name: `Pay Consultant ${rand}`,
      password: 'dummy',
      integrations: {
        razorpayWebhookSecret: encryptSecret(webhookSecret),
      },
    });
    const project = await models.Project.create({
      title: `Pay Proj ${rand}`,
      companyName: 'Pay Corp',
      sector: 'Fintech',
      status: 'advance_paid',
      consultantId: consultant._id,
      clientId: fixtures.client._id,
      portalToken: `pay_portal_${rand}_${Date.now()}`,
      progress: 40,
    });
    const milestone = await models.PaymentMilestone.create({
      projectId: project._id,
      type: 'advance',
      percentage: 30,
      amount: 10000,
      status: 'requested',
    });
    const orderId = `order_wh_${rand}`;
    const tx = await models.PaymentTransaction.create({
      projectId: project._id,
      milestoneId: milestone._id,
      amount: 10000,
      currency: 'INR',
      razorpayOrderId: orderId,
      status: 'created',
      paymentSource: 'razorpay',
    });

    cleanupHooks.push(async () => {
      await models.ProjectActivity.deleteMany({ projectId: project._id });
      await models.PaymentTransaction.deleteMany({ projectId: project._id });
      await models.PaymentMilestone.deleteMany({ projectId: project._id });
      await models.RazorpayWebhookEvent.deleteMany({});
      await models.Project.deleteOne({ _id: project._id });
      await models.Consultant.deleteOne({ _id: consultant._id });
    });

    // 1) Fire two concurrent completePaymentMilestone transitions
    const [r1, r2] = await Promise.allSettled([
      completePaymentMilestone({
        projectId: project._id.toString(),
        milestoneId: milestone._id.toString(),
        actorType: 'client',
        paymentSource: 'razorpay',
        transactionId: tx._id.toString(),
        razorpayPaymentId: `pay_race_${rand}`,
      }),
      completePaymentMilestone({
        projectId: project._id.toString(),
        milestoneId: milestone._id.toString(),
        actorType: 'system',
        paymentSource: 'razorpay_webhook',
        transactionId: tx._id.toString(),
        razorpayPaymentId: `pay_race_${rand}`,
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.ok(fulfilled.length >= 1, `At least one concurrent payment completion must succeed: ${JSON.stringify([r1, r2])}`);
    const activityCount = await models.ProjectActivity.countDocuments({
      projectId: project._id,
      action: 'payment_received',
    });
    assert.strictEqual(activityCount, 1, `Expected exactly 1 payment_received activity, got ${activityCount}`);

    // 2) Duplicate Razorpay webhook delivery with consultant-specific webhook secret & no cross-consultant fallback
    const eventId = `evt_${rand}_${Date.now()}`;
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_race_${rand}`,
            order_id: orderId,
            amount: 1000000,
            currency: 'INR',
            status: 'captured',
            notes: {
              projectId: project._id.toString(),
              milestoneId: milestone._id.toString(),
            },
          },
        },
      },
    });
    const validSig = crypto.createHmac('sha256', webhookSecret).update(webhookBody).digest('hex');

    const [wh1, wh2] = await Promise.all([
      fetch(`${baseUrl}/api/payments/razorpay/webhook/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': validSig,
          'x-razorpay-event-id': eventId,
        },
        body: webhookBody,
      }),
      fetch(`${baseUrl}/api/payments/razorpay/webhook/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': validSig,
          'x-razorpay-event-id': eventId,
        },
        body: webhookBody,
      }),
    ]);

    assert.strictEqual(wh1.status, 200);
    assert.strictEqual(wh2.status, 200);
    const eventDocs = await models.RazorpayWebhookEvent.countDocuments({ razorpayEventId: eventId });
    assert.strictEqual(eventDocs, 1, 'Duplicate webhook eventId must map to 1 idempotent record');

    // 3) Paid advance milestone is NOT overwritten by createMilestones
    const payToken = createTestToken(consultant._id.toString(), consultant.email);
    const createRes = await fetch(`${baseUrl}/api/projects/${project._id.toString()}/payments/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payToken}`,
      },
      body: JSON.stringify({
        milestones: [
          { type: 'advance', title: 'Tampered Overwrite', amount: 1 },
          { type: 'mid', title: 'Mid Milestone', amount: 15000 },
        ],
      }),
    });
    assert.strictEqual(createRes.status, 200);
    const latestAdv = await models.PaymentMilestone.findById(milestone._id).lean();
    assert.strictEqual(latestAdv.status, 'paid');
    assert.strictEqual(latestAdv.amount, 10000);
  });

  // =========================================================================
  // WF-01 & WF-02: Concept SLA Clock Pause & Atomic Scheduler Escalation
  // =========================================================================
  await t.test('WF-01 & WF-02: Concept SLA clock pauses only while shared & unapproved; concurrent scheduler runs do not duplicate escalations', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const slaConsultant = await models.Consultant.create({
      email: `sla_race_${rand}@floxa.local`,
      name: `SLA Race ${rand}`,
      password: 'dummy',
      isActive: true,
      isSuspended: false,
      flags: 0,
    });
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const slaProject = await models.Project.create({
      title: `SLA Race Proj ${rand}`,
      companyName: 'SLA Corp',
      sector: 'Tech',
      status: 'concepts',
      consultantId: slaConsultant._id,
      clientId: fixtures.client._id,
      portalToken: `sla_race_${rand}_${Date.now()}`,
      progress: 40,
      clientSubmittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      deliveryDeadline: new Date(Date.now() - 36 * 60 * 60 * 1000),
      deadlineSetAt: staleDate,
      stageEnteredAt: staleDate,
      lastDeadlineCheckAt: staleDate,
      consultantActiveSeconds: 0,
      deadlineFlagsCount: 0,
      isAwaitingClient: false,
    });

    // Insert ClientProfile + BrandDNA + selected Moodboard + shared unapproved Concept
    await models.ClientProfile.create({
      projectId: slaProject._id,
      primaryEmail: 'client@sla.local',
      contactNumber: '+919999999999',
      location: 'Mumbai',
      industry: 'Tech',
      intakeSubmittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    await models.BrandDNA.create({
      projectId: slaProject._id,
      brandValues: ['Trust'],
      personalityTraits: ['Bold'],
      approved: true,
    });
    const mb = await models.Moodboard.create({
      projectId: slaProject._id,
      title: 'Selected MB',
      image: '/media/moodboards/test_sla_mb.png',
      status: 'selected',
      isSelected: true,
    });
    const concept = await models.Concept.create({
      projectId: slaProject._id,
      title: 'Shared Unapproved Concept',
      status: 'shared',
    });

    cleanupHooks.push(async () => {
      await models.ProjectActivity.deleteMany({ projectId: slaProject._id });
      await models.Concept.deleteOne({ _id: concept._id });
      await models.Moodboard.deleteOne({ _id: mb._id });
      await models.BrandDNA.deleteOne({ projectId: slaProject._id });
      await models.ClientProfile.deleteOne({ projectId: slaProject._id });
      await models.Project.deleteOne({ _id: slaProject._id });
      await models.Consultant.deleteOne({ _id: slaConsultant._id });
    });

    // WF-01 part 1: Shared unapproved concept pauses clock for client
    const wait1 = await isProjectAwaitingClientAction(slaProject);
    assert.strictEqual(wait1.awaitingClient, true);
    assert.strictEqual(wait1.reason, 'awaiting_concept_approval');

    // WF-01 part 2: Approving concept resumes consultant SLA clock (no longer awaiting concept approval)
    await models.Concept.updateOne({ _id: concept._id }, { $set: { status: 'approved' } });
    const wait2 = await isProjectAwaitingClientAction(slaProject);
    assert.strictEqual(wait2.awaitingClient, false);

    // WF-02: Concurrent checkAndEscalateDeadlines only fires Flag 1 once
    // Retry briefly if a sibling test worker process held SchedulerLock or is finishing its activity insert
    let updatedProj = null;
    let warnActivities = 0;
    for (let attempt = 0; attempt < 15; attempt++) {
      await Promise.all([
        checkAndEscalateDeadlines(),
        checkAndEscalateDeadlines(),
        checkAndEscalateDeadlines(),
      ]);
      updatedProj = await models.Project.findById(slaProject._id).lean();
      warnActivities = await models.ProjectActivity.countDocuments({
        projectId: slaProject._id,
        action: 'deadline_warning_1',
      });
      if (updatedProj && updatedProj.deadlineFlagsCount >= 1 && warnActivities >= 1) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    assert.ok(updatedProj.deadlineFlagsCount >= 1);
    assert.strictEqual(warnActivities, 1, `Expected exactly 1 deadline_warning_1 on Flag 1 race, got ${warnActivities}`);
  });

  // =========================================================================
  // FILE-02: Spoofed magic bytes rejected
  // =========================================================================
  await t.test('FILE-02: Upload rejects executable/text bytes masquerading as PNG/WebM', async () => {
    const token = createTestToken(fixtures.consultant._id.toString(), fixtures.consultant.email);
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', Buffer.from('<script>alert("xss")</script>'), {
      filename: 'evil.png',
      contentType: 'image/png',
    });

    const res = await fetch(`${baseUrl}/api/projects/${fixtures.project._id.toString()}/messages/upload/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
    });
    assert.strictEqual(res.status, 400);
  });

  // =========================================================================
  // AI-01 & AI-02: Atomic Quota Concurrency & Encrypted/Masked BYOK Secrets
  // =========================================================================
  await t.test('AI-01 & AI-02: Concurrent AI Suite runs respect FREE_TRIAL_LIMIT_PER_TOOL=3 and store/mask secrets safely', async () => {
    const rand = Math.random().toString(36).slice(2, 8);
    const rawGemini = `AIzaSyTestSecretKey_${rand}`;
    const rawRzp = `rzp_secret_value_${rand}`;

    const aiConsultant = await models.Consultant.create({
      email: `ai_${rand}@floxa.local`,
      name: `AI ${rand}`,
      password: 'dummy',
      isActive: true,
      integrations: {
        geminiApiKey: encryptSecret(rawGemini),
        razorpayKeySecret: encryptSecret(rawRzp),
      },
      aiUsage: {
        plan: 'free',
        toolRuns: {},
        bonusCredits: 0,
      },
    });
    const aiProject = await models.Project.create({
      title: `AI Quota Proj ${rand}`,
      companyName: 'AI Corp',
      sector: 'Tech',
      status: 'discovery',
      consultantId: aiConsultant._id,
      clientId: fixtures.client._id,
      portalToken: `ai_portal_${rand}_${Date.now()}`,
      progress: 10,
    });
    cleanupHooks.push(async () => {
      await models.Project.deleteOne({ _id: aiProject._id });
      await models.Consultant.deleteOne({ _id: aiConsultant._id });
    });

    // AI-02: Verify DB stores encrypted ciphertexts and serializer never returns plaintext
    const dbDoc = await models.Consultant.findById(aiConsultant._id).lean();
    assert.ok(dbDoc.integrations.geminiApiKey.startsWith('enc:v1:'));
    assert.ok(dbDoc.integrations.razorpayKeySecret.startsWith('enc:v1:'));
    assert.strictEqual(decryptSecret(dbDoc.integrations.geminiApiKey), rawGemini);

    const serialized = serializeConsultant({ ...dbDoc, id: dbDoc._id.toString() });
    assert.strictEqual(serialized.integrations.gemini_api_key_configured, true);
    assert.ok(!JSON.stringify(serialized).includes(rawGemini), 'Plaintext Gemini key must never leak in serializer');
    assert.ok(!JSON.stringify(serialized).includes(rawRzp), 'Plaintext Razorpay secret must never leak in serializer');

    // AI-01: Fire 6 concurrent AI requests when consultant has no real API key (note: fallback/insufficient check vs quota)
    // Wait: remove geminiApiKey on consultant and temporarily unset ENV.GEMINI_API_KEY in-process won't bypass isInsufficient rollback;
    // Instead test atomic quota boundary directly with bonusCredits/toolRuns pre-seeded near limit (toolRuns['moodboard-directions'] = 2)
    // OR test HTTP 402/429 quota rejection at limit = 3 concurrently if fallback doesn't trigger.
    await models.Consultant.updateOne(
      { _id: aiConsultant._id },
      { $set: { 'integrations.geminiApiKey': '' } }
    );
    const aiToken = createTestToken(aiConsultant._id.toString(), aiConsultant.email);

    // Fire 6 parallel requests against /api/ai-suite/run/ with moodboard-directions:
    // Note: without live Gemini key, generateAiMoodboardDirections falls back (not isInsufficient unless key missing throws), OR uses ENV fallback.
    // Let's assert total successful runs NEVER exceed FREE_TRIAL_LIMIT_PER_TOOL (3) and stored count <= 3!
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${baseUrl}/api/ai-suite/run/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiToken}`,
          },
          body: JSON.stringify({
            projectId: aiProject._id.toString(),
            toolId: 'moodboard-directions',
          }),
        })
      )
    );

    const statuses = responses.map((r) => r.status);
    const okCount = statuses.filter((s) => s === 200).length;
    const quotaRejectedCount = statuses.filter((s) => s === 402 || s === 403 || s === 429).length;
    assert.ok(okCount <= 3, `Concurrent AI runs exceeded limit of 3: okCount=${okCount}, statuses=${statuses.join(',')}`);
    if (okCount === 3) {
      assert.strictEqual(quotaRejectedCount, 3, `Expected remaining 3 requests to hit quota rejection, got ${statuses.join(',')}`);
    }
    const postDoc = await models.Consultant.findById(aiConsultant._id).lean();
    const recordedRuns = Number(postDoc.aiUsage?.toolRuns?.['moodboard-directions'] || 0);
    assert.ok(recordedRuns <= 3, `Recorded toolRuns must never exceed 3, got ${recordedRuns}`);
  });
});
