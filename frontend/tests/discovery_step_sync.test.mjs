import test from 'node:test';
import assert from 'node:assert';

/**
 * Discovery step synchronization state machine simulator
 * Matches the logic in ConsultantClientPortal.jsx and DiscoveryFlow.jsx
 */
class DiscoveryStepSyncManager {
  constructor() {
    this.step = 1;
    this.lastNavigatedStep = null;
    this.activeHelpSession = null;
  }

  // Initial load or background refresh
  applyDraftResponse(disc, options = {}) {
    const shouldSyncStep = options.syncStep ?? (this.lastNavigatedStep === null);
    if (
      typeof disc.step === 'number' &&
      disc.step >= 1 &&
      disc.step <= 6 &&
      shouldSyncStep &&
      !this.activeHelpSession?.is_active &&
      this.lastNavigatedStep === null
    ) {
      this.step = disc.step;
    }
  }

  // WebSocket step_navigate event from client
  handleStepNavigate(data) {
    if (typeof data.step === 'number' && data.step >= 1 && data.step <= 9) {
      this.lastNavigatedStep = data.step;
      this.step = data.step;
    }
  }

  // Consultant manual navigation
  navigateNext() {
    const next = Math.min(this.step + 1, 6);
    this.lastNavigatedStep = next;
    this.step = next;
    return next;
  }

  navigatePrev() {
    const prev = Math.max(this.step - 1, 1);
    this.lastNavigatedStep = prev;
    this.step = prev;
    return prev;
  }
}

test('BUG-01: Discovery Step Resynchronization Race Condition Tests', async (t) => {
  await t.test('1. Initial load hydrates step from DB draft', () => {
    const manager = new DiscoveryStepSyncManager();
    assert.strictEqual(manager.step, 1);

    // Initial load: syncStep is true and lastNavigatedStep is null
    manager.applyDraftResponse({ step: 3 }, { syncStep: true });
    assert.strictEqual(manager.step, 3, 'Initial load should hydrate step from server draft');
  });

  await t.test('2. Stale DB draft does not overwrite step after client step_navigate', () => {
    const manager = new DiscoveryStepSyncManager();

    // Client moves from Step 1 to Step 2 via WebSocket
    manager.handleStepNavigate({ step: 2 });
    assert.strictEqual(manager.step, 2);

    // Immediate fetchDiscovery returns stale DB draft containing step 1
    manager.applyDraftResponse({ step: 1 }, { syncStep: false });

    // Consultant MUST remain on Step 2
    assert.strictEqual(manager.step, 2, 'Consultant should remain on Step 2 despite stale DB returning Step 1');
  });

  await t.test('3. In-flight initial fetch response does not overwrite post-navigate step', () => {
    const manager = new DiscoveryStepSyncManager();

    // Client moves to Step 3
    manager.handleStepNavigate({ step: 3 });

    // In-flight fetch without explicit options resolves with stale step 1
    manager.applyDraftResponse({ step: 1 });

    assert.strictEqual(manager.step, 3, 'In-flight draft response must not revert navigated step');
  });

  await t.test('4. Consultant forward navigation is preserved against stale draft', () => {
    const manager = new DiscoveryStepSyncManager();
    manager.navigateNext(); // moves to step 2
    assert.strictEqual(manager.step, 2);

    // Subsequent background draft fetch returns step 1
    manager.applyDraftResponse({ step: 1 }, { syncStep: false });
    assert.strictEqual(manager.step, 2, 'Consultant manual navigation must not be overwritten');
  });

  await t.test('5. Active help session protects active step from draft overwrite', () => {
    const manager = new DiscoveryStepSyncManager();
    manager.activeHelpSession = { is_active: true, page_id: 'frame_4' };
    manager.step = 4;

    manager.applyDraftResponse({ step: 1 }, { syncStep: true });
    assert.strictEqual(manager.step, 4, 'Active help session must prevent step overwrite');
  });
});
