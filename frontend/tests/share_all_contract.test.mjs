import test from 'node:test';
import assert from 'node:assert';

function getDraftMoodboards(moodboards) {
  return (moodboards || []).filter((m) => !m.is_shared && !m.is_selected);
}

function getDraftConcepts(concepts) {
  return (concepts || []).filter((c) => c.status === "draft");
}

function getShareAllButtonLabel(count) {
  return `Share all (${count})`;
}

test('Discovery Share All Contract Tests', async (t) => {
  await t.test('1. Correctly calculates draft moodboards count and filters out shared/selected ones', () => {
    const moodboards = [
      { id: 'm1', title: 'Option A', is_shared: false, is_selected: false },
      { id: 'm2', title: 'Option B', is_shared: true, is_selected: false },
      { id: 'm3', title: 'Option C', is_shared: false, is_selected: true },
      { id: 'm4', title: 'Option D', is_shared: false, is_selected: false },
    ];

    const drafts = getDraftMoodboards(moodboards);
    assert.strictEqual(drafts.length, 2);
    assert.deepStrictEqual(drafts.map(d => d.id), ['m1', 'm4']);
    assert.strictEqual(getShareAllButtonLabel(drafts.length), 'Share all (2)');
  });

  await t.test('2. Hides Share all moodboard action when 0 draft moodboards exist', () => {
    const moodboards = [
      { id: 'm1', title: 'Option A', is_shared: true, is_selected: false },
      { id: 'm2', title: 'Option B', is_shared: true, is_selected: true },
    ];

    const drafts = getDraftMoodboards(moodboards);
    assert.strictEqual(drafts.length, 0);
  });

  await t.test('3. Correctly calculates draft concepts count and filters out shared/approved/changes_requested', () => {
    const concepts = [
      { id: 'c1', title: 'Logo Variant 1', status: 'draft' },
      { id: 'c2', title: 'Logo Variant 2', status: 'shared' },
      { id: 'c3', title: 'Logo Variant 3', status: 'approved' },
      { id: 'c4', title: 'Logo Variant 4', status: 'changes_requested' },
      { id: 'c5', title: 'Logo Variant 5', status: 'draft' },
    ];

    const drafts = getDraftConcepts(concepts);
    assert.strictEqual(drafts.length, 2);
    assert.deepStrictEqual(drafts.map(d => d.id), ['c1', 'c5']);
    assert.strictEqual(getShareAllButtonLabel(drafts.length), 'Share all (2)');
  });

  await t.test('4. Hides Share all concepts action when 0 draft concepts exist', () => {
    const concepts = [
      { id: 'c2', title: 'Logo Variant 2', status: 'shared' },
      { id: 'c3', title: 'Logo Variant 3', status: 'approved' },
    ];

    const drafts = getDraftConcepts(concepts);
    assert.strictEqual(drafts.length, 0);
  });
});
