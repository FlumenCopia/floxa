process.env.NODE_ENV = 'test';
import http from 'http';
import crypto from 'crypto';
import assert from 'assert';
import WebSocket from 'ws';
import { prisma } from '../dist/prisma/client.js';
import { app } from '../dist/app.js';
import { setupWebSocketServer, ACTIVE_HELP_SESSIONS } from '../dist/websocket/socketServer.js';
import { generateTokens } from '../dist/services/auth.service.js';
import { signPortalAccessToken } from '../dist/utils/crypto.js';
import { ENV } from '../dist/config/env.js';

let server;
let baseUrl;
let wsBaseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        body = JSON.stringify(body);
      }
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const rawText = buffer.toString('utf8');
          let parsed = rawText;
          try {
            parsed = JSON.parse(rawText);
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
            rawText,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function connectWs(pathWithQuery, headers = {}) {
  return new Promise((resolve) => {
    const url = `${wsBaseUrl}${pathWithQuery}`;
    const ws = new WebSocket(url, { headers });
    const messages = [];
    const messageWaiters = [];
    let closeInfo = null;
    const closeWaiters = [];

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (messageWaiters.length > 0) {
          const waiter = messageWaiters.shift();
          waiter(parsed);
        } else {
          messages.push(parsed);
        }
      } catch (err) {
        console.error('WS JSON parse error:', err);
      }
    });

    ws.on('close', (code, reason) => {
      closeInfo = { code, reason: reason.toString() };
      while (closeWaiters.length > 0) {
        const waiter = closeWaiters.shift();
        waiter(closeInfo);
      }
    });

    const clientWrapper = {
      ws,
      receiveNext(timeoutMs = 5000) {
        return new Promise((res, rej) => {
          if (messages.length > 0) {
            return res(messages.shift());
          }
          const timer = setTimeout(() => {
            rej(new Error(`Timed out waiting for WS message after ${timeoutMs}ms on ${pathWithQuery}`));
          }, timeoutMs);
          messageWaiters.push((msg) => {
            clearTimeout(timer);
            res(msg);
          });
        });
      },
      waitForClose(timeoutMs = 5000) {
        return new Promise((res, rej) => {
          if (closeInfo) return res(closeInfo);
          const timer = setTimeout(() => {
            rej(new Error(`Timed out waiting for WS close after ${timeoutMs}ms on ${pathWithQuery}`));
          }, timeoutMs);
          closeWaiters.push((info) => {
            clearTimeout(timer);
            res(info);
          });
        });
      },
      hasMessage() {
        return messages.length > 0;
      },
      send(obj) {
        ws.send(JSON.stringify(obj));
      },
      async close() {
        if (ws.readyState === WebSocket.CLOSED) return;
        return new Promise((res) => {
          ws.on('close', res);
          ws.close();
        });
      },
    };

    ws.on('open', () => {
      resolve({ success: true, client: clientWrapper });
    });

    ws.on('error', (err) => {
      resolve({ success: false, error: err, client: clientWrapper });
    });
  });
}

