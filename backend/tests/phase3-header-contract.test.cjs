'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { serializeProject, serializeProjectActivity, serializeClientPortalActivity } = require('../dist/utils/serializer.js');

test('Phase 3: FloxaHeader & API Contract Compatibility', async (t) => {
  await t.test('3.1 Project serialization conforms to frontend contract', () => {
    const mockProject = {
      _id: '65f000000000000000000001',
      id: '65f000000000000000000001',
      title: 'Contract Test Project',
      companyName: 'Acme Test Corp',
      sector: 'Branding',
      status: 'discovery',
      progress: 35,
      portalToken: 'portal_tok_123',
      consultantId: '65f000000000000000000002',
      client: {
        _id: '65f000000000000000000003',
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const serialized = serializeProject(mockProject);

    assert.strictEqual(serialized.id, '65f000000000000000000001');
    assert.strictEqual(serialized.title, 'Contract Test Project');
    assert.strictEqual(serialized.company_name, 'Acme Test Corp');
    assert.strictEqual(serialized.client_name, 'Jane Doe');
    assert.strictEqual(serialized.client_email, 'jane@example.com');
    assert.strictEqual(serialized.progress, 35);
    assert.strictEqual(serialized.portal_token, 'portal_tok_123');
  });

  await t.test('3.2 Activity notification serialization matches FloxaHeader live notification expectations', () => {
    const mockActivity = {
      _id: '65f000000000000000000010',
      id: '65f000000000000000000010',
      projectId: '65f000000000000000000001',
      project: {
        _id: '65f000000000000000000001',
        title: 'Notification Test Project',
        companyName: 'Notification Corp',
        portalToken: 'portal_tok_notification',
      },
      actorType: 'client',
      action: 'client_help_requested',
      description: 'Client requested live assistance on Discovery step',
      metadata: { page_id: 'Step 2', field_key: 'company_vision' },
      isRead: false,
      visibleToConsultant: true,
      visibleToClient: true,
      createdAt: new Date('2026-02-01T12:00:00.000Z'),
    };

    const consultantNotif = serializeProjectActivity(mockActivity);

    assert.strictEqual(consultantNotif.id, '65f000000000000000000010');
    assert.strictEqual(consultantNotif.project_id, '65f000000000000000000001');
    assert.strictEqual(consultantNotif.project_name, 'Notification Corp');
    assert.strictEqual(consultantNotif.action, 'client_help_requested');
    assert.strictEqual(consultantNotif.is_read, false);
    assert.strictEqual(consultantNotif.actor_type, 'client');

    const clientNotif = serializeClientPortalActivity(mockActivity);
    assert.strictEqual(clientNotif.id, '65f000000000000000000010');
    assert.strictEqual(clientNotif.action, 'client_help_requested');
    assert.strictEqual(clientNotif.metadata.page_id, 'Step 2');
  });
});
