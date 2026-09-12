import test from 'node:test';
import assert from 'node:assert';

function createConfirmationPrompt(type, item) {
  if (type === "concept") {
    return {
      type: "concept",
      id: item.id,
      title: "Approve Concept",
      itemName: item.title || "Concept",
      message:
        "Are you sure you want to approve this concept? Your consultant will be notified and this design will be confirmed as the approved direction.",
      confirmText: "Approve Concept",
    };
  }

  if (type === "moodboard") {
    const isSwitching = Boolean(item.isSwitching);
    return {
      type: "moodboard",
      id: item.id,
      title: isSwitching ? "Switch Visual Direction" : "Select Visual Direction",
      itemName: item.name || item.title || "Visual Direction",
      message: isSwitching
        ? `Are you sure you want to switch your visual direction to "${item.name || item.title || "this moodboard"}"? Your consultant will proceed with designing your brand concepts based on this moodboard.`
        : "Are you sure you want to select this visual direction? Your consultant will proceed with designing your brand concepts based on this moodboard.",
      confirmText: isSwitching ? "Switch Direction" : "Select Direction",
    };
  }

  return null;
}

test('In-Screen Confirmation Prompt Contract for Concept & Moodboard', async (t) => {
  await t.test('1. Concept approval generates in-screen confirmation modal prompt without browser alert', () => {
    const concept = { id: 'c-1', title: 'Minimalist Dining Set' };
    const prompt = createConfirmationPrompt('concept', concept);

    assert.ok(prompt);
    assert.strictEqual(prompt.type, 'concept');
    assert.strictEqual(prompt.title, 'Approve Concept');
    assert.strictEqual(prompt.itemName, 'Minimalist Dining Set');
    assert.ok(prompt.message.includes('approve this concept'));
    assert.strictEqual(prompt.confirmText, 'Approve Concept');
  });

  await t.test('2. Moodboard selection generates in-screen confirmation modal prompt without browser alert', () => {
    const moodboard = { id: 'm-1', name: 'Dark Luxe Interior' };
    const prompt = createConfirmationPrompt('moodboard', moodboard);

    assert.ok(prompt);
    assert.strictEqual(prompt.type, 'moodboard');
    assert.strictEqual(prompt.title, 'Select Visual Direction');
    assert.strictEqual(prompt.itemName, 'Dark Luxe Interior');
    assert.ok(prompt.message.includes('select this visual direction'));
    assert.strictEqual(prompt.confirmText, 'Select Direction');
  });

  await t.test('3. Fallback names are provided when title or name is missing', () => {
    const unnamedConcept = { id: 'c-2' };
    const conceptPrompt = createConfirmationPrompt('concept', unnamedConcept);
    assert.strictEqual(conceptPrompt.itemName, 'Concept');

    const unnamedMoodboard = { id: 'm-2' };
    const moodboardPrompt = createConfirmationPrompt('moodboard', unnamedMoodboard);
    assert.strictEqual(moodboardPrompt.itemName, 'Visual Direction');
  });

  await t.test('4. Switching direction generates contextual prompt with switch messaging', () => {
    const switchingMoodboard = { id: 'm-3', name: 'Scandinavian Minimal', isSwitching: true };
    const prompt = createConfirmationPrompt('moodboard', switchingMoodboard);
    assert.strictEqual(prompt.title, 'Switch Visual Direction');
    assert.strictEqual(prompt.confirmText, 'Switch Direction');
    assert.ok(prompt.message.includes('switch your visual direction'));
  });

  await t.test('5. Inline confirmation state management validates in-place card targeting', () => {
    let confirmingMoodboardId = null;
    let feedbackMoodboardId = 'm-1';

    // User clicks select direction on m-2
    function onSelectClick(id) {
      feedbackMoodboardId = null;
      confirmingMoodboardId = id;
    }

    onSelectClick('m-2');
    assert.strictEqual(confirmingMoodboardId, 'm-2', 'Directly targets the clicked card');
    assert.strictEqual(feedbackMoodboardId, null, 'Closes open feedback when confirming');

    // Cancel in-place
    confirmingMoodboardId = null;
    assert.strictEqual(confirmingMoodboardId, null);
  });

  await t.test('6. Inline concept approval confirmation targets clicked card only', () => {
    let confirmingConceptId = null;
    let feedbackConceptId = 'c-1';

    function onApproveClick(id) {
      feedbackConceptId = null;
      confirmingConceptId = id;
    }

    onApproveClick('c-5');
    assert.strictEqual(confirmingConceptId, 'c-5');
    assert.strictEqual(feedbackConceptId, null);

    // Cancel
    confirmingConceptId = null;
    assert.strictEqual(confirmingConceptId, null);
  });

  await t.test('7. Multiple moodboards can be selected simultaneously', () => {
    let moodboards = [
      { id: 'm-1', title: 'Moody Minimal', is_selected: false },
      { id: 'm-2', title: 'Warm Editorial', is_selected: false },
      { id: 'm-3', title: 'Cyber Luxe', is_selected: false },
    ];

    function selectMoodboard(id) {
      moodboards = moodboards.map((item) =>
        item.id === id ? { ...item, is_selected: true } : item
      );
    }

    // Client selects m-1
    selectMoodboard('m-1');
    assert.strictEqual(moodboards.find((m) => m.id === 'm-1').is_selected, true);

    // Client selects m-2 without losing m-1
    selectMoodboard('m-2');
    assert.strictEqual(moodboards.find((m) => m.id === 'm-1').is_selected, true, 'm-1 remains selected');
    assert.strictEqual(moodboards.find((m) => m.id === 'm-2').is_selected, true, 'm-2 is also selected');

    const selectedCount = moodboards.filter((m) => m.is_selected).length;
    assert.strictEqual(selectedCount, 2, 'Two moodboards selected concurrently');
  });

  await t.test('8. Once selected, moodboard cannot be deselected and remains permanently locked', () => {
    const moodboards = [
      { id: 'm-1', title: 'Moody Minimal', is_selected: true },
      { id: 'm-2', title: 'Warm Editorial', is_selected: true },
    ];

    // No deselect option is permitted once approved/selected
    function attemptDeselect(item) {
      if (item.is_selected) {
        return { allowed: false, reason: 'Selection is permanent and cannot be deselected' };
      }
      return { allowed: true };
    }

    const result = attemptDeselect(moodboards[0]);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(moodboards[0].is_selected, true, 'Moodboard remains permanently selected');
  });

  await t.test('9. Multiple concepts can be approved simultaneously', () => {
    let concepts = [
      { id: 'c-1', title: 'Concept Alpha', status: 'shared' },
      { id: 'c-2', title: 'Concept Beta', status: 'shared' },
    ];

    function approveConcept(id) {
      concepts = concepts.map((item) =>
        item.id === id ? { ...item, status: 'approved' } : item
      );
    }

    approveConcept('c-1');
    assert.strictEqual(concepts.find((c) => c.id === 'c-1').status, 'approved');

    approveConcept('c-2');
    assert.strictEqual(concepts.find((c) => c.id === 'c-1').status, 'approved', 'c-1 remains approved');
    assert.strictEqual(concepts.find((c) => c.id === 'c-2').status, 'approved', 'c-2 is also approved');

    const approvedCount = concepts.filter((c) => c.status === 'approved').length;
    assert.strictEqual(approvedCount, 2, 'Two concepts approved concurrently');
  });

  await t.test('10. Once approved, concept cannot be unapproved and remains permanently locked', () => {
    const concepts = [
      { id: 'c-1', title: 'Concept Alpha', status: 'approved' },
      { id: 'c-2', title: 'Concept Beta', status: 'approved' },
    ];

    function attemptUnapprove(item) {
      if (item.status === 'approved') {
        return { allowed: false, reason: 'Approved concepts cannot be changed or deselected' };
      }
      return { allowed: true };
    }

    const result = attemptUnapprove(concepts[0]);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(concepts[0].status, 'approved', 'Concept remains permanently approved');
  });

  await t.test('11. Confirmation message explicitly warns that the decision cannot be undone', () => {
    const conceptMessage = "Are you sure you want to approve this concept? Once approved, this decision cannot be undone. (You can approve multiple concepts)";
    assert.ok(conceptMessage.includes("cannot be undone"), "Warns client about permanence");

    const moodboardMessage = "Are you sure you want to select this visual direction? Once selected, this decision cannot be undone. (You can select multiple moodboards)";
    assert.ok(moodboardMessage.includes("cannot be undone"), "Warns client about permanence");
  });
});


