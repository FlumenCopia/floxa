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

  await t.test('4. PROJECTS uses dot indicator for notification while CHAT uses unread badge counter', () => {
    function resolveNavItemNotification(itemLabel, { visibleNotificationCount, unreadChatCount }) {
      return {
        dot: (itemLabel === 'PROJECTS' || itemLabel === 'Projects') && visibleNotificationCount > 0,
        badge: (itemLabel === 'CHAT' || itemLabel === 'Chat') && unreadChatCount > 0 ? unreadChatCount : null,
      };
    }

    const projectsNotif = resolveNavItemNotification('PROJECTS', { visibleNotificationCount: 5, unreadChatCount: 0 });
    assert.strictEqual(projectsNotif.dot, true);
    assert.strictEqual(projectsNotif.badge, null);

    const chatNotif = resolveNavItemNotification('CHAT', { visibleNotificationCount: 0, unreadChatCount: 3 });
    assert.strictEqual(chatNotif.dot, false);
    assert.strictEqual(chatNotif.badge, 3);
  });

  await t.test('5. Multi-project notification clearance: clicking project clears its dot while preserving unclicked project and PROJECTS tab dot', () => {
    let notifications = [
      { id: 'n1', project_id: 'proj_1', is_read: false, action: 'client_help_requested' },
      { id: 'n2', project_id: 'proj_2', is_read: false, action: 'moodboard_selected' },
    ];

    function getProjectUnreadState(projectId, notifs) {
      return notifs.some((n) => String(n.project_id) === String(projectId) && !n.is_read);
    }

    function getProjectsNavDot(notifs) {
      const visibleCount = notifs.filter((n) => !n.is_read).length;
      return visibleCount > 0;
    }

    // Initially: Both proj_1 and proj_2 have unread dots, and PROJECTS nav has dot
    assert.strictEqual(getProjectUnreadState('proj_1', notifications), true);
    assert.strictEqual(getProjectUnreadState('proj_2', notifications), true);
    assert.strictEqual(getProjectsNavDot(notifications), true);

    // Consultant clicks proj_1 -> project_read event fired for proj_1
    notifications = notifications.map((n) =>
      String(n.project_id) === 'proj_1' ? { ...n, is_read: true } : n
    );

    // After clicking proj_1: proj_1 dot is GONE, proj_2 dot REMAINS, PROJECTS nav dot REMAINS
    assert.strictEqual(getProjectUnreadState('proj_1', notifications), false);
    assert.strictEqual(getProjectUnreadState('proj_2', notifications), true);
    assert.strictEqual(getProjectsNavDot(notifications), true);

    // Consultant clicks proj_2 -> project_read event fired for proj_2
    notifications = notifications.map((n) =>
      String(n.project_id) === 'proj_2' ? { ...n, is_read: true } : n
    );

    // After clicking proj_2: both dots are GONE, PROJECTS nav dot is GONE
    assert.strictEqual(getProjectUnreadState('proj_1', notifications), false);
    assert.strictEqual(getProjectUnreadState('proj_2', notifications), false);
    assert.strictEqual(getProjectsNavDot(notifications), false);
  });

  await t.test('6. CLIENT PORTAL displays help notification dot when client requests assistance', () => {
    function resolveClientNavItems(clientNavItems, notifications = []) {
      const unreadHelpNotifications = notifications.filter(
        (n) => !n.is_read && n.action === 'client_help_requested'
      );
      const unreadHelpCount = unreadHelpNotifications.length;
      const latestHelpNotification = unreadHelpNotifications[0] || null;

      return clientNavItems.map((item) => {
        if (item.label === 'CLIENT PORTAL') {
          let portalRoute = item.route;
          if (latestHelpNotification) {
            const portalToken = latestHelpNotification.portal_token;
            const pageId = latestHelpNotification.page_id;
            const stepMatch = String(pageId || '').match(/\d+/);
            const stepParam = stepMatch ? `&step=${stepMatch[0]}` : '';
            if (portalToken) {
              portalRoute = `/client-portal?token=${encodeURIComponent(portalToken)}&mode=consultant${stepParam}`;
            }
          }

          return {
            ...item,
            route: portalRoute,
            dot: unreadHelpCount > 0,
            dotClass: unreadHelpCount > 0 ? 'nav-dot-help' : '',
          };
        }
        return item;
      });
    }

    const baseItems = [{ label: 'CLIENT PORTAL', icon: 'portal', route: '/client-portal' }];

    // Initially with no help requests
    const initial = resolveClientNavItems(baseItems, []);
    assert.strictEqual(initial[0].dot, false);
    assert.strictEqual(initial[0].dotClass, '');
    assert.strictEqual(initial[0].route, '/client-portal');

    // When client requests help on step 2
    const helpNotifs = [
      {
        id: 'h1',
        action: 'client_help_requested',
        is_read: false,
        portal_token: 'portal_abc_123',
        page_id: 'Step 2',
      },
    ];

    const withHelp = resolveClientNavItems(baseItems, helpNotifs);
    assert.strictEqual(withHelp[0].dot, true);
    assert.strictEqual(withHelp[0].dotClass, 'nav-dot-help');
    assert.strictEqual(withHelp[0].route, '/client-portal?token=portal_abc_123&mode=consultant&step=2');
  });

  await t.test('7. Resolving client help request clears CLIENT PORTAL dot', () => {
    function resolveClientNavItems(clientNavItems, notifications = []) {
      const unreadHelpNotifications = notifications.filter(
        (n) => !n.is_read && n.action === 'client_help_requested'
      );
      const unreadHelpCount = unreadHelpNotifications.length;
      return clientNavItems.map((item) => ({
        ...item,
        dot: unreadHelpCount > 0,
      }));
    }

    const baseItems = [{ label: 'CLIENT PORTAL', icon: 'portal', route: '/client-portal' }];
    let notifs = [
      { id: 'h1', action: 'client_help_requested', is_read: false },
    ];

    assert.strictEqual(resolveClientNavItems(baseItems, notifs)[0].dot, true);

    // Consultant or client resolves help
    notifs = notifs.map((n) => ({ ...n, is_read: true }));
    assert.strictEqual(resolveClientNavItems(baseItems, notifs)[0].dot, false);
  });

  await t.test('8. Excludes outbound consultant actions from notification dropdown while displaying account_reactivated', () => {
    const rawNotifications = [
      { id: '1', action: 'reactivation_requested', actor_type: 'consultant', description: 'Reactivation request submitted', is_read: false },
      { id: '2', action: 'account_reactivated', actor_type: 'system', description: '✅ SuperAdmin approved your reactivation request.', is_read: false },
      { id: '3', action: 'discovery_submitted', actor_type: 'client', description: 'Client submitted discovery', is_read: false },
    ];

    const visibleNotifications = rawNotifications.filter(
      (n) => n && n.visible_to_consultant !== false && n.actor_type !== 'consultant'
    );

    assert.strictEqual(visibleNotifications.length, 2);
    assert.strictEqual(visibleNotifications.some((n) => n.action === 'reactivation_requested'), false);
    assert.strictEqual(visibleNotifications.some((n) => n.action === 'account_reactivated'), true);
  });
});
