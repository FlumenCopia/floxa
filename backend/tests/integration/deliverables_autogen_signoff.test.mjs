process.env.NODE_ENV = 'test';
import http from 'http';
import crypto from 'crypto';
import assert from 'assert';
import fs from 'fs';
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
  console.log('--- Starting Deliverables Auto-Generation & Sign-Off Tests ---');

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const runId = crypto.randomBytes(4).toString('hex');
  const consultantEmail = `consultant_${runId}@floxa.local`;
  const clientEmail = `client_${runId}@floxa.local`;
  const portalToken = `portal_deliv_${runId}`;

  try {
    // 1. Setup consultant, client, and project
    const consultant = await prisma.consultant.create({
      data: {
        email: consultantEmail,
        password: 'password123',
        name: 'AutoGen Consultant',
        company: 'Brand Studio',
      },
    });

    const client = await prisma.client.create({
      data: {
        email: clientEmail,
        name: 'AutoGen Client',
        companyName: 'Apex Innovations',
        sector: 'FinTech',
      },
    });

    const project = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Apex Brand Overhaul',
        companyName: 'Apex Innovations',
        sector: 'FinTech',
        status: 'concepts',
        projectValue: 100000,
        portalToken,
      },
    });

    const consultantTokens = generateTokens(consultant);
    const consultantHeaders = {
      Authorization: `Bearer ${consultantTokens.accessToken}`,
    };

    const clientCookie = `${ENV.PORTAL_ACCESS_COOKIE_NAME}=${signPortalAccessToken(portalToken)}`;
    const clientHeaders = {
      Cookie: clientCookie,
    };

    // 2. Add Brand DNA
    await prisma.brandDNA.create({
      data: {
        projectId: project.id,
        brandPersonalityCluster: 'Modern Authority',
        positioningSummary: 'Next-generation financial infrastructure.',
        businessSummary: 'B2B payment processing platform.',
        targetAudienceSummary: 'Enterprise fintech companies.',
        brandFeelingSummary: 'Trustworthy, efficient, sophisticated.',
      },
    });

    // 3. Add Moodboards (1 selected, 1 unselected)
    const mbSelected = await prisma.moodboard.create({
      data: {
        projectId: project.id,
        title: 'Selected Minimalist Direction',
        description: 'Clean slate tones with high contrast.',
        image: 'moodboards/sample_mb.png',
        isSelected: true,
      },
    });

    const mbOther = await prisma.moodboard.create({
      data: {
        projectId: project.id,
        title: 'Alternate Bold Direction',
        description: 'Vibrant neon gradients.',
        image: 'moodboards/sample_mb2.png',
        isSelected: false,
      },
    });

    // 4. Add Concepts (1 approved with feedback, 1 draft)
    const conceptApproved = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Apex Monogram Mark',
        description: 'A sharp, interlocking geometric monogram.',
        status: 'approved',
        clientFeedback: 'We love this direction! Please proceed with final deliverables.',
        version: 1,
      },
    });

    const conceptDraft = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Alternate Wordmark Route',
        description: 'Custom serif typography route.',
        status: 'draft',
        version: 1,
      },
    });

    // 5. Add Milestones
    const mAdvance = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'advance',
        percentage: 50,
        amount: 50000,
        status: 'paid',
        paidAt: new Date(),
      },
    });

    const mMid = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'mid',
        percentage: 25,
        amount: 25000,
        status: 'paid',
        paidAt: new Date(),
      },
    });

    const mFinal = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'final',
        percentage: 25,
        amount: 25000,
        status: 'requested',
      },
    });

    // Also seed 2 legacy dummy deliverable rows to test cleanup
    await prisma.deliverable.create({
      data: {
        projectId: project.id,
        title: 'Primary Brand Logo Kit (PNG, SVG, Vector)',
        description: 'Master logo suite in dark and light variations',
        file: '',
        status: 'draft',
      },
    });

    console.log('[Test 1] Auto-generate deliverable button click');
    const genRes1 = await request(`/api/projects/${project.id}/deliverables/auto-generate/`, {
      method: 'POST',
      headers: consultantHeaders,
    });

    assert.strictEqual(genRes1.status, 200, `Expected 200, got ${genRes1.status}`);
    assert.ok(genRes1.data.deliverable, 'Expected response to contain deliverable object');
    assert.ok(Array.isArray(genRes1.data.deliverables), 'Expected response to contain deliverables array');
    
    // Crucial check: Exactly 1 deliverable, not 4!
    assert.strictEqual(genRes1.data.deliverables.length, 1, `Expected exactly 1 deliverable, got ${genRes1.data.deliverables.length}`);
    assert.strictEqual(genRes1.data.deliverable.title, 'Brand Delivery Package & Strategy Guide.pdf');
    assert.strictEqual(genRes1.data.deliverable.status, 'draft');
    assert.ok(genRes1.data.deliverable.file_url, 'Expected deliverable to have a valid file_url');

    console.log('✔ Generated exactly 1 deliverable; cleaned up dummy records');

    console.log('[Test 2] Repeated click on Auto-generate deliverable (Upsert check)');
    const genRes2 = await request(`/api/projects/${project.id}/deliverables/auto-generate/`, {
      method: 'POST',
      headers: consultantHeaders,
    });

    assert.strictEqual(genRes2.status, 200);
    assert.strictEqual(genRes2.data.deliverables.length, 1, `Repeated click must not create duplicates! Got ${genRes2.data.deliverables.length}`);
    assert.strictEqual(genRes2.data.deliverable.id, genRes1.data.deliverable.id, 'Expected existing deliverable to be updated in-place');
    console.log('✔ Repeated clicks safely update in-place without creating extra files');

    console.log('[Test 3] Deliverable download by consultant');
    const delivId = genRes1.data.deliverable.id;
    const dlConsultantRes = await request(`/api/projects/${project.id}/deliverables/${delivId}/file/`, {
      headers: consultantHeaders,
    });
    assert.strictEqual(dlConsultantRes.status, 200);
    assert.ok(dlConsultantRes.rawText.startsWith('%PDF-'), 'Expected valid PDF magic bytes');
    console.log('✔ Deliverable PDF file is a valid PDFKit generated document');

    console.log('[Test 4] Client portal view before sharing');
    const clientBeforeShare = await request(`/api/client-portal/${portalToken}/deliverables/`, {
      headers: clientHeaders,
    });
    assert.strictEqual(clientBeforeShare.status, 200);
    assert.strictEqual(clientBeforeShare.data.length, 0, 'Client portal should not show draft deliverable');
    console.log('✔ Draft deliverable is hidden from client portal');

    console.log('[Test 5] Consultant shares deliverable with client');
    const shareRes = await request(`/api/projects/${project.id}/deliverables/${delivId}/share/`, {
      method: 'PATCH',
      headers: consultantHeaders,
    });
    assert.strictEqual(shareRes.status, 200);
    assert.strictEqual(shareRes.data.status, 'shared');

    const clientAfterShare = await request(`/api/client-portal/${portalToken}/deliverables/`, {
      headers: clientHeaders,
    });
    assert.strictEqual(clientAfterShare.status, 200);
    assert.strictEqual(clientAfterShare.data.length, 1);
    assert.strictEqual(clientAfterShare.data[0].id, delivId);
    assert.strictEqual(clientAfterShare.data[0].status, 'shared');
    console.log('✔ Deliverable shared successfully and appears in client portal');

    console.log('[Test 6] Client sign-off blocked if payment is pending');
    const signOffBlocked = await request(`/api/client-portal/${portalToken}/sign-off/`, {
      method: 'POST',
      headers: clientHeaders,
    });
    assert.strictEqual(signOffBlocked.status, 400);
    assert.strictEqual(signOffBlocked.data.detail, 'All payment milestones must be paid before sign-off.');
    console.log('✔ Sign-off blocked when payments are pending');

    console.log('[Test 7] Client sign-off completes project once all payments are settled');
    await prisma.paymentMilestone.update({
      where: { id: mFinal.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    const signOffRes = await request(`/api/client-portal/${portalToken}/sign-off/`, {
      method: 'POST',
      headers: clientHeaders,
    });
    assert.strictEqual(signOffRes.status, 200);
    assert.strictEqual(signOffRes.data.client_signed_off, true);
    assert.strictEqual(signOffRes.data.status, 'delivered');
    assert.strictEqual(signOffRes.data.progress, 100);
    assert.ok(signOffRes.data.signed_off_at, 'Expected signed_off_at timestamp');

    // Verify in DB
    const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
    assert.strictEqual(dbProject.clientSignedOff, true);
    assert.strictEqual(dbProject.status, 'delivered');
    assert.strictEqual(dbProject.progress, 100);

    // Verify activity logged
    const activity = await prisma.projectActivity.findFirst({
      where: { projectId: project.id, action: 'project_signed_off' },
    });
    assert.ok(activity, 'Expected project_signed_off activity in DB');
    assert.strictEqual(activity.actorType, 'client');
    assert.strictEqual(activity.visibleToClient, true);

    console.log('✔ Client sign-off successfully completed project and updated status to delivered');

    console.log('[Test 8] Idempotent sign-off');
    const idempotentSignOff = await request(`/api/client-portal/${portalToken}/sign-off/`, {
      method: 'POST',
      headers: clientHeaders,
    });
    assert.strictEqual(idempotentSignOff.status, 200);
    assert.strictEqual(idempotentSignOff.data.client_signed_off, true);
    console.log('✔ Idempotent sign-off returns current delivered project');

    // Clean up
    await prisma.projectActivity.deleteMany({ where: { projectId: project.id } });
    await prisma.paymentMilestone.deleteMany({ where: { projectId: project.id } });
    await prisma.concept.deleteMany({ where: { projectId: project.id } });
    await prisma.moodboard.deleteMany({ where: { projectId: project.id } });
    await prisma.brandDNA.deleteMany({ where: { projectId: project.id } });
    await prisma.deliverable.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.consultant.delete({ where: { id: consultant.id } });

    console.log('--- ALL DELIVERABLES AUTOGEN & SIGN-OFF TESTS PASSED ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
