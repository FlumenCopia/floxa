'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestFixtures,
  WebSocket,
} = require('./helpers.cjs');

test('Phase 4: WebRTC Signaling & Room Isolation', async (t) => {
  await connectTestDatabase();
  const { baseUrl, wsUrl } = await startTestServer();

  // Create two isolated project fixtures
  const fixturesA = await createTestFixtures();
  const fixturesB = await createTestFixtures();

  const tokenA = createTestToken(fixturesA.consultant._id.toString(), fixturesA.consultant.email);
  const tokenB = createTestToken(fixturesB.consultant._id.toString(), fixturesB.consultant.email);

  t.after(async () => {
    await fixturesA.cleanup();
    await fixturesB.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('4.1 All required WebRTC actions are accepted and relayed', async () => {
    const consultantWs = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${tokenA}`);
    await new Promise((resolve) => {
      consultantWs.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === 'CONSULTANT_READY') resolve();
        } catch (_) {}
      });
    });

    const clientWs = new WebSocket(`${wsUrl}/ws/support/${fixturesA.project.portalToken}`);
    await new Promise((resolve) => {
      clientWs.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === 'INITIAL_STATE') resolve();
        } catch (_) {}
      });
    });

    const requiredActions = [
      'call_initiate',
      'call_accept',
      'call_reject',
      'call_cancel',
      'call_end',
      'offer',
      'answer',
      'ice_candidate',
    ];

    for (const action of requiredActions) {
      const receivePromise = new Promise((resolve) => {
        const handler = (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.action === action) {
              consultantWs.off('message', handler);
              resolve(parsed);
            }
          } catch (_) {}
        };
        consultantWs.on('message', handler);
      });

      // Client sends WebRTC signal
      clientWs.send(
        JSON.stringify({
          type: 'WEBRTC_SIGNAL',
          action: action,
          project_id: fixturesA.project._id.toString(),
          data: { testAction: action },
        })
      );

      const received = await Promise.race([
        receivePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout waiting for action: ${action}`)), 2000)),
      ]);

      assert.strictEqual(received.action, action, `Action ${action} must be received by consultant`);
    }

    clientWs.close();
    consultantWs.close();
  });

  await t.test('4.2 Unsupported WebRTC action is rejected or ignored without crash', async () => {
    const clientWs = new WebSocket(`${wsUrl}/ws/support/${fixturesA.project.portalToken}`);
    await new Promise((resolve) => clientWs.on('open', resolve));

    clientWs.send(
      JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        action: 'unsupported_exploit_action',
        data: {},
      })
    );

    // Wait 200ms to ensure server remains healthy and socket stays functional
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(clientWs.readyState, WebSocket.OPEN, 'Socket should remain open and healthy');
    clientWs.close();
  });

  await t.test('4.3 WebRTC signals remain isolated between projects and consultants', async () => {
    // Consultant B connects
    const consultantBWs = new WebSocket(`${wsUrl}/ws/support/consultant/?token=${tokenB}`);
    await new Promise((resolve) => {
      consultantBWs.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === 'CONSULTANT_READY') resolve();
        } catch (_) {}
      });
    });

    let consultantBReceivedSignal = false;
    consultantBWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.project_id === fixturesA.project._id.toString() || parsed.action === 'call_initiate') {
          consultantBReceivedSignal = true;
        }
      } catch (_) {}
    });

    // Client A sends signal intended for Consultant A
    const clientAWs = new WebSocket(`${wsUrl}/ws/support/${fixturesA.project.portalToken}`);
    await new Promise((resolve) => clientAWs.on('open', resolve));

    clientAWs.send(
      JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        action: 'call_initiate',
        project_id: fixturesA.project._id.toString(),
        data: {},
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(consultantBReceivedSignal, false, 'Consultant B must NOT receive signals for Project A');

    clientAWs.close();
    consultantBWs.close();
  });
});
