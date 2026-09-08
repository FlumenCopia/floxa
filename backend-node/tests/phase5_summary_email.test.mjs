process.env.NODE_ENV = 'test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { prisma } from '../dist/prisma/client.js';
import { app } from '../dist/app.js';
import { generateTokens } from '../dist/services/auth.service.js';
import { setTestEmailDispatcher } from '../dist/services/email.service.js';
import { ENV } from '../dist/config/env.js';

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
            buffer,
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

function proxyRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = {
      Origin: 'http://localhost:3000',
      Referer: 'http://localhost:3000/',
      ...(options.headers || {}),
    };
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
        if ((res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return proxyRequest(redirectUrl, options).then(resolve, reject);
        }

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
  console.log('--- STARTING PHASE 5 TESTS: DELIVERABLES SUMMARY & SIGNED-AGREEMENT EMAIL RETRY ---');

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
  const createdTempFiles = [];

  // Mail spy
  let dispatchedEmails = [];
  let dispatcherErrorToThrow = null;
  let dispatcherDelayMs = 0;

  setTestEmailDispatcher(async (params) => {
    if (dispatcherDelayMs > 0) {
      await new Promise((r) => setTimeout(r, dispatcherDelayMs));
    }
    if (dispatcherErrorToThrow) {
      throw dispatcherErrorToThrow;
    }
    dispatchedEmails.push(params);
  });

  try {
    const runId = crypto.randomBytes(4).toString('hex');

    // 1. Setup Consultant A and B
    const consultantA = await prisma.consultant.create({
      data: {
        email: `phase5_cons_a_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant A',
        company: 'Design Studio A',
      },
    });
    createdConsultantIds.push(consultantA.id);
    const tokenA = generateTokens(consultantA.id).accessToken;
    const authHeadersA = { Authorization: `Bearer ${tokenA}` };

    const consultantB = await prisma.consultant.create({
      data: {
        email: `phase5_cons_b_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant B',
        company: 'Design Studio B',
      },
    });
    createdConsultantIds.push(consultantB.id);
    const tokenB = generateTokens(consultantB.id).accessToken;
    const authHeadersB = { Authorization: `Bearer ${tokenB}` };

    // 2. Setup Client and Project A
    const clientA = await prisma.client.create({
      data: {
        name: 'Client Alpha',
        email: `client_alpha_${runId}@test.com`,
        companyName: 'Alpha Brands Ltd',
        sector: 'Retail',
      },
    });
    createdClientIds.push(clientA.id);

    const projectA = await prisma.project.create({
      data: {
        title: 'Alpha Rebranding',
        companyName: 'Alpha Brands Ltd',
        sector: 'Retail',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: `pt-alpha-${runId}`,
        status: 'concepts',
        projectValue: 100000,
        isArchived: false,
      },
    });
    createdProjectIds.push(projectA.id);

    // Also create Client Profile
    await prisma.clientProfile.create({
      data: {
        projectId: projectA.id,
        clientName: 'Alice Alpha',
        companyName: 'Alpha Brands Ltd',
        email: `alice_${runId}@alphabrands.com`,
      },
    });

    // Setup Empty Project E (for empty tests)
    const projectEmpty = await prisma.project.create({
      data: {
        title: 'Empty Project',
        companyName: 'Empty Inc',
        sector: 'General',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: `pt-empty-${runId}`,
        status: 'created',
        projectValue: 20000,
        isArchived: false,
      },
    });
    createdProjectIds.push(projectEmpty.id);

    // Setup Archived Project
    const projectArchived = await prisma.project.create({
      data: {
        title: 'Archived Project',
        companyName: 'Archived Inc',
        sector: 'General',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: `pt-archived-${runId}`,
        status: 'archived',
        projectValue: 30000,
        isArchived: true,
      },
    });
    createdProjectIds.push(projectArchived.id);

    // ==========================================
    // PART 1: DELIVERABLES SUMMARY TESTS
    // ==========================================

    console.log('--- Test 1.1: Unauthenticated request to deliverables summary ---');
    {
      const res = await request(`/api/projects/${projectA.id}/deliverables/summary/`);
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      console.log('✓ Unauthenticated request rejected with 401');
    }

    console.log('--- Test 1.2: Cross-consultant access denied (Consultant B on Project A) ---');
    {
      const res = await request(`/api/projects/${projectA.id}/deliverables/summary/`, {
        headers: authHeadersB,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Project not found.');
      console.log('✓ Cross-consultant request returned 404');
    }

    console.log('--- Test 1.3: Archived project deliverables summary returned 404 ---');
    {
      const res = await request(`/api/projects/${projectArchived.id}/deliverables/summary/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Project not found.');
      console.log('✓ Archived project summary returned 404');
    }

    console.log('--- Test 1.4: Non-existent project ID returns 404 ---');
    {
      const fakeId = '66f123456789012345678901';
      const res = await request(`/api/projects/${fakeId}/deliverables/summary/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      console.log('✓ Non-existent project returned 404');
    }

    console.log('--- Test 1.5: Empty project summary returns 200 with 4 empty arrays ---');
    {
      const res = await request(`/api/projects/${projectEmpty.id}/deliverables/summary/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.data.selected_moodboards), 'selected_moodboards should be an array');
      assert.strictEqual(res.data.selected_moodboards.length, 0);
      assert(Array.isArray(res.data.approved_concepts), 'approved_concepts should be an array');
      assert.strictEqual(res.data.approved_concepts.length, 0);
      assert(Array.isArray(res.data.payment_milestones), 'payment_milestones should be an array');
      assert.strictEqual(res.data.payment_milestones.length, 0);
      assert(Array.isArray(res.data.deliverables), 'deliverables should be an array');
      assert.strictEqual(res.data.deliverables.length, 0);
      console.log('✓ Empty project returns 200 with empty arrays');
    }

    console.log('--- Test 1.6: Populated project deliverables summary with fallback logic ---');
    {
      // Create 2 moodboards (neither selected yet)
      const m1 = await prisma.moodboard.create({
        data: {
          projectId: projectA.id,
          title: 'Moodboard 1',
          description: 'Dark luxury style',
          image: 'moodboards/m1.png',
          isSelected: false,
        },
      });
      const m2 = await prisma.moodboard.create({
        data: {
          projectId: projectA.id,
          title: 'Moodboard 2',
          description: 'Minimal pastel style',
          image: 'moodboards/m2.png',
          isSelected: false,
        },
      });

      // Create 2 concepts (neither approved yet)
      const c1 = await prisma.concept.create({
        data: {
          projectId: projectA.id,
          title: 'Concept 1',
          description: 'Monogram icon',
          status: 'shared',
        },
      });
      const c2 = await prisma.concept.create({
        data: {
          projectId: projectA.id,
          title: 'Concept 2',
          description: 'Wordmark layout',
          status: 'draft',
        },
      });

      // Create 1 milestone
      await prisma.paymentMilestone.create({
        data: {
          projectId: projectA.id,
          type: 'advance',
          percentage: 50,
          amount: 50000,
          status: 'paid',
          paidAt: new Date(),
        },
      });

      // Create 2 deliverables
      const d1 = await prisma.deliverable.create({
        data: {
          projectId: projectA.id,
          title: 'Logo Kit Vector',
          description: 'SVG files',
          file: 'deliverables/logo_kit.svg',
          status: 'shared',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      });
      const d2 = await prisma.deliverable.create({
        data: {
          projectId: projectA.id,
          title: 'Typography Guide',
          description: 'PDF guide',
          file: 'deliverables/guide.pdf',
          status: 'draft',
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      });

      // Fetch summary: since no moodboard is selected, fallback returns BOTH; since no concept is approved, fallback returns BOTH
      const res1 = await request(`/api/projects/${projectA.id}/deliverables/summary/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.data.selected_moodboards.length, 2, 'Fallback should return all 2 moodboards');
      assert.strictEqual(res1.data.approved_concepts.length, 2, 'Fallback should return all 2 concepts');
      assert.strictEqual(res1.data.payment_milestones.length, 1);
      assert.strictEqual(res1.data.deliverables.length, 2);
      // Order of deliverables should be descending by createdAt (d2 first, d1 second)
      assert.strictEqual(res1.data.deliverables[0].id, d2.id);
      assert.strictEqual(res1.data.deliverables[1].id, d1.id);

      // Now set m1.isSelected = true and c2.status = 'approved'
      await prisma.moodboard.update({
        where: { id: m1.id },
        data: { isSelected: true },
      });
      await prisma.concept.update({
        where: { id: c2.id },
        data: { status: 'approved' },
      });

      // Fetch summary again: should return ONLY m1 and c2
      const res2 = await request(`/api/projects/${projectA.id}/deliverables/summary/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.data.selected_moodboards.length, 1, 'Should return only the selected moodboard');
      assert.strictEqual(res2.data.selected_moodboards[0].id, m1.id);
      assert.strictEqual(res2.data.approved_concepts.length, 1, 'Should return only the approved concept');
      assert.strictEqual(res2.data.approved_concepts[0].id, c2.id);

      console.log('✓ Populated summary with selective & fallback logic verified');
    }

    // ==========================================
    // PART 2: SIGNED-AGREEMENT EMAIL RETRY TESTS
    // ==========================================

    console.log('--- Test 2.1: Unauthenticated request to retry-signed-email ---');
    {
      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      console.log('✓ Unauthenticated retry rejected with 401');
    }

    console.log('--- Test 2.2: Cross-consultant retry denied (Consultant B on Project A) ---');
    {
      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersB,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Project not found.');
      console.log('✓ Cross-consultant retry returned 404');
    }

    console.log('--- Test 2.3: Retry when agreement does not exist ---');
    {
      const res = await request(`/api/projects/${projectEmpty.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Signed agreement PDF is not available.');
      console.log('✓ Missing agreement returned 404 Signed agreement PDF is not available.');
    }

    console.log('--- Test 2.4: Retry when agreement is unsigned (signedAt is null) ---');
    {
      const agreementA = await prisma.projectAgreement.create({
        data: {
          projectId: projectA.id,
          status: 'draft',
          basicPdfFile: 'project_agreements/basic/agreement_alpha.pdf',
          signedPdfFile: '',
          signedAt: null,
        },
      });

      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Signed agreement PDF is not available.');
      console.log('✓ Unsigned agreement returned 404 Signed agreement PDF is not available.');
    }

    console.log('--- Test 2.5: Physical file missing from disk -> 502 with safe sanitized error in DB ---');
    {
      // Update agreement to signed status, but reference non-existent file on disk
      await prisma.projectAgreement.update({
        where: { projectId: projectA.id },
        data: {
          status: 'signed',
          signedAt: new Date('2026-09-05T14:30:00Z'),
          signedPdfFile: 'project_agreements/signed/non_existent_signed_doc.pdf',
          signedEmailFailedAt: null,
          signedEmailError: '',
        },
      });

      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 502, `Expected 502, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Signed agreement is valid, but email retry failed.');

      // Check DB: signedEmailFailedAt must be set, signedEmailError must be sanitized (no raw paths)
      const updated = await prisma.projectAgreement.findUnique({
        where: { projectId: projectA.id },
      });
      assert(updated.signedEmailFailedAt !== null, 'signedEmailFailedAt should be recorded');
      assert(updated.signedEmailError.length > 0, 'signedEmailError should be recorded');
      assert(!updated.signedEmailError.includes('C:'), 'Must not leak Windows absolute path');
      assert(!updated.signedEmailError.includes('\\'), 'Must not leak file separators');
      console.log(`✓ Missing physical file caught, 502 returned, DB updated with safe error: "${updated.signedEmailError}"`);
    }

    console.log('--- Test 2.6: Simulated email provider failure -> 502 with safe error ---');
    {
      // Prepare real file on disk
      const mediaDir = path.resolve(ENV.MEDIA_ROOT, 'project_agreements', 'signed');
      fs.mkdirSync(mediaDir, { recursive: true });
      const testPdfPath = path.join(mediaDir, `signed_${runId}.pdf`);
      const samplePdfContent = Buffer.from('%PDF-1.4 simulated signed agreement content bytes');
      fs.writeFileSync(testPdfPath, samplePdfContent);
      createdTempFiles.push(testPdfPath);

      const relPath = `project_agreements/signed/signed_${runId}.pdf`;
      await prisma.projectAgreement.update({
        where: { projectId: projectA.id },
        data: {
          signedPdfFile: relPath,
        },
      });

      // Simulate network / provider error
      dispatcherErrorToThrow = new Error('Connection to email gateway failed or timed out.');

      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 502, `Expected 502, got ${res.status}`);
      assert.strictEqual(res.data.detail, 'Signed agreement is valid, but email retry failed.');

      const inDb = await prisma.projectAgreement.findUnique({
        where: { projectId: projectA.id },
      });
      assert(inDb.signedEmailFailedAt !== null);
      assert.strictEqual(inDb.signedEmailError, 'Connection to email gateway failed or timed out.');
      console.log('✓ Simulated email provider failure returned 502 and preserved retry state in DB');
    }

    console.log('--- Test 2.7: Successful retry -> 200, mock inspection, and cleared retry flags ---');
    {
      // Clear mock error
      dispatcherErrorToThrow = null;
      dispatchedEmails = [];

      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

      // Verify payload matches get_project_agreement_payload
      assert.strictEqual(res.data.status, 'signed');
      assert.strictEqual(res.data.signed_email_failed_at, null);
      assert.strictEqual(res.data.signed_email_error, '');
      assert(res.data.version_history.length >= 1);
      assert.strictEqual(res.data.version_history[0].event_type, 'agreement_signed');
      assert.strictEqual(res.data.version_history[0].label, 'Agreement v1 - Basic Agreement Signed');

      // Verify DB record
      const inDb = await prisma.projectAgreement.findUnique({
        where: { projectId: projectA.id },
      });
      assert.strictEqual(inDb.signedEmailFailedAt, null);
      assert.strictEqual(inDb.signedEmailError, '');

      // Inspect mocked message and attachment
      assert.strictEqual(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert(Array.isArray(email.to));
      assert(email.to.includes('alice_' + runId + '@alphabrands.com'), 'Client email should be recipient');
      assert(email.to.includes(consultantA.email), 'Consultant email should be recipient');
      assert.strictEqual(email.subject, 'Signed agreement - Alpha Brands Ltd');
      assert(email.text.includes('The agreement for Alpha Brands Ltd has been signed by Alice Alpha.'));
      assert(email.text.includes('Signed at: 2026-09-05 14:30:00.000Z'));
      assert(email.text.includes('FLOXA'));

      // Check attachment
      assert(Array.isArray(email.attachments));
      assert.strictEqual(email.attachments.length, 1);
      assert.strictEqual(email.attachments[0].filename, 'signed-agreement.pdf');
      assert.strictEqual(email.attachments[0].contentType, 'application/pdf');
      assert(Buffer.isBuffer(email.attachments[0].content));
      assert(
        email.attachments[0].content.toString().includes('%PDF-1.4 simulated signed agreement content bytes'),
        'Attachment content bytes must match source file'
      );

      console.log('✓ Successful retry cleared error in DB and dispatched mocked email with verified attachment bytes');
    }

    console.log('--- Test 2.8: Concurrent overlapping retries coalesced into single dispatch ---');
    {
      dispatchedEmails = [];
      dispatcherDelayMs = 150; // Simulate 150ms transmission time

      // Fire 2 simultaneous retry requests
      const [res1, res2] = await Promise.all([
        request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, { method: 'POST', headers: authHeadersA }),
        request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, { method: 'POST', headers: authHeadersA }),
      ]);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);

      // CRITICAL ASSERTION: Exactly 1 email dispatch occurred despite 2 concurrent requests
      assert.strictEqual(
        dispatchedEmails.length,
        1,
        `Expected exactly 1 email dispatched due to coalescing, got ${dispatchedEmails.length}`
      );
      dispatcherDelayMs = 0;
      console.log('✓ Overlapping concurrent retry requests coalesced into 1 email transmission');
    }

    console.log('--- Test 2.9: Subsequent intentional retry can still be sent after completion ---');
    {
      dispatchedEmails = [];
      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(dispatchedEmails.length, 1, 'Subsequent intentional retry must dispatch normally');
      console.log('✓ Later intentional retry dispatched successfully');
    }

    console.log('--- Test 2.10: Unconfigured mail provider outside tests returns controlled failure ---');
    {
      // Temporarily remove test dispatcher and blank out credentials to verify unconfigured check
      setTestEmailDispatcher(null);
      const origUser = ENV.EMAIL_HOST_USER;
      ENV.EMAIL_HOST_USER = '';

      const res = await request(`/api/projects/${projectA.id}/agreement/retry-signed-email/`, {
        method: 'POST',
        headers: authHeadersA,
      });
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.data.detail, 'Signed agreement is valid, but email retry failed.');

      const inDb = await prisma.projectAgreement.findUnique({
        where: { projectId: projectA.id },
      });
      assert(inDb.signedEmailFailedAt !== null);
      assert.strictEqual(inDb.signedEmailError, 'Email service is not configured.');

      // Restore credentials & test dispatcher
      ENV.EMAIL_HOST_USER = origUser;
      setTestEmailDispatcher(async (params) => {
        dispatchedEmails.push(params);
      });
      console.log('✓ Unconfigured mail provider returns controlled 502 and records "Email service is not configured."');
    }

    // ==========================================
    // PART 3: NEXT.JS HTTP PROXY VERIFICATION
    // ==========================================

    console.log('--- Test 3.1: Next.js HTTP Proxy Compatibility (port 3000) ---');
    {
      // Check if Next.js server on port 3000 is reachable
      let nextJsReachable = false;
      try {
        const ping = await proxyRequest('http://localhost:3000/api/projects/status');
        nextJsReachable = true;
      } catch (err) {
        console.log('Next.js dev server port 3000 not reachable or error:', err.message);
      }

      if (nextJsReachable) {
        // Proxy deliverables summary
        const proxySummary = await proxyRequest(
          `http://localhost:3000/api/projects/${projectA.id}/deliverables/summary/`,
          {
            headers: authHeadersA,
          }
        );
        assert.strictEqual(proxySummary.status, 200, `Expected 200 via Next.js proxy, got ${proxySummary.status}`);
        assert(Array.isArray(proxySummary.data.selected_moodboards));
        assert(Array.isArray(proxySummary.data.deliverables));
        console.log('✓ Next.js HTTP proxy delivered deliverables summary (200 OK)');

        // Proxy retry signed email through Next.js
        const proxyRetry = await proxyRequest(
          `http://localhost:3000/api/projects/${projectA.id}/agreement/retry-signed-email/`,
          {
            method: 'POST',
            headers: authHeadersA,
          }
        );
        assert(
          proxyRetry.status === 200 ||
            (proxyRetry.status === 502 && proxyRetry.data.detail === 'Signed agreement is valid, but email retry failed.'),
          `Expected 200 or controlled 502 from Next.js proxy, got ${proxyRetry.status}`
        );
        console.log(`✓ Next.js HTTP proxy delivered signed email retry (${proxyRetry.status} response from backend daemon)`);
      } else {
        console.log('ℹ Next.js proxy test skipped because port 3000 was unreachable in test runner.');
      }
    }

    console.log('\n======================================================');
    console.log('ALL PHASE 5 TESTS COMPLETED SUCCESSFULLY WITH 100% PASS');
    console.log('======================================================\n');
  } finally {
    // Teardown test server
    if (server) {
      await new Promise((r) => server.close(r));
    }

    // Reset email dispatcher
    setTestEmailDispatcher(null);

    // Clean up temporary files
    for (const f of createdTempFiles) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch {}
    }

    // Clean up created database records
    try {
      if (createdProjectIds.length > 0) {
        await prisma.moodboard.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.concept.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.deliverable.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.projectAgreement.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.clientProfile.deleteMany({ where: { projectId: { in: createdProjectIds } } });
        await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
      }
      if (createdClientIds.length > 0) {
        await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
      }
      if (createdConsultantIds.length > 0) {
        await prisma.consultant.deleteMany({ where: { id: { in: createdConsultantIds } } });
      }
    } catch (cleanupErr) {
      console.error('Fixture cleanup error:', cleanupErr);
    }
  }
}

runTests().catch((err) => {
  console.error('Phase 5 test suite failed:', err);
  process.exit(1);
});
