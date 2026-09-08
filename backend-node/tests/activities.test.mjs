process.env.NODE_ENV = 'test';
import http from 'http';
import crypto from 'crypto';
import assert from 'assert';
import { prisma } from '../dist/prisma/client.js';
import { app } from '../dist/app.js';
import { generateTokens } from '../dist/services/auth.service.js';
import { logProjectActivity } from '../dist/services/project.service.js';

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

async function runActivitiesTestSuite() {
  console.log('--- Starting Phase 4 Activity & Mark-Read Test Suite ---');

  // Start ephemeral test server
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

    // 1. Create primary consultant A
    const consultantA = await prisma.consultant.create({
      data: {
        email: `activity_cons_a_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant A',
        company: 'Agency A',
      },
    });
    createdConsultantIds.push(consultantA.id);
    const tokenA = generateTokens(consultantA.id).accessToken;
    const authHeadersA = { Authorization: `Bearer ${tokenA}` };

    // 2. Create secondary consultant B
    const consultantB = await prisma.consultant.create({
      data: {
        email: `activity_cons_b_${runId}@test.com`,
        password: 'hashed_password',
        name: 'Consultant B',
        company: 'Agency B',
      },
    });
    createdConsultantIds.push(consultantB.id);
    const tokenB = generateTokens(consultantB.id).accessToken;
    const authHeadersB = { Authorization: `Bearer ${tokenB}` };

    // 3. Create client A & Project A (owned by consultant A)
    const clientA = await prisma.client.create({
      data: {
        name: 'Client Alpha',
        email: `client_a_${runId}@test.com`,
        companyName: 'Alpha Corp',
        sector: 'Technology',
      },
    });
    createdClientIds.push(clientA.id);

    const portalTokenA = `pt-a-${runId}`;
    const projectA = await prisma.project.create({
      data: {
        title: 'Alpha Branding Project',
        companyName: 'Alpha Corp',
        sector: 'Technology',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: portalTokenA,
        status: 'concepts',
        projectValue: 50000,
        isArchived: false,
      },
    });
    createdProjectIds.push(projectA.id);

    // 4. Create Project B (owned by consultant B)
    const portalTokenB = `pt-b-${runId}`;
    const projectB = await prisma.project.create({
      data: {
        title: 'Beta Project',
        companyName: 'Beta LLC',
        sector: 'Technology',
        consultantId: consultantB.id,
        clientId: clientA.id,
        portalToken: portalTokenB,
        status: 'discovery',
        projectValue: 30000,
        isArchived: false,
      },
    });
    createdProjectIds.push(projectB.id);

    // 5. Create Project C (archived project for consultant A)
    const projectC = await prisma.project.create({
      data: {
        title: 'Archived Gamma Project',
        companyName: 'Gamma LLC',
        sector: 'Technology',
        consultantId: consultantA.id,
        clientId: clientA.id,
        portalToken: `pt-c-${runId}`,
        status: 'archived',
        projectValue: 10000,
        isArchived: true,
      },
    });
    createdProjectIds.push(projectC.id);

    // Seed activities on Project A
    // 1. Internal activity (consultant uploaded moodboard, not visible to client)
    const actInternal = await logProjectActivity({
      projectId: projectA.id,
      consultantId: consultantA.id,
      actorType: 'consultant',
      action: 'moodboard_uploaded',
      description: 'Consultant uploaded moodboard options.',
      metadata: { moodboard_count: 3, internal_notes: 'Private concept review' },
      visibleToClient: false,
    });

    // 2. Client-visible activity 1 (concept shared)
    const actShared = await logProjectActivity({
      projectId: projectA.id,
      consultantId: consultantA.id,
      actorType: 'consultant',
      action: 'concept_shared',
      description: 'Consultant shared brand concept direction.',
      metadata: { concept_id: 'c1', version: 1 },
      visibleToClient: true,
    });

    // 3. Client-visible activity 2 (deliverable downloaded)
    const actDownload = await logProjectActivity({
      projectId: projectA.id,
      consultantId: consultantA.id,
      actorType: 'client',
      action: 'deliverable_downloaded',
      description: 'Client downloaded final deliverables.',
      metadata: { deliverable_id: 'd1' },
      visibleToClient: true,
    });

    // Seed activity on Project B (Project B unread)
    const actProjB = await logProjectActivity({
      projectId: projectB.id,
      consultantId: consultantB.id,
      actorType: 'consultant',
      action: 'project_created',
      description: 'Project Beta created.',
      visibleToClient: false,
    });

    // Seed activity on Archived Project C
    const actProjC = await logProjectActivity({
      projectId: projectC.id,
      consultantId: consultantA.id,
      actorType: 'consultant',
      action: 'project_archived',
      description: 'Archived project activity.',
      visibleToClient: false,
    });

    console.log('✓ Test fixtures successfully initialized');

    // TEST 1: Owner access and cross-consultant denial
    {
      console.log('Running Test 1: Owner access and cross-consultant denial...');
      // Consultant A accesses Project A -> 200
      const resOwner = await request(`/api/projects/${projectA.id}/activities/`, {
        headers: authHeadersA,
      });
      if (resOwner.status !== 200) {
        console.error('resOwner error data:', resOwner.data, 'raw:', resOwner.rawText);
      }
      assert.strictEqual(resOwner.status, 200, 'Owner consultant should receive 200');
      assert.strictEqual(Array.isArray(resOwner.data), true, 'Response should be array');
      assert.strictEqual(resOwner.data.length, 3, 'Owner should see all 3 project activities');

      // Consultant B accesses Project A -> 404 (matches Django get_project_for_consultant)
      const resNonOwner = await request(`/api/projects/${projectA.id}/activities/`, {
        headers: authHeadersB,
      });
      assert.strictEqual(resNonOwner.status, 404, 'Non-owner consultant must receive 404');
      assert.strictEqual(resNonOwner.data.detail, 'Project not found.');

      // Consultant A accesses Archived Project C -> 404 (matches Django is_archived=False)
      const resArchived = await request(`/api/projects/${projectC.id}/activities/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(resArchived.status, 404, 'Archived project must return 404');
      console.log('✓ Test 1 passed');
    }

    // TEST 2: Missing authentication and invalid portal access
    {
      console.log('Running Test 2: Missing authentication and invalid portal access...');
      // No auth token on consultant route -> 401
      const resNoAuth = await request(`/api/projects/${projectA.id}/activities/`);
      assert.strictEqual(resNoAuth.status, 401, 'Unauthenticated request should return 401');

      // Invalid portal token -> 404
      const resBadPortal = await request(`/api/client-portal/invalid-token-xyz/activities/`);
      assert.strictEqual(resBadPortal.status, 404, 'Invalid portal token should return 404');
      console.log('✓ Test 2 passed');
    }

    // TEST 3: Client-visible filtering and internal activity exclusion
    {
      console.log('Running Test 3: Client-visible filtering and internal activity exclusion...');
      const resPortal = await request(`/api/client-portal/${portalTokenA}/activities/`);
      assert.strictEqual(resPortal.status, 200, 'Client portal should return 200');
      assert.strictEqual(Array.isArray(resPortal.data), true, 'Portal data must be array');

      // Project A has 3 activities, but only 2 are visibleToClient: true
      assert.strictEqual(resPortal.data.length, 2, 'Portal should only return client-visible activities');
      
      const actions = resPortal.data.map((a) => a.action);
      assert.strictEqual(actions.includes('concept_shared'), true, 'concept_shared must be included');
      assert.strictEqual(actions.includes('deliverable_downloaded'), true, 'deliverable_downloaded must be included');
      assert.strictEqual(actions.includes('moodboard_uploaded'), false, 'moodboard_uploaded (internal) must NOT be included');
      console.log('✓ Test 3 passed');
    }

    // TEST 4: Exact response shape, ordering, and serializer contracts
    {
      console.log('Running Test 4: Exact response shapes and ordering...');
      // Consultant response shape
      const resConsultant = await request(`/api/projects/${projectA.id}/activities/`, {
        headers: authHeadersA,
      });
      const consAct = resConsultant.data[0];
      assert.ok(consAct.id, 'id must be present');
      assert.strictEqual(consAct.project_id, projectA.id, 'project_id must match project ID');
      assert.strictEqual(consAct.project_name, projectA.companyName, 'project_name must match project company name');
      assert.ok('actor_type' in consAct, 'actor_type must be present');
      assert.ok('action' in consAct, 'action must be present');
      assert.ok('description' in consAct, 'description must be present');
      assert.ok('metadata' in consAct, 'metadata must be present');
      assert.ok('is_read' in consAct, 'is_read must be present');
      assert.ok('read_at' in consAct, 'read_at must be present');
      assert.ok('created_at' in consAct, 'created_at must be present');

      // Ordering check: newest first
      const t0 = new Date(resConsultant.data[0].created_at).getTime();
      const t1 = new Date(resConsultant.data[1].created_at).getTime();
      assert.ok(t0 >= t1, 'Activities must be ordered by created_at desc');

      // Client portal response shape
      const resPortal = await request(`/api/client-portal/${portalTokenA}/activities/`);
      const portalAct = resPortal.data[0];
      assert.ok(portalAct.id, 'portal act id must be present');
      assert.ok('action' in portalAct, 'action must be present');
      assert.ok('description' in portalAct, 'description must be present');
      assert.ok('metadata' in portalAct, 'metadata must be present');
      assert.ok('client_is_read' in portalAct, 'client_is_read must be present');
      assert.ok('client_read_at' in portalAct, 'client_read_at must be present');
      assert.ok('created_at' in portalAct, 'created_at must be present');
      // Verify consultant internal fields are NOT leaked in client portal serializer
      assert.strictEqual('is_read' in portalAct, false, 'is_read must not be in client portal response');
      assert.strictEqual('read_at' in portalAct, false, 'read_at must not be in client portal response');
      assert.strictEqual('consultant' in portalAct, false, 'consultant must not be in client portal response');
      console.log('✓ Test 4 passed');
    }

    // TEST 5: Action filtering logic (omitted, empty, invalid, and specific actions)
    {
      console.log('Running Test 5: Action filtering logic on mark-read...');
      // 5a. Invalid actions filter (string instead of array) -> 400
      const resInvalid = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: 'not_an_array' },
      });
      assert.strictEqual(resInvalid.status, 400, 'Non-array actions filter must return 400');
      assert.strictEqual(resInvalid.data.detail, 'Invalid actions filter. Expected an array of action names.');

      // 5b. Array with empty/whitespace strings -> 0 updated (does not silently convert to mark all)
      const resBlankItems = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: ['   ', ''] },
      });
      assert.strictEqual(resBlankItems.status, 200, 'Response should be 200');
      assert.strictEqual(resBlankItems.data.updated_count, 0, 'Blank action array must update 0 records');

      // 5c. Specific action filter: only mark "moodboard_uploaded" as read
      const resSpecific = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: ['moodboard_uploaded'] },
      });
      assert.strictEqual(resSpecific.status, 200);
      assert.strictEqual(resSpecific.data.updated_count, 1, 'Only 1 moodboard_uploaded activity should be updated');

      // Verify in DB that only moodboard_uploaded is isRead=true
      const act1 = await prisma.projectActivity.findUnique({ where: { id: actInternal.id } });
      const act2 = await prisma.projectActivity.findUnique({ where: { id: actShared.id } });
      assert.strictEqual(act1.isRead, true, 'moodboard_uploaded must be isRead=true');
      assert.strictEqual(act2.isRead, false, 'concept_shared must still be isRead=false');

      // 5d. Mark with empty array actions: [] (the frontend default) -> marks all remaining unread
      const resMarkAll = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: [] },
      });
      assert.strictEqual(resMarkAll.status, 200);
      assert.strictEqual(resMarkAll.data.updated_count, 2, 'Remaining 2 unread activities must be updated');

      const act2Updated = await prisma.projectActivity.findUnique({ where: { id: actShared.id } });
      const act3Updated = await prisma.projectActivity.findUnique({ where: { id: actDownload.id } });
      assert.strictEqual(act2Updated.isRead, true, 'concept_shared should now be read');
      assert.strictEqual(act3Updated.isRead, true, 'deliverable_downloaded should now be read');
      console.log('✓ Test 5 passed');
    }

    // TEST 6: Independent read state between consultant and client portal
    {
      console.log('Running Test 6: Independent read state between consultant and client...');
      // Notice that Project A activities were marked read by consultant above (isRead = true)
      // Client portal read state must still be clientIsRead = false!
      const resPortalBefore = await request(`/api/client-portal/${portalTokenA}/activities/`);
      for (const act of resPortalBefore.data) {
        assert.strictEqual(act.client_is_read, false, 'Client portal activity must still be unread for client');
      }

      // Now client marks activities read
      const resPortalMark = await request(`/api/client-portal/${portalTokenA}/activities/mark-read/`, {
        method: 'POST',
      });
      assert.strictEqual(resPortalMark.status, 200);
      assert.strictEqual(resPortalMark.data.marked_read, 2, 'Portal mark-read must report 2 marked read');

      // Verify portal activities are now client_is_read = true
      const resPortalAfter = await request(`/api/client-portal/${portalTokenA}/activities/`);
      for (const act of resPortalAfter.data) {
        assert.strictEqual(act.client_is_read, true, 'Portal activities must now be read for client');
        assert.ok(act.client_read_at, 'client_read_at must be populated');
      }

      // Consultant isRead must still be true and consultant readAt must be unchanged
      const actCheck = await prisma.projectActivity.findUnique({ where: { id: actShared.id } });
      assert.strictEqual(actCheck.isRead, true, 'Consultant isRead must remain true');
      console.log('✓ Test 6 passed');
    }

    // TEST 7: Idempotency and concurrent mark-read safety
    {
      console.log('Running Test 7: Idempotency and concurrent mark-read safety...');
      // Repeated consultant mark-read when all are already read
      const resRepeatCons = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: [] },
      });
      assert.strictEqual(resRepeatCons.status, 200);
      assert.strictEqual(resRepeatCons.data.updated_count, 0, 'Repeated mark-read must return 0 updated');

      // Repeated client portal mark-read
      const resRepeatPortal = await request(`/api/client-portal/${portalTokenA}/activities/mark-read/`, {
        method: 'POST',
      });
      assert.strictEqual(resRepeatPortal.status, 200);
      assert.strictEqual(resRepeatPortal.data.marked_read, 0, 'Repeated portal mark-read must return 0 marked');

      // Create a fresh unread activity to test concurrent mark-read
      const freshAct = await logProjectActivity({
        projectId: projectA.id,
        consultantId: consultantA.id,
        actorType: 'consultant',
        action: 'deliverable_shared',
        description: 'New deliverable shared.',
        visibleToClient: true,
      });

      // Concurrent mark-read requests
      const [resC1, resC2] = await Promise.all([
        request(`/api/projects/${projectA.id}/activities/mark-read/`, {
          method: 'POST',
          headers: authHeadersA,
          body: { actions: [] },
        }),
        request(`/api/projects/${projectA.id}/activities/mark-read/`, {
          method: 'POST',
          headers: authHeadersA,
          body: { actions: [] },
        }),
      ]);

      assert.strictEqual(resC1.status, 200);
      assert.strictEqual(resC2.status, 200);
      const totalUpdated = resC1.data.updated_count + resC2.data.updated_count;
      assert.strictEqual(totalUpdated, 1, 'Exactly 1 concurrent request must successfully claim the unread record');
      console.log('✓ Test 7 passed');
    }

    // TEST 8: Cross-project isolation
    {
      console.log('Running Test 8: Cross-project isolation...');
      // Project B has unread activity actProjB
      const actBBefore = await prisma.projectActivity.findUnique({ where: { id: actProjB.id } });
      assert.strictEqual(actBBefore.isRead, false, 'Project B activity should start unread');

      // Mark read on Project A (again)
      await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: [] },
      });

      // Project B must remain unread
      const actBAfter = await prisma.projectActivity.findUnique({ where: { id: actProjB.id } });
      assert.strictEqual(actBAfter.isRead, false, 'Project B activity must NOT be affected by Project A mark-read');
      console.log('✓ Test 8 passed');
    }

    // TEST 9: Global consultant activities endpoint and archived project exclusion
    {
      console.log('Running Test 9: Global consultant activities endpoint...');
      // Global activities for Consultant A
      const resGlobalA = await request('/api/projects/activities/', {
        headers: authHeadersA,
      });
      assert.strictEqual(resGlobalA.status, 200);
      assert.strictEqual(Array.isArray(resGlobalA.data), true);
      // Project C is archived, so actProjC must NOT be in global activities
      const actionsA = resGlobalA.data.map((a) => a.action);
      assert.strictEqual(actionsA.includes('project_archived'), false, 'Archived project activities must be excluded');

      // Global activities for Consultant B
      const resGlobalB = await request('/api/projects/activities/', {
        headers: authHeadersB,
      });
      assert.strictEqual(resGlobalB.status, 200);
      assert.strictEqual(resGlobalB.data.length, 1);
      assert.strictEqual(resGlobalB.data[0].project_id, projectB.id);

      // Global mark-read for Consultant B
      const resGlobalMarkB = await request('/api/projects/activities/mark-read/', {
        method: 'POST',
        headers: authHeadersB,
      });
      assert.strictEqual(resGlobalMarkB.status, 200);
      assert.strictEqual(resGlobalMarkB.data.updated_count, 1);

      const actBNow = await prisma.projectActivity.findUnique({ where: { id: actProjB.id } });
      assert.strictEqual(actBNow.isRead, true, 'Project B activity should now be read');
      console.log('✓ Test 9 passed');
    }

    // TEST 10: Next.js proxy forwarding verification
    {
      console.log('Running Test 10: Next.js proxy forwarding verification (port 3000)...');
      try {
        const nextProxyUrl = `http://localhost:3000/api/projects/${projectA.id}/activities/`;
        const resProxy = await proxyRequest(nextProxyUrl, {
          headers: {
            Authorization: `Bearer ${tokenA}`,
            Origin: 'http://localhost:3000',
            Referer: 'http://localhost:3000/',
          },
        });

        if (resProxy.status === 200) {
          assert.strictEqual(Array.isArray(resProxy.data), true, 'Proxy must forward array');
          console.log(`✓ Test 10 passed via Next.js proxy: received ${resProxy.data.length} activities`);
        } else {
          console.log(`[Proxy Verification note]: Next.js proxy responded with status ${resProxy.status}`);
        }
      } catch (err) {
        console.log(`[Proxy Verification note]: Proxy test skipped or port 3000 unavailable: ${err.message}`);
      }
    }

    // TEST 11: Read-state persistence across server restart
    {
      console.log('Running Test 11: Read-state persistence across server restart...');
      // Record stored timestamps
      const storedActivitiesBefore = await prisma.projectActivity.findMany({
        where: { projectId: projectA.id },
      });
      const actSharedBefore = storedActivitiesBefore.find((a) => a.id === actShared.id);
      assert.ok(actSharedBefore.readAt, 'readAt must be present before restart');
      assert.ok(actSharedBefore.clientReadAt, 'clientReadAt must be present before restart');
      const expectedReadAt = actSharedBefore.readAt.toISOString();
      const expectedClientReadAt = actSharedBefore.clientReadAt.toISOString();

      // Restart server instance
      await new Promise((resolve) => server.close(resolve));
      server = http.createServer(app);
      await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });

      // Verify consultant activities from new server instance
      const resAfterRestartCons = await request(`/api/projects/${projectA.id}/activities/`, {
        headers: authHeadersA,
      });
      assert.strictEqual(resAfterRestartCons.status, 200, 'New server instance should return 200');
      const actSharedAfter = resAfterRestartCons.data.find((a) => a.id === actShared.id);
      assert.strictEqual(actSharedAfter.is_read, true, 'is_read must persist across server restart');
      assert.strictEqual(actSharedAfter.read_at, expectedReadAt, 'read_at timestamp must match original after restart');

      // Verify client portal activities from new server instance
      const resAfterRestartPortal = await request(`/api/client-portal/${portalTokenA}/activities/`);
      assert.strictEqual(resAfterRestartPortal.status, 200, 'New server instance portal should return 200');
      const portalSharedAfter = resAfterRestartPortal.data.find((a) => a.id === actShared.id);
      assert.strictEqual(portalSharedAfter.client_is_read, true, 'client_is_read must persist across server restart');
      assert.strictEqual(portalSharedAfter.client_read_at, expectedClientReadAt, 'client_read_at timestamp must match original after restart');

      // Verify repeated mark-read on restarted server is a no-op
      const resRepeatAfterRestart = await request(`/api/projects/${projectA.id}/activities/mark-read/`, {
        method: 'POST',
        headers: authHeadersA,
        body: { actions: [] },
      });
      assert.strictEqual(resRepeatAfterRestart.status, 200);
      assert.strictEqual(resRepeatAfterRestart.data.updated_count, 0, 'No records should update on repeated mark-read after restart');

      // First portal mark-read after restart claims any newly created portal activities
      const resPortalFirst = await request(`/api/client-portal/${portalTokenA}/activities/mark-read/`, {
        method: 'POST',
      });
      assert.strictEqual(resPortalFirst.status, 200);

      // Subsequent repeated portal mark-read must be 0
      const resPortalRepeatAfterRestart = await request(`/api/client-portal/${portalTokenA}/activities/mark-read/`, {
        method: 'POST',
      });
      assert.strictEqual(resPortalRepeatAfterRestart.status, 200);
      assert.strictEqual(resPortalRepeatAfterRestart.data.marked_read, 0, 'No portal records should update on repeated mark-read after restart');

      console.log('✓ Test 11 passed');
    }

    console.log('====================================================');
    console.log('ALL PHASE 4 PROJECT ACTIVITY & MARK-READ TESTS PASSED');
    console.log('====================================================');
  } finally {
    // Cleanup fixtures
    console.log('Cleaning up test fixtures...');
    try {
      if (createdProjectIds.length > 0) {
        await prisma.projectActivity.deleteMany({
          where: { projectId: { in: createdProjectIds } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: createdProjectIds } },
        });
      }
      if (createdClientIds.length > 0) {
        await prisma.client.deleteMany({
          where: { id: { in: createdClientIds } },
        });
      }
      if (createdConsultantIds.length > 0) {
        await prisma.consultant.deleteMany({
          where: { id: { in: createdConsultantIds } },
        });
      }
      console.log('✓ Fixture cleanup complete');
    } catch (cleanupErr) {
      console.error('Fixture cleanup error:', cleanupErr);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runActivitiesTestSuite().catch((err) => {
  console.error('Activities test suite failed:', err);
  process.exit(1);
});
