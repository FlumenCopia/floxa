'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestFixtures,
  createTestToken,
  models,
} = require('./helpers.cjs');

test('Phase 6: Real-Time WhatsApp Chat System Tests', async (t) => {
  let serverInfo;
  let fixtures;
  let token1;

  t.before(async () => {
    await connectTestDatabase();
    serverInfo = await startTestServer();

    fixtures = await createTestFixtures();
    token1 = createTestToken(fixtures.consultant._id, fixtures.consultant.email);
  });

  t.after(async () => {
    await models.ChatMessage.deleteMany({ projectId: fixtures.project._id });
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('6.1 ChatMessage model persists and queries correctly', async () => {
    const msg = await models.ChatMessage.create({
      projectId: fixtures.project._id,
      consultantId: fixtures.consultant._id,
      senderRole: 'client',
      senderName: 'Chat Client Inc',
      text: 'Hello from client!',
      status: 'sent',
    });

    assert.ok(msg._id);
    assert.equal(msg.text, 'Hello from client!');
    assert.equal(msg.senderRole, 'client');
    assert.equal(msg.status, 'sent');
  });

  await t.test('6.2 GET /api/projects/chat/conversations returns aggregated conversation list', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/projects/chat/conversations/`, {
      headers: {
        Authorization: `Bearer ${token1}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.conversations));

    const found = data.conversations.find((c) => String(c.projectId) === String(fixtures.project._id));
    assert.ok(found, 'Should contain project in conversation list');
    assert.ok(found.lastMessage, 'Should have lastMessage populated');
    assert.equal(found.lastMessage.text, 'Hello from client!');
    assert.equal(found.unreadCount, 1, 'Should have 1 unread message for consultant');
  });

  await t.test('6.3 GET /api/projects/:id/messages returns message history', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/projects/${fixtures.project._id}/messages/`, {
      headers: {
        Authorization: `Bearer ${token1}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.messages));
    assert.ok(data.messages.length >= 1);
    assert.equal(data.messages[0].text, 'Hello from client!');
  });

  await t.test('6.4 POST /api/projects/:id/messages/read marks client messages as read', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/projects/${fixtures.project._id}/messages/read/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    const checkMsg = await models.ChatMessage.findOne({ projectId: fixtures.project._id, senderRole: 'client' });
    assert.equal(checkMsg.status, 'read');
    assert.ok(checkMsg.readAt);
  });

  await t.test('6.5 GET /api/client-portal/:token/messages returns messages to client portal', async () => {
    // Consultant sends a message
    await models.ChatMessage.create({
      projectId: fixtures.project._id,
      consultantId: fixtures.consultant._id,
      senderRole: 'consultant',
      senderName: 'Chat Consultant',
      text: 'Hello from consultant reply!',
      status: 'sent',
    });

    const res = await fetch(`${serverInfo.baseUrl}/api/client-portal/${fixtures.project.portalToken}/messages/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.messages));
    assert.equal(data.messages.length, 2);
  });

  await t.test('6.6 POST /api/client-portal/:token/messages/read marks consultant messages read', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/client-portal/${fixtures.project.portalToken}/messages/read/`, {
      method: 'POST',
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    const checkMsg = await models.ChatMessage.findOne({ projectId: fixtures.project._id, senderRole: 'consultant' });
    assert.equal(checkMsg.status, 'read');
    assert.ok(checkMsg.readAt);
  });

  await t.test('6.7 POST /api/projects/:id/messages/upload/ uploads voice note and returns media metadata', async () => {
    const FormData = require('form-data');
    const form = new FormData();
    const fakeAudioBuffer = Buffer.from('FAKE_WEBM_AUDIO_DATA_FOR_TESTING');
    form.append('file', fakeAudioBuffer, {
      filename: 'voice_recording.webm',
      contentType: 'audio/webm',
    });
    form.append('duration', '6');

    const res = await fetch(`${serverInfo.baseUrl}/api/projects/${fixtures.project._id}/messages/upload/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer(),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.mediaUrl);
    assert.equal(data.messageType, 'voice');
    assert.equal(data.mediaDuration, 6);
    assert.ok(data.mediaUrl.startsWith('/media/chat_attachments/'));

    // Verify static serving works for chat_attachments
    const mediaRes = await fetch(`${serverInfo.baseUrl}${data.mediaUrl}`);
    assert.equal(mediaRes.status, 200);
  });

  await t.test('6.8 POST /api/client-portal/:token/messages/upload/ uploads client photo/file attachment', async () => {
    const FormData = require('form-data');
    const form = new FormData();
    const fakeImageBuffer = Buffer.from('FAKE_JPEG_IMAGE_DATA');
    form.append('file', fakeImageBuffer, {
      filename: 'client_photo.jpg',
      contentType: 'image/jpeg',
    });

    const res = await fetch(`${serverInfo.baseUrl}/api/client-portal/${fixtures.project.portalToken}/messages/upload/`, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form.getBuffer(),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.mediaUrl);
    assert.equal(data.messageType, 'image');
    assert.ok(data.mediaUrl.startsWith('/media/chat_attachments/'));
  });

  await t.test('6.9 Fallback POST accepts mediaUrl and messageType', async () => {
    const res = await fetch(`${serverInfo.baseUrl}/api/projects/${fixtures.project._id}/messages/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Listen to this voice message',
        messageType: 'voice',
        mediaUrl: '/media/chat_attachments/test_voice.webm',
        mediaDuration: 12,
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.message);
    assert.equal(data.message.messageType, 'voice');
    assert.equal(data.message.mediaDuration, 12);
  });
});
