import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../dist/prisma/client.js';
import { ENV } from '../../dist/config/env.js';
import { app } from '../../dist/app.js';
import { generateTokens } from '../../dist/services/auth.service.js';

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = options.headers || {};
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

class Barrier {
  constructor(count) {
    this.target = count;
    this.count = 0;
    this.waiters = [];
  }
  wait() {
    return new Promise((resolve) => {
      this.count++;
      if (this.count >= this.target) {
        while (this.waiters.length > 0) {
          const w = this.waiters.shift();
          w();
        }
        resolve();
      } else {
        this.waiters.push(resolve);
      }
    });
  }
}

async function runGeneratedAgreementTests() {
  console.log('================================================================');
  console.log('  PHASE 3: GENERATED AGREEMENT SNAPSHOT WORKFLOW TEST SUITE     ');
  console.log('================================================================\n');

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`✓ Test Express server listening on ephemeral port ${port}`);
      resolve();
    });
  });

  const testSuffix = crypto.randomBytes(4).toString('hex');
  const createdFiles = [];

  const testIds = {
    consultants: [],
    clients: [],
    projects: [],
  };

  try {
    // -------------------------------------------------------------
    // Base Fixtures: Consultant A & Client & Project
    // -------------------------------------------------------------
    const consultantA = await prisma.consultant.create({
      data: {
        email: `ga_consultant_${testSuffix}@floxa.test`,
        password: 'hash_placeholder',
        name: 'Alice Consultant',
        company: 'Alice Studio Ltd',
      },
    });
    testIds.consultants.push(consultantA.id);
    const tokenA = generateTokens(consultantA.id).accessToken;

    const consultantB = await prisma.consultant.create({
      data: {
        email: `ga_consultant_b_${testSuffix}@floxa.test`,
        password: 'hash_placeholder',
        name: 'Bob Consultant',
      },
    });
    testIds.consultants.push(consultantB.id);
    const tokenB = generateTokens(consultantB.id).accessToken;

    const client = await prisma.client.create({
      data: {
        name: 'Charlie Client',
        email: `ga_client_${testSuffix}@floxa.test`,
        companyName: 'Charlie Tech Inc',
        sector: 'Fintech',
      },
    });
    testIds.clients.push(client.id);

    const project = await prisma.project.create({
      data: {
        consultantId: consultantA.id,
        clientId: client.id,
        title: 'Fintech Identity Redesign',
        companyName: 'Charlie Tech Inc',
        sector: 'Fintech',
        projectValue: 120000.0,
        advancePercentage: 40,
        midPercentage: 30,
        finalPercentage: 30,
        portalToken: `token-ga-${testSuffix}`,
      },
    });
    testIds.projects.push(project.id);

    console.log(`✓ Created isolated test project: ${project.id} with portalToken: ${project.portalToken}`);

    // =============================================================
    // TEST 1: Missing Prerequisites Gating
    // =============================================================
    console.log('\n[TEST 1] Missing prerequisites gating...');
    // Consultant GET before discovery/moodboard/concept exist
    const resNoPrereq = await request(`/api/projects/${project.id}/generated-agreement/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant GET /generated-agreement/ without prerequisites status: ${resNoPrereq.status}`);
    if (resNoPrereq.status !== 404 || !resNoPrereq.data?.detail?.includes('not found')) {
      throw new Error(`Expected 404 for missing prerequisites, got ${resNoPrereq.status}: ${JSON.stringify(resNoPrereq.data)}`);
    }

    // Client GET before snapshot exists
    const resPortalNoPrereq = await request(`/api/client-portal/${project.portalToken}/generated-agreement/`);
    console.log(`  Client portal GET /generated-agreement/ status: ${resPortalNoPrereq.status}`);
    if (resPortalNoPrereq.status !== 404) {
      throw new Error(`Expected 404 for client portal with missing snapshot, got ${resPortalNoPrereq.status}`);
    }
    console.log('  ✓ TEST 1 PASS: Endpoints safely return 404 when prerequisites are unfulfilled.');

    // =============================================================
    // TEST 2: Fulfill Prerequisites and Trigger Snapshot Generation
    // =============================================================
    console.log('\n[TEST 2] Fulfill prerequisites and verify snapshot compilation...');
    // Add Discovery
    await prisma.projectDiscovery.create({
      data: {
        projectId: project.id,
        whatBusinessDoes: 'Next-gen payment processing platform',
        targetCustomer: 'Fintech startups and enterprise merchants',
        whyChooseUs: 'Ultra-low latency and automated compliance',
        brandFeeling: 'Prestigious, trustworthy, cutting-edge',
        audienceArchetype: 'The Visionary Builder',
        emotions: ['confidence', 'security', 'innovation'],
        visualStyles: ['minimalist', 'geometric', 'dark-mode'],
        competitors: [
          { name: 'Stripe', rating: 'like', reason: 'Developer friendly API' },
          { name: 'Adyen', rating: 'neutral', reason: 'Global reach' },
        ],
        submittedAt: new Date(),
      },
    });

    // Add Brand DNA
    await prisma.brandDNA.create({
      data: {
        projectId: project.id,
        brandPersonalityCluster: 'Modern Visionary & Reliable Partner',
        businessSummary: 'Fast B2B payment rails',
        targetAudienceSummary: 'High-growth tech founders',
        positioningSummary: 'Enterprise grade reliability',
        brandFeelingSummary: 'Speed and clarity',
        visualDirectionSummary: 'Monochrome with vivid emerald accents',
        competitorSummary: 'Differentiates via developer experience',
      },
    });

    // Add Moodboard (selected)
    const moodboard = await prisma.moodboard.create({
      data: {
        projectId: project.id,
        title: 'Nordic Clean Geometry',
        description: 'Clean typographic grid with refined slate tones',
        image: '/media/moodboards/sample_mb.png',
        isSelected: true,
        isShared: true,
      },
    });

    // Add Concept (approved)
    const concept = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Horizon Flow Identity',
        description: 'Continuous ribbon representing infinite liquidity',
        version: 1,
        status: 'approved',
        clientFeedback: 'Approved! Matches our vision perfectly.',
      },
    });

    // Add Payment Milestones
    await prisma.paymentMilestone.createMany({
      data: [
        { projectId: project.id, type: 'advance', percentage: 40, amount: 48000, status: 'paid' },
        { projectId: project.id, type: 'mid', percentage: 30, amount: 36000, status: 'requested' },
        { projectId: project.id, type: 'final', percentage: 30, amount: 36000, status: 'locked' },
      ],
    });

    // Add Deliverables
    await prisma.deliverable.createMany({
      data: [
        { projectId: project.id, title: 'Primary Brand Mark (SVG/PNG)', file: '/media/deliverables/mark.svg', status: 'shared' },
        { projectId: project.id, title: 'Typography and Color Guide (PDF)', file: '/media/deliverables/guide.pdf', status: 'draft' },
      ],
    });

    // Now consultant calls GET /api/projects/:id/generated-agreement/
    const resDraftGen = await request(`/api/projects/${project.id}/generated-agreement/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant GET /generated-agreement/ status: ${resDraftGen.status}`);
    if (resDraftGen.status !== 200) {
      throw new Error(`Expected 200, got ${resDraftGen.status}: ${JSON.stringify(resDraftGen.data)}`);
    }

    const payload = resDraftGen.data;
    if (payload.version !== 1 || payload.status !== 'draft' || payload.shared !== false) {
      throw new Error(`Snapshot draft payload unexpected: ${JSON.stringify(payload)}`);
    }
    if (!payload.history || payload.history.length !== 1) {
      throw new Error(`Expected history of 1 entry, got: ${payload.history?.length}`);
    }

    // Verify system activity was logged
    const activities = await prisma.projectActivity.findMany({
      where: { projectId: project.id, action: 'agreement_draft_generated' },
    });
    if (activities.length !== 1) {
      throw new Error(`Expected 1 agreement_draft_generated activity, found ${activities.length}`);
    }
    console.log('  ✓ TEST 2 PASS: Snapshot v1 draft created with complete data structure & activity logged.');

    // =============================================================
    // TEST 3: Unshared Draft Client Denial
    // =============================================================
    console.log('\n[TEST 3] Unshared draft client denial...');
    const clientDraftRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/`);
    console.log(`  Client portal GET /generated-agreement/ (unshared) status: ${clientDraftRes.status}`);
    if (clientDraftRes.status !== 404) {
      throw new Error(`Expected 404 for unshared draft on client portal, got ${clientDraftRes.status}`);
    }

    const clientPdfRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/pdf/`);
    console.log(`  Client portal GET /generated-agreement/pdf/ (unshared) status: ${clientPdfRes.status}`);
    if (clientPdfRes.status !== 404) {
      throw new Error(`Expected 404 for unshared PDF on client portal, got ${clientPdfRes.status}`);
    }
    console.log('  ✓ TEST 3 PASS: Unshared draft completely hidden from client portal.');

    // =============================================================
    // TEST 4: Consultant PDF Generation & Protected Streaming
    // =============================================================
    console.log('\n[TEST 4] Consultant PDF generation, regeneration, and streaming...');
    const pdfRes = await request(`/api/projects/${project.id}/generated-agreement/pdf/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant GET /generated-agreement/pdf/ status: ${pdfRes.status}`);
    console.log(`  Content-Type: ${pdfRes.headers['content-type']}`);
    console.log(`  Buffer length: ${pdfRes.buffer.length} bytes`);

    if (pdfRes.status !== 200 || pdfRes.headers['content-type'] !== 'application/pdf') {
      throw new Error(`Expected 200 application/pdf, got ${pdfRes.status} ${pdfRes.headers['content-type']}`);
    }
    if (pdfRes.buffer.length < 1000) {
      throw new Error(`Generated PDF seems too small: ${pdfRes.buffer.length} bytes`);
    }

    // Save a copy of the generated PDF for visual inspection artifact
    const samplePdfPath = path.resolve(process.cwd(), 'sample_inspected_agreement.pdf');
    fs.writeFileSync(samplePdfPath, pdfRes.buffer);
    createdFiles.push(samplePdfPath);
    console.log(`  ✓ Sample PDF saved locally for inspection: ${samplePdfPath}`);

    // Regenerate draft PDF
    const regenRes = await request(`/api/projects/${project.id}/generated-agreement/pdf/regenerate/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant POST /generated-agreement/pdf/regenerate/ status: ${regenRes.status}`);
    if (regenRes.status !== 200 || !regenRes.data?.pdf_generated_at) {
      throw new Error(`PDF regeneration failed: ${JSON.stringify(regenRes.data)}`);
    }

    const pdfActivities = await prisma.projectActivity.findMany({
      where: { projectId: project.id, action: 'agreement_pdf_generated' },
    });
    if (pdfActivities.length !== 1) {
      throw new Error(`Expected 1 agreement_pdf_generated activity, found ${pdfActivities.length}`);
    }
    console.log('  ✓ TEST 4 PASS: Consultant PDF generation, binary streaming, and regeneration succeeded.');

    // =============================================================
    // TEST 5: Deduplication vs Version Bump on Source Changes
    // =============================================================
    console.log('\n[TEST 5] Deduplication & version bumping on source changes...');
    // A) Calling again with unchanged data: must deduplicate and NOT create v2
    const unchangedRes = await request(`/api/projects/${project.id}/generated-agreement/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (unchangedRes.data.version !== 1) {
      throw new Error(`Expected version 1 to be reused when unchanged, got version ${unchangedRes.data.version}`);
    }

    const snapshotCount1 = await prisma.generatedAgreementSnapshot.count({
      where: { projectId: project.id },
    });
    if (snapshotCount1 !== 1) {
      throw new Error(`Expected exactly 1 snapshot, found ${snapshotCount1}`);
    }
    console.log('  ✓ Deduplication verified: unchanged source data does not create duplicate snapshots.');

    // B) Change source data: add a second approved concept
    const concept2 = await prisma.concept.create({
      data: {
        projectId: project.id,
        title: 'Dark Mode Dashboard Variant',
        description: 'Executive dashboard view',
        version: 2,
        status: 'approved',
        clientFeedback: 'Approved the dark theme styling.',
      },
    });

    // Calling GET again: must detect change and create v2 draft!
    const changedRes = await request(`/api/projects/${project.id}/generated-agreement/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Updated snapshot version: ${changedRes.data?.version}`);
    if (changedRes.data?.version !== 2) {
      throw new Error(`Expected version 2 after source change, got: ${changedRes.data?.version}`);
    }

    const snapshotCount2 = await prisma.generatedAgreementSnapshot.count({
      where: { projectId: project.id },
    });
    if (snapshotCount2 !== 2) {
      throw new Error(`Expected 2 snapshots in history, found ${snapshotCount2}`);
    }
    console.log('  ✓ TEST 5 PASS: Source data change accurately bumped version to v2 with history preserved.');

    // =============================================================
    // TEST 6: Sharing Workflow
    // =============================================================
    console.log('\n[TEST 6] Consultant sharing workflow...');
    const shareRes = await request(`/api/projects/${project.id}/generated-agreement/share/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant POST /generated-agreement/share/ status: ${shareRes.status}`);
    if (shareRes.status !== 200 || shareRes.data?.shared !== true) {
      throw new Error(`Share failed: ${JSON.stringify(shareRes.data)}`);
    }

    const shareActivities = await prisma.projectActivity.findMany({
      where: { projectId: project.id, action: 'agreement_shared' },
    });
    if (shareActivities.length !== 1) {
      throw new Error(`Expected 1 agreement_shared activity, found ${shareActivities.length}`);
    }

    // Now client portal can view and download!
    const clientSharedRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/`);
    console.log(`  Client portal GET /generated-agreement/ after sharing status: ${clientSharedRes.status}`);
    if (clientSharedRes.status !== 200 || clientSharedRes.data?.shared !== true) {
      throw new Error(`Client portal failed to get shared agreement: ${JSON.stringify(clientSharedRes.data)}`);
    }

    const clientDownloadRes = await request(
      `/api/client-portal/${project.portalToken}/generated-agreement/pdf/?download=1`
    );
    console.log(`  Client portal download PDF status: ${clientDownloadRes.status}`);
    if (clientDownloadRes.status !== 200 || clientDownloadRes.headers['content-type'] !== 'application/pdf') {
      throw new Error(`Client portal download failed`);
    }

    const downloadActivities = await prisma.projectActivity.findMany({
      where: { projectId: project.id, action: 'agreement_downloaded' },
    });
    if (downloadActivities.length !== 1) {
      throw new Error(`Expected 1 agreement_downloaded activity, found ${downloadActivities.length}`);
    }
    console.log('  ✓ TEST 6 PASS: Sharing enabled client view & download with audit activity recorded.');

    // =============================================================
    // TEST 7: Support Mode Guard on Client Acceptance
    // =============================================================
    console.log('\n[TEST 7] Consultant in Support Mode cannot accept agreement...');
    const supportModeRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/accept/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-support-mode': 'true',
      },
      body: { accepted: true },
    });
    console.log(`  Support mode accept status: ${supportModeRes.status}`);
    if (supportModeRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for support mode acceptance, got ${supportModeRes.status}: ${JSON.stringify(supportModeRes.data)}`);
    }
    console.log('  ✓ TEST 7 PASS: Support mode consultant blocked from performing client acceptance.');

    // =============================================================
    // TEST 8: Client Acceptance Validation Guard
    // =============================================================
    console.log('\n[TEST 8] Acceptance validation guard (missing accepted flag)...');
    const invalidAcceptRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/accept/`, {
      method: 'POST',
      body: { accepted: false },
    });
    console.log(`  Invalid accept status: ${invalidAcceptRes.status}`);
    if (invalidAcceptRes.status !== 400 || !invalidAcceptRes.data?.accepted) {
      throw new Error(`Expected 400 with accepted field error, got: ${JSON.stringify(invalidAcceptRes.data)}`);
    }
    console.log('  ✓ TEST 8 PASS: Invalid acceptance payload rejected with 400.');

    // =============================================================
    // TEST 9: Concurrent Client Acceptance (Atomic CAS Serialization)
    // =============================================================
    console.log('\n[TEST 9] Concurrent Client Acceptance (5 parallel requests)...');
    const barrier = new Barrier(5);

    const acceptPromises = Array.from({ length: 5 }).map(async (_, idx) => {
      await barrier.wait();
      return request(`/api/client-portal/${project.portalToken}/generated-agreement/accept/`, {
        method: 'POST',
        body: { accepted: true },
      });
    });

    const acceptResults = await Promise.all(acceptPromises);
    const successCount = acceptResults.filter((r) => r.status === 200).length;
    const conflictCount = acceptResults.filter((r) => r.status === 400).length;

    console.log(`  Concurrent acceptance results: ${successCount} succeeded (200), ${conflictCount} rejected (400)`);
    if (successCount !== 1 || conflictCount !== 4) {
      throw new Error(`Expected exactly 1 success and 4 conflicts, got ${successCount} success and ${conflictCount} conflicts`);
    }

    const acceptedSnapshot = await prisma.generatedAgreementSnapshot.findFirst({
      where: { projectId: project.id, version: 2 },
    });
    if (acceptedSnapshot.status !== 'accepted' || !acceptedSnapshot.acceptedAt) {
      throw new Error(`Database record status not accepted: ${JSON.stringify(acceptedSnapshot)}`);
    }

    const acceptActivities = await prisma.projectActivity.findMany({
      where: { projectId: project.id, action: 'agreement_accepted' },
    });
    if (acceptActivities.length !== 1) {
      throw new Error(`Expected exactly 1 agreement_accepted activity, found ${acceptActivities.length}`);
    }
    console.log('  ✓ TEST 9 PASS: Concurrent acceptance safely serialized; exactly 1 committed.');

    // =============================================================
    // TEST 10: Repeated Acceptance & Regeneration Lock
    // =============================================================
    console.log('\n[TEST 10] Repeated acceptance denial & regeneration lock on accepted draft...');
    const repeatAcceptRes = await request(`/api/client-portal/${project.portalToken}/generated-agreement/accept/`, {
      method: 'POST',
      body: { accepted: true },
    });
    console.log(`  Repeated accept status: ${repeatAcceptRes.status}`);
    if (repeatAcceptRes.status !== 400 || repeatAcceptRes.data?.detail !== 'Agreement has already been accepted.') {
      throw new Error(`Expected 400 'Agreement has already been accepted.', got: ${JSON.stringify(repeatAcceptRes.data)}`);
    }

    // Consultant tries to regenerate locked agreement
    const lockedRegenRes = await request(`/api/projects/${project.id}/generated-agreement/pdf/regenerate/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Regenerate on accepted agreement status: ${lockedRegenRes.status}`);
    if (lockedRegenRes.status !== 400 || lockedRegenRes.data?.detail !== 'Generated agreement is locked.') {
      throw new Error(`Expected 400 'Generated agreement is locked.', got: ${JSON.stringify(lockedRegenRes.data)}`);
    }
    console.log('  ✓ TEST 10 PASS: Repeated acceptance and locked agreement regeneration properly denied.');

    // =============================================================
    // TEST 11: Security & Cross-Project Denial
    // =============================================================
    console.log('\n[TEST 11] Security & Cross-Project Denial...');
    // Unauthenticated consultant request
    const unauthRes = await request(`/api/projects/${project.id}/generated-agreement/`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }

    // Consultant B accessing Consultant A's project
    const crossProjRes = await request(`/api/projects/${project.id}/generated-agreement/`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (crossProjRes.status !== 404) {
      throw new Error(`Expected 404 for cross-consultant project access, got ${crossProjRes.status}`);
    }

    // Invalid portal token
    const invalidPortalRes = await request('/api/client-portal/nonexistent-token-12345/generated-agreement/');
    if (invalidPortalRes.status !== 404) {
      throw new Error(`Expected 404 for invalid portal token, got ${invalidPortalRes.status}`);
    }
    console.log('  ✓ TEST 11 PASS: Unauthenticated and cross-tenant access correctly rejected.');

    // =============================================================
    // TEST 12: Basic Agreement & Signature Workflow Preserved Intact
    // =============================================================
    console.log('\n[TEST 12] Basic agreement/signature workflow intactness...');
    const basicAgrRes = await request(`/api/projects/${project.id}/agreement/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Consultant GET /agreement/ status: ${basicAgrRes.status}`);
    if (basicAgrRes.status !== 200 && basicAgrRes.status !== 404) {
      throw new Error(`Unexpected status for basic agreement: ${basicAgrRes.status}`);
    }

    const portalBasicAgrRes = await request(`/api/client-portal/${project.portalToken}/agreement/`);
    console.log(`  Client portal GET /agreement/ status: ${portalBasicAgrRes.status}`);
    if (portalBasicAgrRes.status !== 200 && portalBasicAgrRes.status !== 404) {
      throw new Error(`Unexpected status for portal basic agreement: ${portalBasicAgrRes.status}`);
    }
    console.log('  ✓ TEST 12 PASS: Basic agreement endpoints remain untouched and functional.');

    // =============================================================
    // TEST 13: Visual Content Verification of Accepted PDF
    // =============================================================
    console.log('\n[TEST 13] Verifying accepted PDF content structure...');
    const acceptedPdfRes = await request(`/api/projects/${project.id}/generated-agreement/pdf/`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.log(`  Accepted PDF buffer length: ${acceptedPdfRes.buffer.length} bytes`);
    const raw = acceptedPdfRes.buffer.toString('latin1');
    const matches = raw.matchAll(/<([0-9a-fA-F]+)>/g);
    let decodedText = '';
    for (const m of matches) {
      try {
        decodedText += Buffer.from(m[1], 'hex').toString('latin1');
      } catch {}
    }
    const cleanDecoded = decodedText.replace(/\s+/g, ' ').toUpperCase();

    const expectedKeywords = [
      'FLOXA GENERATED AGREEMENT',
      'ACCEPTED',
      'PROJECT AND CLIENT',
      'DISCOVERY SUMMARY',
      'BRAND DNA SUMMARY',
      'SELECTED MOODBOARD',
      'APPROVED CONCEPTS',
      'PAYMENT SCHEDULE',
      'EXPECTED DELIVERABLES',
    ];

    for (const kw of expectedKeywords) {
      if (!cleanDecoded.includes(kw.toUpperCase())) {
        throw new Error(`Generated PDF is missing expected keyword: "${kw}"`);
      }
    }
    console.log('  ✓ TEST 13 PASS: Accepted PDF includes all required sections and ACCEPTED status.');

    console.log('\n================================================================');
    console.log('  ALL 13 GENERATED AGREEMENT SUITE TESTS PASSED SUCCESSFULLY!    ');
    console.log('================================================================\n');
  } finally {
    // Cleanup fixtures
    console.log('Cleaning up test fixtures...');
    try {
      if (testIds.projects.length > 0) {
        await prisma.generatedAgreementSnapshot.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.projectActivity.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.paymentMilestone.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.deliverable.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.moodboard.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.concept.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.brandDNA.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.projectDiscovery.deleteMany({
          where: { projectId: { in: testIds.projects } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: testIds.projects } },
        });
      }
      if (testIds.clients.length > 0) {
        await prisma.client.deleteMany({
          where: { id: { in: testIds.clients } },
        });
      }
      if (testIds.consultants.length > 0) {
        await prisma.consultant.deleteMany({
          where: { id: { in: testIds.consultants } },
        });
      }
    } catch (cleanupErr) {
      console.warn('Database cleanup warning:', cleanupErr.message);
    }

    for (const file of createdFiles) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }

    if (server) {
      server.close();
    }
  }
}

runGeneratedAgreementTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
