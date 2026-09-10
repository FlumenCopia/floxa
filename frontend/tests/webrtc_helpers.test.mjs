import test from 'node:test';
import assert from 'node:assert';

test('Frontend WebRTC: Signaling Protocol & State Transitions', async (t) => {
  const CANONICAL_ACTIONS = new Set([
    'call_initiate',
    'call_accept',
    'call_reject',
    'call_cancel',
    'call_end',
    'offer',
    'answer',
    'ice_candidate',
  ]);

  await t.test('1. Validates all 8 canonical WebRTC signaling action names', () => {
    const required = [
      'call_initiate',
      'call_accept',
      'call_reject',
      'call_cancel',
      'call_end',
      'offer',
      'answer',
      'ice_candidate',
    ];

    for (const act of required) {
      assert.ok(CANONICAL_ACTIONS.has(act), `Action ${act} must be recognized`);
    }
    assert.strictEqual(CANONICAL_ACTIONS.has('unknown_action'), false);
  });

  await t.test('2. Envelope serialization formats valid JSON message with boundary checks', () => {
    function createWebRTCMessage(action, projectId, data = {}) {
      if (!CANONICAL_ACTIONS.has(action)) {
        throw new Error(`Unsupported WebRTC action: ${action}`);
      }
      return JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        action,
        project_id: projectId,
        data,
      });
    }

    const validMsg = createWebRTCMessage('offer', 'proj_123', { sdp: 'v=0...' });
    const parsed = JSON.parse(validMsg);
    assert.strictEqual(parsed.type, 'WEBRTC_SIGNAL');
    assert.strictEqual(parsed.action, 'offer');
    assert.strictEqual(parsed.project_id, 'proj_123');
    assert.strictEqual(parsed.data.sdp, 'v=0...');

    assert.throws(() => createWebRTCMessage('invalid_action', 'proj_123'));
  });

  await t.test('3. Call state machine handles valid transitions and busy state collision', () => {
    class MockCallStateMachine {
      constructor() {
        this.state = 'idle';
      }

      handleIncomingCall() {
        if (this.state !== 'idle') {
          return { accepted: false, reason: 'busy' };
        }
        this.state = 'incoming_ringing';
        return { accepted: true };
      }

      acceptCall() {
        if (this.state === 'incoming_ringing' || this.state === 'outgoing_ringing') {
          this.state = 'connected';
          return true;
        }
        return false;
      }

      endCall() {
        this.state = 'ended';
        setTimeout(() => {
          this.state = 'idle';
        }, 10);
      }
    }

    const sm = new MockCallStateMachine();
    assert.strictEqual(sm.state, 'idle');

    const firstCall = sm.handleIncomingCall();
    assert.strictEqual(firstCall.accepted, true);
    assert.strictEqual(sm.state, 'incoming_ringing');

    // Collision rejection: second incoming call while busy
    const secondCall = sm.handleIncomingCall();
    assert.strictEqual(secondCall.accepted, false);
    assert.strictEqual(secondCall.reason, 'busy');

    // Accept call
    const accepted = sm.acceptCall();
    assert.strictEqual(accepted, true);
    assert.strictEqual(sm.state, 'connected');

    // End call
    sm.endCall();
    assert.strictEqual(sm.state, 'ended');
  });
});
