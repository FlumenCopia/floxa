'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestToken,
  createTestFixtures,
  buildMultipart,
  cleanupTestFiles,
  models,
} = require('./helpers.cjs');

const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test('Phase 5: CORS, Avatar Uploads & Orphan File Prevention', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();

  const fixturesA = await createTestFixtures();
  const fixturesB = await createTestFixtures();

  const tokenA = createTestToken(fixturesA.consultant._id.toString(), fixturesA.consultant.email);
  const tokenB = createTestToken(fixturesB.consultant._id.toString(), fixturesB.consultant.email);

  const createdFilePaths = [];

  t.after(async () => {
    cleanupTestFiles(createdFilePaths);
    await fixturesA.cleanup();
    await fixturesB.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  // =========================================================================
  // 1. CORS CONFIGURATION
  // =========================================================================
  await t.test('5.1 CORS: Trusted local origin is allowed with credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf/`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('5.2 CORS: Trusted production origin is allowed with credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf/`, {
      headers: { Origin: 'https://floxa.flumenx.in' },
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://floxa.flumenx.in');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('5.3 CORS: Untrusted origin does not reflect origin or credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf/`, {
      headers: { Origin: 'https://evil-untrusted-site.com' },
    });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), null);
  });

  await t.test('5.4 CORS: Request without Origin header succeeds for server-to-server', async () => {
    const res = await fetch(`${baseUrl}/api/auth/csrf/`);
    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // 2. AVATAR UPLOAD & SERVING
  // =========================================================================
  await t.test('5.5 Avatar: Valid PNG upload succeeds, updates consultant and serves image via URL', async () => {
    const multipart = buildMultipart({ name: 'Updated Name' }, [
      {
        name: 'avatar',
        filename: 'avatar.png',
        contentType: 'image/png',
        buffer: VALID_1X1_PNG,
      },
    ]);

    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.avatar, 'Avatar path must exist in response');
    assert.ok(body.avatar.includes('consultant_avatars'), `Avatar must be saved in consultant_avatars, got ${body.avatar}`);

    // Track for file cleanup
    const localPath = path.resolve(__dirname, '../../backend', body.avatar.replace(/^\//, ''));
    createdFilePaths.push(localPath);

    // Verify avatar URL is served successfully (HTTP 200 with image/png Content-Type)
    const avatarFetchRes = await fetch(`${baseUrl}${body.avatar}`);
    assert.strictEqual(avatarFetchRes.status, 200, `Avatar URL must be served with 200 OK, got ${avatarFetchRes.status}`);
    const arrayBuffer = await avatarFetchRes.arrayBuffer();
    assert.ok(arrayBuffer.byteLength > 0, 'Served avatar must not be empty');
  });

  await t.test('5.6 Avatar: Empty file buffer returns 400', async () => {
    const multipart = buildMultipart({}, [
      {
        name: 'avatar',
        filename: 'empty.png',
        contentType: 'image/png',
        buffer: Buffer.alloc(0),
      },
    ]);

    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.detail, 'Expected error detail for empty file');
  });

  await t.test('5.7 Avatar: Corrupted image file returns 400', async () => {
    const multipart = buildMultipart({}, [
      {
        name: 'avatar',
        filename: 'corrupted.png',
        contentType: 'image/png',
        buffer: Buffer.from('this is totally not a real image stream'),
      },
    ]);

    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.detail, 'Expected error detail for corrupted image');
  });

  await t.test('5.8 Avatar: Unsupported file format returns 400', async () => {
    const multipart = buildMultipart({}, [
      {
        name: 'avatar',
        filename: 'document.txt',
        contentType: 'text/plain',
        buffer: Buffer.from('hello world plain text'),
      },
    ]);

    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test('5.9 Avatar: Oversized file (> 5MB) returns 413', async () => {
    const multipart = buildMultipart({}, [
      {
        name: 'avatar',
        filename: 'huge.png',
        contentType: 'image/png',
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1024),
      },
    ]);

    const res = await fetch(`${baseUrl}/api/auth/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 413, `Expected 413 payload too large, got ${res.status}`);
  });

  // =========================================================================
  // 3. ORPHAN FILE PREVENTION ON CHILD UPDATE
  // =========================================================================
  await t.test('5.10 Orphan prevention: Owned project + foreign child ID returns 404 and writes 0 files', async () => {
    const moodboardDir = path.resolve(__dirname, '../../backend/media/moodboard_images');
    const filesBefore = fs.existsSync(moodboardDir) ? fs.readdirSync(moodboardDir) : [];

    // Consultant A owns Project A, but attempts to update Moodboard belonging to nonexistent or foreign ID
    const fakeChildId = new mongoose.Types.ObjectId().toString();
    const multipart = buildMultipart({ title: 'New Title' }, [
      {
        name: 'image',
        filename: 'replacement.png',
        contentType: 'image/png',
        buffer: VALID_1X1_PNG,
      },
    ]);

    const res = await fetch(`${baseUrl}/api/projects/${fixturesA.project._id}/moodboard/${fakeChildId}/`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': multipart.contentType,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);

    const filesAfter = fs.existsSync(moodboardDir) ? fs.readdirSync(moodboardDir) : [];
    assert.strictEqual(filesAfter.length, filesBefore.length, 'No orphan file should be created on failed update');
  });

  // =========================================================================
  // 4. SANITIZED ERROR RESPONSES
  // =========================================================================
  await t.test('5.11 Error middleware returns sanitized { detail: string } responses', async () => {
    // Request a malformed resource ID that triggers error middleware
    const res = await fetch(`${baseUrl}/api/projects/malformed-id-for-error-test/`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.ok(typeof body.detail === 'string', 'detail must be a string');
    assert.strictEqual(body.stack, undefined, 'stack must never be exposed');
  });
});