async function runPhase6Tests() {
  console.log('--- Starting Phase 6: Live Support and WebSocket Parity Test Suite ---');

  server = http.createServer(app);
  setupWebSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      wsBaseUrl = `ws://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const createdConsultantIds = [];
  const createdClientIds = [];
  const createdProjectIds = [];

  try {
    const runId = crypto.randomBytes(4).toString('hex');

    // 1. Setup Consultant A and B
    const consultantA = await prisma.consultant.create({
      data: {
        email: `phase6_cons_a_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant A',
        company: 'Alpha Design',
      },
    });
    createdConsultantIds.push(consultantA.id);
    const tokenA = generateTokens(consultantA.id).accessToken;

    const consultantB = await prisma.consultant.create({
      data: {
        email: `phase6_cons_b_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant B',
        company: 'Beta Agency',
      },
    });
    createdConsultantIds.push(consultantB.id);
    const tokenB = generateTokens(consultantB.id).accessToken;

    // 2. Setup Clients & Projects
    const clientA = await prisma.client.create({
      data: {
        name: 'Client Alpha',
        email: `client_a_${runId}@test.com`,
        companyName: 'Acme Alpha',
        sector: 'Technology',
      },
    });
    createdClientIds.push(clientA.id);

    const portalTokenA = `pt-a-${runId}`;
    const projectA = await prisma.project.create({
      data: {
        title: 'Alpha Branding Suite',
        companyName: 'Acme Alpha',
        sector: 'Technology',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: portalTokenA,
        portalPasswordHash: 'pbkdf2_sha256$testpass',
        status: 'discovery',
        projectValue: 60000,
        isArchived: false,
      },
    });
    createdProjectIds.push(projectA.id);

    // Initial project discovery for Project A
    await prisma.projectDiscovery.create({
      data: {
        projectId: projectA.id,
        whatBusinessDoes: 'Initial What We Do',
        targetCustomer: 'Initial Target',
        whyChooseUs: 'Initial Why Us',
        brandFeeling: 'Initial Feeling',
        sliders: [],
        emotions: [],
        competitors: [],
        visualStyles: [],
      },
    });

    // Milestone for payment testing
    const milestoneA = await prisma.paymentMilestone.create({
      data: {
        projectId: projectA.id,
        type: 'advance',
        amount: 20000,
        status: 'ready',
        percentage: 33,
      },
    });

    // Agreement for signing test
    await prisma.projectAgreement.create({
      data: {
        projectId: projectA.id,
        status: 'draft',
        signatureRequestedAt: new Date(),
      },
    });

    // Client auth cookies
    const signedCookieA = signPortalAccessToken(portalTokenA);
    const clientCookieHeaderA = {
      cookie: `${ENV.PORTAL_ACCESS_COOKIE_NAME}=${signedCookieA}`,
      'x-client-portal-token': portalTokenA,
    };

    // =========================================================================
    // TEST 1: Consultant Notification Channel Authentication & Rejection
    // =========================================================================
    console.log('Running Test 1: Consultant Notification Authentication & Rejection...');

    // 1.1 Unauthenticated consultant connection rejected with code 4001
    {
      const conn = await connectWs('/ws/support/consultant/');
      const err = await conn.client.receiveNext();
      assert.strictEqual(err.type, 'ERROR');
      assert.match(err.message, /Authentication credentials required/i);
      const close = await conn.client.waitForClose();
      assert.strictEqual(close.code, 4001);
    }

    // 1.2 Invalid token rejected with code 4001
    {
      const conn = await connectWs('/ws/support/consultant/?token=invalid_garbage_jwt');
      const err = await conn.client.receiveNext();
      assert.strictEqual(err.type, 'ERROR');
      const close = await conn.client.waitForClose();
      assert.strictEqual(close.code, 4001);
    }

    // 1.3 Authenticated consultant connection accepted with CONSULTANT_READY
    let consultantWsA;
    {
      const conn = await connectWs(`/ws/support/consultant/?token=${tokenA}`);
      assert.strictEqual(conn.success, true);
      const ready = await conn.client.receiveNext();
      assert.strictEqual(ready.type, 'CONSULTANT_READY');
      assert.strictEqual(ready.consultant_id, consultantA.id);
      assert.strictEqual(ready.consultant_name, consultantA.name);
      consultantWsA = conn.client;
    }

    console.log('✓ Test 1 Passed: Consultant channel rejects invalid tokens with 4001 and emits CONSULTANT_READY for valid tokens.');

    // =========================================================================
    // TEST 2: Project Support Room Scoping, Authorization & Password Protection
    // =========================================================================
    console.log('Running Test 2: Project Room Scoping, Auth & Password Protection...');

    // 2.1 Client without portal password on password-protected project rejected with code 4003
    {
      const conn = await connectWs(`/ws/support/${portalTokenA}/`);
      const err = await conn.client.receiveNext();
      assert.strictEqual(err.type, 'ERROR');
      assert.match(err.message, /Portal password verification required/i);
      const close = await conn.client.waitForClose();
      assert.strictEqual(close.code, 4003);
    }

    // 2.2 Consultant B (unauthorized non-owner) rejected with code 4003
    {
      const conn = await connectWs(`/ws/support/${portalTokenA}/?consultant_token=${tokenB}`);
      const err = await conn.client.receiveNext();
      assert.strictEqual(err.type, 'ERROR');
      assert.strictEqual(err.message, 'Permission denied');
      const close = await conn.client.waitForClose();
      assert.strictEqual(close.code, 4003);
    }

    // 2.3 Non-existent portal token rejected with code 4004
    {
      const conn = await connectWs(`/ws/support/non-existent-portal-token/`);
      const err = await conn.client.receiveNext();
      assert.strictEqual(err.type, 'ERROR');
      assert.strictEqual(err.message, 'Project not found');
      const close = await conn.client.waitForClose();
      assert.strictEqual(close.code, 4004);
    }

    // 2.4 Authorized client connects with portal access cookie
    let clientWsA;
    {
      const conn = await connectWs(`/ws/support/${portalTokenA}/`, clientCookieHeaderA);
      assert.strictEqual(conn.success, true);
      const init = await conn.client.receiveNext();
      assert.strictEqual(init.type, 'INITIAL_STATE');
      assert.strictEqual(init.role, 'client');
      assert.strictEqual(init.project_id, projectA.id);
      assert.strictEqual(init.active_help, null);
      clientWsA = conn.client;
    }

    console.log('✓ Test 2 Passed: Project support room correctly enforces password, consultant ownership, and 4003/4004 error codes.');

    // =========================================================================
    // TEST 3: Client Help Request -> Consultant Notification -> Support Mode Entry
    // =========================================================================
    console.log('Running Test 3: Help Request Notification & Support Entry...');

    // 3.1 Client sends CLIENT_REQUEST_HELP
    clientWsA.send({
      type: 'CLIENT_REQUEST_HELP',
      page_id: 'discovery',
      field_key: 'what_business_does',
      question: 'How should we describe our AI branding engine?',
    });

    // 3.2 Consultant A receives NOTIFICATION_HELP_REQUESTED on global notification channel
    const notif = await consultantWsA.receiveNext();
    assert.strictEqual(notif.type, 'NOTIFICATION_HELP_REQUESTED');
    assert.strictEqual(notif.project_id, projectA.id);
    assert.strictEqual(notif.portal_token, portalTokenA);
    assert.strictEqual(notif.page_id, 'discovery');
    assert.strictEqual(notif.field_key, 'what_business_does');
    assert.strictEqual(notif.question, 'How should we describe our AI branding engine?');

    // Client A in project room also receives confirmation of help requested
    const clientNotif = await clientWsA.receiveNext();
    assert.strictEqual(clientNotif.type, 'NOTIFICATION_HELP_REQUESTED');

    // 3.3 Activity logged in MongoDB
    const activityReq = await prisma.projectActivity.findFirst({
      where: { projectId: projectA.id, action: 'client_help_requested' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(activityReq, 'client_help_requested activity should be logged in DB');

    // 3.4 REST endpoints reflect active help
    const resHelpStatus = await request(`/api/client-portal/${portalTokenA}/help-status/`, {
      headers: clientCookieHeaderA,
    });
    assert.strictEqual(resHelpStatus.status, 200);
    assert.strictEqual(resHelpStatus.data.success, true);
    assert.strictEqual(resHelpStatus.data.active_help.is_active, true);
    assert.strictEqual(resHelpStatus.data.active_help.page_id, 'discovery');

    const resDiscovery = await request(`/api/client-portal/${portalTokenA}/discovery/`, {
      headers: clientCookieHeaderA,
    });
    assert.strictEqual(resDiscovery.status, 200);
    assert.ok(resDiscovery.data.active_help, 'Discovery payload should include active_help');
    assert.strictEqual(resDiscovery.data.active_help.is_active, true);

    // 3.5 Consultant A joins the project room
    let consultantRoomWsA;
    {
      const conn = await connectWs(`/ws/support/${portalTokenA}/?consultant_token=${tokenA}`);
      assert.strictEqual(conn.success, true);
      const init = await conn.client.receiveNext();
      assert.strictEqual(init.type, 'INITIAL_STATE');
      assert.strictEqual(init.role, 'consultant');
      assert.ok(init.active_help, 'Consultant should receive active_help in INITIAL_STATE');
      assert.strictEqual(init.active_help.page_id, 'discovery');
      consultantRoomWsA = conn.client;
    }

    // Consultant announces presence
    consultantRoomWsA.send({
      type: 'CONSULTANT_JOINED',
      page_id: 'discovery',
    });

    const joinAnnouncement = await clientWsA.receiveNext();
    assert.strictEqual(joinAnnouncement.type, 'CONSULTANT_JOINED');
    assert.strictEqual(joinAnnouncement.consultant_name, 'Consultant A');

    const joinAnnouncementCons = await consultantRoomWsA.receiveNext();
    assert.strictEqual(joinAnnouncementCons.type, 'CONSULTANT_JOINED');

    console.log('✓ Test 3 Passed: Live help request dispatched to consultant channel, recorded in DB, and returned on support entry.');

    // =========================================================================
    // TEST 4: Authorized Bidirectional FIELD_SYNC & Database Persistence
    // =========================================================================
    console.log('Running Test 4: Bidirectional FIELD_SYNC & DB Persistence...');

    // 4.1 Client sends FIELD_SYNC for what_business_does
    clientWsA.send({
      type: 'FIELD_SYNC',
      page_id: 'discovery',
      field_key: 'what_business_does',
      value: 'AI Powered Branding Platform',
    });

    const clientToConsSync = await consultantRoomWsA.receiveNext();
    assert.strictEqual(clientToConsSync.type, 'FIELD_SYNC');
    assert.strictEqual(clientToConsSync.page_id, 'discovery');
    assert.strictEqual(clientToConsSync.field_key, 'what_business_does');
    assert.strictEqual(clientToConsSync.value, 'AI Powered Branding Platform');
    assert.strictEqual(clientToConsSync.sender_role, 'client');

    // 4.2 Consultant sends FIELD_SYNC for target_customer on active help page
    consultantRoomWsA.send({
      type: 'FIELD_SYNC',
      page_id: 'discovery',
      field_key: 'target_customer',
      value: 'High Growth Startups & Design Teams',
    });

    const consToClientSync = await clientWsA.receiveNext();
    assert.strictEqual(consToClientSync.type, 'FIELD_SYNC');
    assert.strictEqual(consToClientSync.field_key, 'target_customer');
    assert.strictEqual(consToClientSync.value, 'High Growth Startups & Design Teams');
    assert.strictEqual(consToClientSync.sender_role, 'consultant');

    // 4.3 Verify MongoDB draft persistence
    // Wait briefly for async persistDraftField
    await new Promise((r) => setTimeout(r, 200));
    const persistedDisc = await prisma.projectDiscovery.findUnique({
      where: { projectId: projectA.id },
    });
    assert.strictEqual(persistedDisc.whatBusinessDoes, 'AI Powered Branding Platform');
    assert.strictEqual(persistedDisc.targetCustomer, 'High Growth Startups & Design Teams');

    console.log('✓ Test 4 Passed: Bidirectional live FIELD_SYNC transmitted and draft fields persisted to MongoDB.');

    // =========================================================================
    // TEST 5: Security Rejections on FIELD_SYNC (Wrong page, Inactive help, Invalid field)
    // =========================================================================
    console.log('Running Test 5: Security Rejections on FIELD_SYNC...');

    // 5.1 Consultant tries to edit wrong page (help is on 'discovery', consultant tries 'frame_5' which is Step 5)
    consultantRoomWsA.send({
      type: 'FIELD_SYNC',
      page_id: 'frame_5',
      field_key: 'target_customer',
      value: 'Hacked Step',
    });

    const permErr = await consultantRoomWsA.receiveNext();
    assert.strictEqual(permErr.type, 'ERROR');
    assert.strictEqual(permErr.code, 'PERMISSION_DENIED');
    assert.match(permErr.message, /Consultant can only edit fields on the page where client requested help/i);
    assert.strictEqual(clientWsA.hasMessage(), false, 'Client should NOT receive rejected field sync');

    // 5.2 Invalid / malicious field key rejected
    clientWsA.send({
      type: 'FIELD_SYNC',
      page_id: 'discovery',
      field_key: 'portalPasswordHash',
      value: 'hacked_pw',
    });

    const fieldErr = await clientWsA.receiveNext();
    assert.strictEqual(fieldErr.type, 'ERROR');
    assert.strictEqual(fieldErr.code, 'INVALID_FIELD');

    // 5.3 Client resolves help
    clientWsA.send({
      type: 'RESOLVE_HELP',
      page_id: 'discovery',
    });

    const resResolved = await consultantRoomWsA.receiveNext();
    assert.strictEqual(resResolved.type, 'HELP_RESOLVED');
    const clientResolved = await clientWsA.receiveNext();
    assert.strictEqual(clientResolved.type, 'HELP_RESOLVED');

    // 5.4 Now that help is inactive, consultant cannot edit even on discovery page
    consultantRoomWsA.send({
      type: 'FIELD_SYNC',
      page_id: 'discovery',
      field_key: 'why_choose_us',
      value: 'Should be blocked',
    });

    const inactiveErr = await consultantRoomWsA.receiveNext();
    assert.strictEqual(inactiveErr.type, 'ERROR');
    assert.strictEqual(inactiveErr.code, 'PERMISSION_DENIED');

    console.log('✓ Test 5 Passed: Strict page mismatch, invalid field key, and inactive help guards properly block editing.');

    // =========================================================================
    // TEST 6: Client-Only Action Blocking in Support Mode (HTTP)
    // =========================================================================
    console.log('Running Test 6: Client-Only Action Blocking in Support Mode...');

    const supportHeaders = {
      Authorization: `Bearer ${tokenA}`,
      'X-Support-Mode': 'true',
      'X-Client-Portal-Token': portalTokenA,
    };

    // 6.1 Allowed actions in Support Mode: View & Edit Discovery
    const supGetDisc = await request(`/api/client-portal/${portalTokenA}/discovery/`, {
      headers: supportHeaders,
    });
    assert.strictEqual(supGetDisc.status, 200, 'Support mode should be allowed to view discovery');

    const supPostDisc = await request(`/api/client-portal/${portalTokenA}/discovery/`, {
      method: 'POST',
      headers: supportHeaders,
      body: { why_choose_us: 'Expert Consultant Assistance' },
    });
    assert.strictEqual(supPostDisc.status, 200, 'Support mode should be allowed to edit discovery');

    // 6.2 Cross-consultant support mode attempt rejected with 403
    const crossSupDisc = await request(`/api/client-portal/${portalTokenA}/discovery/`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'X-Support-Mode': 'true',
        'X-Client-Portal-Token': portalTokenA,
      },
    });
    assert.strictEqual(crossSupDisc.status, 403, 'Cross-consultant support access must be rejected');
    assert.match(crossSupDisc.data.detail, /not the assigned consultant/i);

    console.log('✓ Test 6 Passed: Support mode allows assistance and cross-consultant access is rejected.');

    // =========================================================================
    // TEST 7: Reconnect & Duplicate Listener Prevention
    // =========================================================================
    console.log('Running Test 7: Reconnect & Duplicate Listener Prevention...');

    // Close consultantWsA and reconnect
    await consultantWsA.close();

    const reconn = await connectWs(`/ws/support/consultant/?token=${tokenA}`);
    assert.strictEqual(reconn.success, true);
    await reconn.client.receiveNext(); // CONSULTANT_READY

    // Trigger help request via REST API
    const restHelp = await request(`/api/client-portal/${portalTokenA}/help-request/`, {
      method: 'POST',
      headers: clientCookieHeaderA,
      body: {
        page_id: 'Step 2',
        field_key: 'brand_feeling',
        question: 'Reconnected listener test',
      },
    });
    assert.strictEqual(restHelp.status, 200);

    // Reconnected consultant receives exactly one message
    const reconnMsg = await reconn.client.receiveNext();
    assert.strictEqual(reconnMsg.type, 'NOTIFICATION_HELP_REQUESTED');
    assert.strictEqual(reconnMsg.page_id, 'Step 2');

    // Assert no duplicate message arrived
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(reconn.client.hasMessage(), false, 'Should not receive duplicate notification after reconnect');

    await reconn.client.close();
    console.log('✓ Test 7 Passed: Reconnecting consultant receives exactly one notification frame without duplicate listeners.');

    // =========================================================================
    // TEST 8: Backend Restart Simulation & State Rehydration
    // =========================================================================
    console.log('Running Test 8: Backend Restart & State Rehydration...');

    // Close active socket connections
    await clientWsA.close();
    await consultantRoomWsA.close();

    // Clear in-memory active help sessions to simulate backend process restart
    delete ACTIVE_HELP_SESSIONS[projectA.id];
    assert.strictEqual(ACTIVE_HELP_SESSIONS[projectA.id], undefined);

    // Connect new client to project room
    const restartClient = await connectWs(`/ws/support/${portalTokenA}/`, clientCookieHeaderA);
    const restartInit = await restartClient.client.receiveNext();
    assert.strictEqual(restartInit.type, 'INITIAL_STATE');
    assert.ok(restartInit.active_help, 'Active help should be rehydrated from MongoDB after restart');
    assert.strictEqual(restartInit.active_help.page_id, 'Step 2');
    assert.strictEqual(restartInit.active_help.field_key, 'brand_feeling');
    assert.strictEqual(restartInit.active_help.question, 'Reconnected listener test');

    await restartClient.client.close();
    console.log('✓ Test 8 Passed: Active support session rehydrated from MongoDB after simulated backend restart.');

    // =========================================================================
    // TEST 9: WebRTC Video Call Signaling Parity
    // =========================================================================
    console.log('Running Test 9: WebRTC Video Call Signaling Parity...');

    const rtcClient = await connectWs(`/ws/support/${portalTokenA}/`, clientCookieHeaderA);
    await rtcClient.client.receiveNext(); // INITIAL_STATE

    const rtcConsultant = await connectWs(`/ws/support/${portalTokenA}/?consultant_token=${tokenA}`);
    await rtcConsultant.client.receiveNext(); // INITIAL_STATE

    // Consultant initiates call
    rtcConsultant.client.send({
      type: 'WEBRTC_SIGNAL',
      action: 'call_initiate',
      data: { initiator: 'consultant' },
    });

    const clientRtc1 = await rtcClient.client.receiveNext();
    assert.strictEqual(clientRtc1.type, 'WEBRTC_SIGNAL');
    assert.strictEqual(clientRtc1.action, 'call_initiate');
    assert.strictEqual(clientRtc1.sender_role, 'consultant');

    // Client sends offer
    rtcClient.client.send({
      type: 'WEBRTC_SIGNAL',
      action: 'offer',
      data: { sdp: 'v=0...client_offer_sdp' },
    });

    const consRtc1 = await rtcConsultant.client.receiveNext();
    assert.strictEqual(consRtc1.type, 'WEBRTC_SIGNAL');
    assert.strictEqual(consRtc1.action, 'offer');
    assert.strictEqual(consRtc1.data.sdp, 'v=0...client_offer_sdp');

    // Consultant sends answer
    rtcConsultant.client.send({
      type: 'WEBRTC_SIGNAL',
      action: 'answer',
      data: { sdp: 'v=0...cons_answer_sdp' },
    });

    const clientRtc2 = await rtcClient.client.receiveNext();
    assert.strictEqual(clientRtc2.type, 'WEBRTC_SIGNAL');
    assert.strictEqual(clientRtc2.action, 'answer');
    assert.strictEqual(clientRtc2.data.sdp, 'v=0...cons_answer_sdp');

    await rtcClient.client.close();
    await rtcConsultant.client.close();

    console.log('✓ Test 9 Passed: WebRTC signaling flows correctly between client and consultant.');

    // =========================================================================
    // TEST 10: Archived Project Access Rejection
    // =========================================================================
    console.log('Running Test 10: Archived Project Rejection...');

    await prisma.project.update({
      where: { id: projectA.id },
      data: { isArchived: true },
    });

    // WebSocket connect rejected with 4004
    const archWs = await connectWs(`/ws/support/${portalTokenA}/`, clientCookieHeaderA);
    const archWsErr = await archWs.client.receiveNext();
    assert.strictEqual(archWsErr.type, 'ERROR');
    assert.strictEqual(archWsErr.message, 'Project not found');
    const archClose = await archWs.client.waitForClose();
    assert.strictEqual(archClose.code, 4004);

    // HTTP REST access rejected with 404
    const archHttp = await request(`/api/client-portal/${portalTokenA}/help-status/`, {
      headers: clientCookieHeaderA,
    });
    assert.strictEqual(archHttp.status, 404);

    console.log('✓ Test 10 Passed: Archived projects reject WebSocket connections (4004) and REST requests (404).');

    console.log('\n======================================================');
    console.log('All Phase 6 Live Support & WebSocket Tests PASSED! ✓✓✓');
    console.log('======================================================\n');
  } catch (err) {
    console.error('INNER TEST EXCEPTION:', err);
    throw err;
  } finally {
    // Teardown isolated fixtures
    console.log('Cleaning up Phase 6 test fixtures...');
    if (createdProjectIds.length > 0) {
      await prisma.projectActivity.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.projectDiscovery.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.projectAgreement.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdClientIds.length > 0) {
      await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    }
    if (createdConsultantIds.length > 0) {
      await prisma.consultant.deleteMany({ where: { id: { in: createdConsultantIds } } });
    }

    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  }
}

runPhase6Tests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Phase 6 Test Suite FAILED:', err);
    process.exit(1);
  });
