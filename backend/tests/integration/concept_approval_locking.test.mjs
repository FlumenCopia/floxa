process.env.NODE_ENV = 'test';
import http from 'http';
import crypto from 'crypto';
import assert from 'assert';
import { prisma } from '../../dist/prisma/client.js';
import { app } from '../../dist/app.js';
import { generateTokens } from '../../dist/services/auth.service.js';
import { signPortalAccessToken } from '../../dist/utils/crypto.js';
import { ENV } from '../../dist/config/env.js';

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        body = JSON.stringify(body);
      }
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const rawText = buffer.toString('utf8');
          let parsed = rawText;
          try {
            parsed = JSON.parse(rawText);
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
            rawText,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Concept Approval & Consultant Locking Test Suite ---');

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const createdConsultantIds = [];
  const createdClientIds = [];
  const createdProjectIds = [];

  try {
    const runId = crypto.randomBytes(4).toString('hex');

    // 1. Setup consultant
    const consultant = await prisma.consultant.create({
      data: {
        email: `concept_test_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Concept Consultant',
        company: 'Design Studio',
      },
    });
    createdConsultantIds.push(consultant.id);
    const consultantToken = generateTokens(consultant.id).accessToken;
    const consultantHeaders = {
      Authorization: `Bearer ${consultantToken}`,
      'Content-Type': 'application/json',
    };

    // 2. Setup client & project
    const client = await prisma.client.create({
      data: {
        name: 'Concept Client',
        email: `client_${runId}@test.com`,
        companyName: 'Concept Brand Ltd',
        sector: 'Retail',
      },
    });
    createdClientIds.push(client.id);

    const portalToken = `pt-concept-${runId}`;
    const project = await prisma.project.create({
      data: {
        title: 'Brand Concept Project',
        companyName: 'Concept Brand Ltd',
        sector: 'Retail',
        consultantId: consultant.id,
        clientId: client.id,
        portalToken,
        portalPasswordHash: 'pbkdf2_sha256$testpass',
        status: 'concepts',
        projectValue: 50000,
        isArchived: false,
      },
    });
    createdProjectIds.push(project.id);

    const clientToken = signPortalAccessToken(portalToken);
    const clientHeaders = {
      Cookie: `${ENV.PORTAL_ACCESS_COOKIE_NAME}=${clientToken}`,
      'x-portal-access-token': clientToken,
      'Content-Type': 'application/json',
    };

    console.log('[Test 1] Consultant uploads concept (starts in draft)');
    const concept1 = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Modern Minimalist Route',
        description: 'Clean lines, bold typography',
        version: 1,
        status: 'draft',
      },
    });

    // Consultant sharing concept
    console.log('[Test 2] Consultant shares concept with client');
    const shareRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/share/`, {
      method: 'PATCH',
      headers: consultantHeaders,
    });
    assert.strictEqual(shareRes.status, 200, `Expected 200, got ${shareRes.status}: ${JSON.stringify(shareRes.data)}`);
    assert.strictEqual(shareRes.data.status, 'shared', 'Expected concept status to be shared');

    // Verify concept is visible in client portal
    console.log('[Test 3] Client fetches concepts from portal');
    const getRes = await request(`/api/client-portal/${portalToken}/concepts/`, {
      method: 'GET',
      headers: clientHeaders,
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(Array.isArray(getRes.data), true);
    const foundConcept = getRes.data.find((c) => c.id === concept1.id);
    assert.ok(foundConcept, 'Shared concept should be returned to client');
    assert.strictEqual(foundConcept.status, 'shared');

    // Client requests changes on concept
    console.log('[Test 4] Client requests changes on shared concept');
    const requestChangesRes = await request(`/api/client-portal/${portalToken}/concepts/${concept1.id}/feedback/`, {
      method: 'POST',
      headers: clientHeaders,
      body: { action: 'changes_requested', feedback: 'Please try warmer color accents.' },
    });
    assert.strictEqual(requestChangesRes.status, 200);
    assert.strictEqual(requestChangesRes.data.status, 'changes_requested');
    assert.strictEqual(requestChangesRes.data.client_feedback, 'Please try warmer color accents.');

    // Consultant can edit changes_requested concept (resets to draft)
    console.log('[Test 5] Consultant edits concept with changes_requested (transitions back to draft)');
    const updateRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/`, {
      method: 'PATCH',
      headers: consultantHeaders,
      body: { title: 'Modern Minimalist Route (Warm Accents)' },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.status, 'draft', 'Editing changes_requested concept should move it back to draft');
    assert.strictEqual(updateRes.data.title, 'Modern Minimalist Route (Warm Accents)');

    // Consultant re-shares concept
    console.log('[Test 6] Consultant re-shares the updated concept');
    const reshareRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/share/`, {
      method: 'PATCH',
      headers: consultantHeaders,
    });
    assert.strictEqual(reshareRes.status, 200);
    assert.strictEqual(reshareRes.data.status, 'shared');

    // Client approves concept with action: 'approved'
    console.log('[Test 7] Client approves concept with { action: "approved" }');
    const approveRes = await request(`/api/client-portal/${portalToken}/concepts/${concept1.id}/feedback/`, {
      method: 'POST',
      headers: clientHeaders,
      body: { action: 'approved' },
    });
    assert.strictEqual(approveRes.status, 200, `Expected 200, got ${approveRes.status}: ${JSON.stringify(approveRes.data)}`);
    assert.strictEqual(approveRes.data.status, 'approved', 'Status must transition to approved');
    assert.strictEqual(approveRes.data.client_feedback, '', 'Client feedback should be cleared on approval');

    // Verify in database
    const dbConceptAfterApproval = await prisma.concept.findUnique({
      where: { id: concept1.id },
    });
    assert.strictEqual(dbConceptAfterApproval.status, 'approved', 'DB status must be approved');

    // Verify activity logged
    const activity = await prisma.projectActivity.findFirst({
      where: {
        projectId: project.id,
        action: 'concept_approved',
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(activity, 'concept_approved activity must be logged');
    assert.ok(activity.description.includes('approved concept'), 'Description should state client approved');

    // Client re-approving is idempotent (returns 200 with approved status)
    console.log('[Test 8] Client re-approving is idempotent');
    const reApproveRes = await request(`/api/client-portal/${portalToken}/concepts/${concept1.id}/feedback/`, {
      method: 'POST',
      headers: clientHeaders,
      body: { action: 'approved' },
    });
    assert.strictEqual(reApproveRes.status, 200);
    assert.strictEqual(reApproveRes.data.status, 'approved');

    // Client cannot request changes on approved concept
    console.log('[Test 9] Client cannot request changes on already-approved concept (locked)');
    const changeApprovedRes = await request(`/api/client-portal/${portalToken}/concepts/${concept1.id}/feedback/`, {
      method: 'POST',
      headers: clientHeaders,
      body: { action: 'changes_requested', feedback: 'Change your mind' },
    });
    assert.strictEqual(changeApprovedRes.status, 400);
    assert.strictEqual(
      changeApprovedRes.data.detail,
      'Approved concepts are locked and cannot receive further feedback.'
    );

    // Consultant side locking:
    console.log('[Test 10] Consultant cannot edit approved concept (locked)');
    const editApprovedRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/`, {
      method: 'PATCH',
      headers: consultantHeaders,
      body: { title: 'Attempted title change' },
    });
    assert.strictEqual(editApprovedRes.status, 400);
    assert.strictEqual(editApprovedRes.data.detail, 'Approved concepts cannot be edited.');

    console.log('[Test 11] Consultant cannot delete approved concept (locked)');
    const deleteApprovedRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/`, {
      method: 'DELETE',
      headers: consultantHeaders,
    });
    assert.strictEqual(deleteApprovedRes.status, 400);
    assert.strictEqual(deleteApprovedRes.data.detail, 'Approved concepts cannot be deleted.');

    console.log('[Test 12] Consultant cannot re-share approved concept (locked)');
    const shareApprovedRes = await request(`/api/projects/${project.id}/concepts/${concept1.id}/share/`, {
      method: 'PATCH',
      headers: consultantHeaders,
    });
    assert.strictEqual(shareApprovedRes.status, 400);
    assert.strictEqual(shareApprovedRes.data.detail, 'Approved concepts cannot be shared again.');

    console.log('[Test 13] Consultant concepts list returns status: "approved"');
    const consultantListRes = await request(`/api/projects/${project.id}/concepts/`, {
      method: 'GET',
      headers: consultantHeaders,
    });
    assert.strictEqual(consultantListRes.status, 200);
    const consultantFound = consultantListRes.data.find((c) => c.id === concept1.id);
    assert.ok(consultantFound);
    assert.strictEqual(consultantFound.status, 'approved', 'Status must be approved for frontend Locked badge');

    // Test with action: 'approve' alias
    console.log('[Test 14] Test action: "approve" alias on a second concept');
    const concept2 = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Alternative Concept 2',
        description: 'Vibrant geometric route',
        version: 2,
        status: 'shared',
      },
    });

    const approveAliasRes = await request(`/api/client-portal/${portalToken}/concepts/${concept2.id}/feedback/`, {
      method: 'POST',
      headers: clientHeaders,
      body: { action: 'approve' },
    });
    assert.strictEqual(approveAliasRes.status, 200);
    assert.strictEqual(approveAliasRes.data.status, 'approved');

    // Deliverables summary includes approved concepts
    console.log('[Test 15] Deliverables summary reflects approved concepts');
    const summaryRes = await request(`/api/projects/${project.id}/deliverables/summary/`, {
      method: 'GET',
      headers: consultantHeaders,
    });
    assert.strictEqual(summaryRes.status, 200);
    assert.ok(summaryRes.data.approved_concepts, 'Deliverables summary should include approved_concepts');
    assert.ok(summaryRes.data.approved_concepts.some((c) => c.id === concept1.id && c.status === 'approved'));

    console.log('\n--- ALL CONCEPT APPROVAL & LOCKING TESTS PASSED! ---');
  } finally {
    // Cleanup fixtures
    for (const pid of createdProjectIds) {
      await prisma.projectActivity.deleteMany({ where: { projectId: pid } });
      await prisma.concept.deleteMany({ where: { projectId: pid } });
      await prisma.paymentMilestone.deleteMany({ where: { projectId: pid } });
      await prisma.project.deleteMany({ where: { id: pid } });
    }
    for (const cid of createdClientIds) {
      await prisma.client.deleteMany({ where: { id: cid } });
    }
    for (const cid of createdConsultantIds) {
      await prisma.consultant.deleteMany({ where: { id: cid } });
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
