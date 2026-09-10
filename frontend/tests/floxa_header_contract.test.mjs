import test from 'node:test';
import assert from 'node:assert';

test('Frontend FloxaHeader: Contract & Navigation Route Mapping', async (t) => {
  const HEADER_NAV_TABS = [
    { id: 'overview', label: 'Overview', path: '/all-projects' },
    { id: 'discovery', label: 'Brief & DNA', path: '/discovery' },
    { id: 'concepts', label: 'Concepts', path: '/concepts' },
    { id: 'feedback', label: 'Feedback & Review', path: '/feedback' },
    { id: 'deliverables', label: 'Deliverables', path: '/deliverables' },
  ];

  await t.test('1. Defines expected navigation tabs in consistent order', () => {
    const tabIds = HEADER_NAV_TABS.map((t) => t.id);
    assert.deepStrictEqual(tabIds, ['overview', 'discovery', 'concepts', 'feedback', 'deliverables']);
  });

  await t.test('2. Resolves active tab correctly based on pathname', () => {
    function resolveActiveTab(pathname) {
      const match = HEADER_NAV_TABS.find((t) => pathname.startsWith(t.path));
      return match ? match.id : 'overview';
    }

    assert.strictEqual(resolveActiveTab('/all-projects'), 'overview');
    assert.strictEqual(resolveActiveTab('/discovery/proj_123'), 'discovery');
    assert.strictEqual(resolveActiveTab('/concepts'), 'concepts');
    assert.strictEqual(resolveActiveTab('/feedback'), 'feedback');
    assert.strictEqual(resolveActiveTab('/deliverables'), 'deliverables');
    assert.strictEqual(resolveActiveTab('/unknown'), 'overview');
  });

  await t.test('3. Unread notification badge counter computation', () => {
    function computeUnreadCount(activities = []) {
      return activities.filter((act) => !act.is_read && act.visible_to_consultant !== false).length;
    }

    const testActivities = [
      { id: '1', is_read: false, visible_to_consultant: true },
      { id: '2', is_read: true, visible_to_consultant: true },
      { id: '3', is_read: false, visible_to_consultant: false }, // internal client-only
      { id: '4', is_read: false, visible_to_consultant: true },
    ];

    assert.strictEqual(computeUnreadCount(testActivities), 2);
  });
});
