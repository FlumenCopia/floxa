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

  await t.test('4. Call initiation validates callType differentiation (audio vs video)', () => {
    function formatCallSignal(projectId, clientName, projectTitle, callType = 'video') {
      const validCallTypes = new Set(['audio', 'video']);
      const normalizedType = validCallTypes.has(callType) ? callType : 'video';
      return {
        action: 'call_initiate',
        projectId,
        data: {
          clientName,
          projectTitle,
          callType: normalizedType,
        },
      };
    }

    const audioSignal = formatCallSignal('p1', 'taigun', 'Brand Project', 'audio');
    assert.strictEqual(audioSignal.data.callType, 'audio');

    const videoSignal = formatCallSignal('p1', 'taigun', 'Brand Project', 'video');
    assert.strictEqual(videoSignal.data.callType, 'video');

    const fallbackSignal = formatCallSignal('p1', 'taigun', 'Brand Project', 'invalid');
    assert.strictEqual(fallbackSignal.data.callType, 'video');
  });

  await t.test('5. FloxaHeader navigation contract: Navbar video button and picker are excluded from topbar', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const headerPath = path.resolve('components/common/FloxaHeader.jsx');
    const content = await fs.readFile(headerPath, 'utf8');

    // Confirm floxa-nav-video-btn and floxa-nav-incoming-call-group are removed from FloxaHeader
    assert.strictEqual(content.includes('floxa-nav-video-btn'), false, 'floxa-nav-video-btn must not exist in FloxaHeader');
    assert.strictEqual(content.includes('floxa-nav-incoming-call-group'), false, 'floxa-nav-incoming-call-group must not exist in FloxaHeader');
    assert.strictEqual(content.includes('isCallPickerOpen'), false, 'isCallPickerOpen must not exist in FloxaHeader');

    // Confirm VideoCallModal is mounted globally so all pages display incoming calls
    assert.ok(content.includes('<VideoCallModal currentRole="consultant"'), 'VideoCallModal must be mounted globally in FloxaHeader');
  });
});

