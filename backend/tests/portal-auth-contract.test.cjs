const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

describe('Portal Authentication Contract: Strict Client Email & Password Verification', () => {
  const portalTokenA = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa';
  const portalTokenB = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb';

  const clientEmail = 'nidhin@gmail.com';
  const passwordA = 'nidhin123';
  const passwordB = 'akash123';

  let clientDocId;

  before(async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/floxa_db');
    const Project = mongoose.connection.collection('projects');
    const Client = mongoose.connection.collection('clients');

    await Client.deleteMany({ email: clientEmail });
    await Project.deleteMany({ portalToken: { $in: [portalTokenA, portalTokenB] } });

    const clientRes = await Client.insertOne({
      name: 'Nidhin Client',
      email: clientEmail,
      companyName: 'Nidhin Project A & B',
      sector: 'Branding',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    clientDocId = clientRes.insertedId;

    const hashA = await bcrypt.hash(passwordA, 10);
    const hashB = await bcrypt.hash(passwordB, 10);

    // Project A: email nidhin@gmail.com, password nidhin123
    await Project.insertOne({
      consultantId: new mongoose.Types.ObjectId(),
      clientId: clientDocId,
      title: 'Project Alpha',
      companyName: 'Alpha Corp',
      sector: 'Design',
      portalToken: portalTokenA,
      portalPasswordHash: hashA,
      isArchived: false,
      progress: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Project B: email nidhin@gmail.com, password akash123
    await Project.insertOne({
      consultantId: new mongoose.Types.ObjectId(),
      clientId: clientDocId,
      title: 'Project Beta',
      companyName: 'Beta Corp',
      sector: 'Design',
      portalToken: portalTokenB,
      portalPasswordHash: hashB,
      isArchived: false,
      progress: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  after(async () => {
    const Project = mongoose.connection.collection('projects');
    const Client = mongoose.connection.collection('clients');
    await Client.deleteMany({ email: clientEmail });
    await Project.deleteMany({ portalToken: { $in: [portalTokenA, portalTokenB] } });
    await mongoose.disconnect();
  });

  test('1. Empty credentials return 400 Bad Request', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenA}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.detail, /enter both your client email address and portal password/i);
  });

  test('2. Wrong email with correct password returns 401 Unauthorized', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenA}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other_client@gmail.com', password: passwordA })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.detail, /invalid email address or portal password/i);
  });

  test('3. Project A rejects Project B password (akash123) with 401', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenA}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: passwordB })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.detail, /invalid email address or portal password/i);
  });

  test('4. Project B rejects Project A password (nidhin123) with 401', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenB}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: passwordA })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.detail, /invalid email address or portal password/i);
  });

  test('5. Project A accepts matching email and password (nidhin@gmail.com + nidhin123) with 200', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenA}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: passwordA })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
    const cookie = res.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('floxa_portal_access'));
  });

  test('6. Project B accepts matching email and password (nidhin@gmail.com + akash123) with 200', async () => {
    const res = await fetch(`http://localhost:5000/api/client-portal/${portalTokenB}/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: clientEmail, password: passwordB })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.token);
    const cookie = res.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('floxa_portal_access'));
  });
});
