import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { prisma } from '../dist/prisma/client.js';
import { ENV } from '../dist/config/env.js';
import { app } from '../dist/app.js';
import { setMockRazorpayClient } from '../dist/services/razorpay.service.js';
import {
  setTestContentionHook,
  setTestFailureInjectionHook,
} from '../dist/services/payment.service.js';

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
  reset(count) {
    this.target = count;
    this.count = 0;
    this.waiters = [];
  }
}

async function runPaymentConcurrencyTests() {
  console.log('================================================================');
  console.log('  FLOXA PAYMENT CONCURRENCY & STATE ATOMICITY REGRESSION SUITE  ');
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
  const mockPayments = new Map();
  const createdFiles = [];

  setMockRazorpayClient({
    payments: {
      fetch: async (paymentId) => {
        if (mockPayments.has(paymentId)) {
          return mockPayments.get(paymentId);
        }
        throw new Error(`Mock Payment ${paymentId} not found`);
      },
    },
  });

  const testIds = {
    consultants: [],
    clients: [],
    projects: [],
  };

  try {
    // -------------------------------------------------------------
    // Base Fixtures
    // -------------------------------------------------------------
    const consultant = await prisma.consultant.create({
      data: {
        email: `concur_test_c_${testSuffix}@floxa.test`,
        password: 'hash_placeholder',
        name: 'Concurrency Test Consultant',
      },
    });
    testIds.consultants.push(consultant.id);

    const client = await prisma.client.create({
      data: {
        name: 'Concurrency Test Client',
        email: `concur_test_cl_${testSuffix}@floxa.test`,
        companyName: 'Atomic Corp',
        sector: 'Technology',
      },
    });
    testIds.clients.push(client.id);

    const project = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Atomic Payment Project',
        companyName: 'Atomic Corp',
        sector: 'Technology',
        projectValue: 100000.0,
        advancePercentage: 50,
        midPercentage: 25,
        finalPercentage: 25,
        portalToken: `token-atomic-${testSuffix}`,
      },
    });
    testIds.projects.push(project.id);

    // =============================================================
    // TEST 1: Simultaneous Verification Request + Webhook Event
    // Barrier coordinated: guarantees contested transition overlap
    // =============================================================
    console.log('\n[TEST 1] Simultaneous Verify Request + Webhook for same payment (Contested Barrier)...');
    const m1 = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'advance',
        percentage: 50,
        amount: 50000.0,
        status: 'requested',
      },
    });

    const orderId1 = `order_t1_${testSuffix}`;
    const paymentId1 = `pay_t1_${testSuffix}`;
    const eventId1 = `evt_t1_${testSuffix}`;

    const tx1 = await prisma.paymentTransaction.create({
      data: {
        projectId: project.id,
        milestoneId: m1.id,
        razorpayOrderId: orderId1,
        amount: 50000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    mockPayments.set(paymentId1, {
      id: paymentId1,
      order_id: orderId1,
      amount: 5000000,
      currency: 'INR',
      status: 'captured',
    });

    const verifySig1 = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(`${orderId1}|${paymentId1}`)
      .digest('hex');

    const whPayload1 = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId1,
            order_id: orderId1,
            amount: 5000000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawWh1 = JSON.stringify(whPayload1);
    const whSig1 = crypto
      .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
      .update(rawWh1)
      .digest('hex');

    // Barrier of 2: both handlers must enter the atomic transition before either commits
    const barrier1 = new Barrier(2);
    setTestContentionHook(async () => {
      await barrier1.wait();
    });

    const [vRes1, whRes1] = await Promise.all([
      request(`/api/client-portal/${project.portalToken}/payments/verify/`, {
        method: 'POST',
        body: {
          razorpay_order_id: orderId1,
          razorpay_payment_id: paymentId1,
          razorpay_signature: verifySig1,
        },
      }),
      request('/api/payments/razorpay/webhook/', {
        method: 'POST',
        headers: {
          'x-razorpay-signature': whSig1,
          'x-razorpay-event-id': eventId1,
        },
        body: rawWh1,
      }),
    ]);

    setTestContentionHook(null);

    if (vRes1.status !== 200) {
      throw new Error(`Verify failed with status ${vRes1.status}: ${JSON.stringify(vRes1.data)}`);
    }
    if (whRes1.status !== 200) {
      throw new Error(`Webhook failed with status ${whRes1.status}: ${JSON.stringify(whRes1.data)}`);
    }

    // Inspect database effects
    const acts1 = await prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        action: 'payment_received',
        metadata: { contains: `"payment_milestone_id":"${m1.id}"` },
      },
    });

    const tx1After = await prisma.paymentTransaction.findUnique({ where: { id: tx1.id } });
    const m1After = await prisma.paymentMilestone.findUnique({ where: { id: m1.id } });

    console.log(`  Verify Status: ${vRes1.status}, Webhook Status: ${whRes1.status}`);
    console.log(`  Database Effects:`);
    console.log(`    payment_received activity count: ${acts1.length} (MUST be exactly 1)`);
    console.log(`    Transaction status: ${tx1After.status}, verifiedAt: ${tx1After.verifiedAt?.toISOString()}`);
    console.log(`    Milestone status: ${m1After.status}, paidAt: ${m1After.paidAt?.toISOString()}`);

    if (acts1.length !== 1) {
      throw new Error(`Expected exactly 1 payment_received activity, got ${acts1.length}`);
    }
    if (tx1After.status !== 'verified' || m1After.status !== 'paid') {
      throw new Error(`Invalid final state: tx=${tx1After.status}, ms=${m1After.status}`);
    }
    if (!tx1After.verifiedAt || !m1After.paidAt || tx1After.verifiedAt.getTime() !== m1After.paidAt.getTime()) {
      throw new Error('Timestamps between transaction and milestone do not match');
    }
    console.log('  ✓ TEST 1 PASS: Exactly 1 activity created, timestamps aligned, atomic single transition.');

    // =============================================================
    // TEST 2: Duplicate Simultaneous Verification Requests
    // =============================================================
    console.log('\n[TEST 2] Duplicate simultaneous verification requests for the same order...');
    const m2 = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'mid',
        percentage: 25,
        amount: 25000.0,
        status: 'requested',
      },
    });

    const orderId2 = `order_t2_${testSuffix}`;
    const paymentId2 = `pay_t2_${testSuffix}`;

    const tx2 = await prisma.paymentTransaction.create({
      data: {
        projectId: project.id,
        milestoneId: m2.id,
        razorpayOrderId: orderId2,
        amount: 25000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    mockPayments.set(paymentId2, {
      id: paymentId2,
      order_id: orderId2,
      amount: 2500000,
      currency: 'INR',
      status: 'captured',
    });

    const verifySig2 = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(`${orderId2}|${paymentId2}`)
      .digest('hex');

    const barrier2 = new Barrier(2);
    setTestContentionHook(async () => {
      await barrier2.wait();
    });

    const verifyBody2 = {
      razorpay_order_id: orderId2,
      razorpay_payment_id: paymentId2,
      razorpay_signature: verifySig2,
    };

    const [vRes2a, vRes2b] = await Promise.all([
      request(`/api/client-portal/${project.portalToken}/payments/verify/`, {
        method: 'POST',
        body: verifyBody2,
      }),
      request(`/api/client-portal/${project.portalToken}/payments/verify/`, {
        method: 'POST',
        body: verifyBody2,
      }),
    ]);

    setTestContentionHook(null);

    if (vRes2a.status !== 200 || vRes2b.status !== 200) {
      throw new Error(`Expected both 200, got ${vRes2a.status} and ${vRes2b.status}`);
    }

    const acts2 = await prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        action: 'payment_received',
        metadata: { contains: `"payment_milestone_id":"${m2.id}"` },
      },
    });

    console.log(`  Activity count for duplicate verification: ${acts2.length} (MUST be 1)`);
    if (acts2.length !== 1) {
      throw new Error(`Expected exactly 1 activity for duplicate verify, got ${acts2.length}`);
    }
    console.log('  ✓ TEST 2 PASS: Duplicate simultaneous verification returned 200 with exactly 1 activity.');

    // =============================================================
    // TEST 3: Duplicate Webhook Deliveries (Same Event ID)
    // =============================================================
    console.log('\n[TEST 3] Duplicate simultaneous webhook deliveries (same event ID)...');
    const m3 = await prisma.paymentMilestone.create({
      data: {
        projectId: project.id,
        type: 'final',
        percentage: 25,
        amount: 25000.0,
        status: 'requested',
      },
    });

    const orderId3 = `order_t3_${testSuffix}`;
    const paymentId3 = `pay_t3_${testSuffix}`;
    const eventId3 = `evt_t3_${testSuffix}`;

    await prisma.paymentTransaction.create({
      data: {
        projectId: project.id,
        milestoneId: m3.id,
        razorpayOrderId: orderId3,
        amount: 25000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    const whPayload3 = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId3,
            order_id: orderId3,
            amount: 2500000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawWh3 = JSON.stringify(whPayload3);
    const whSig3 = crypto
      .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
      .update(rawWh3)
      .digest('hex');

    const [whRes3a, whRes3b] = await Promise.all([
      request('/api/payments/razorpay/webhook/', {
        method: 'POST',
        headers: {
          'x-razorpay-signature': whSig3,
          'x-razorpay-event-id': eventId3,
        },
        body: rawWh3,
      }),
      request('/api/payments/razorpay/webhook/', {
        method: 'POST',
        headers: {
          'x-razorpay-signature': whSig3,
          'x-razorpay-event-id': eventId3,
        },
        body: rawWh3,
      }),
    ]);

    if (whRes3a.status !== 200 || whRes3b.status !== 200) {
      throw new Error(`Expected both 200, got ${whRes3a.status} and ${whRes3b.status}`);
    }

    const eventRecords3 = await prisma.razorpayWebhookEvent.findMany({
      where: { razorpayEventId: eventId3 },
    });
    if (eventRecords3.length !== 1 || eventRecords3[0].processingStatus !== 'processed') {
      throw new Error(`Expected 1 processed webhook event record, found: ${JSON.stringify(eventRecords3)}`);
    }

    const acts3 = await prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        action: 'payment_received',
        metadata: { contains: `"payment_milestone_id":"${m3.id}"` },
      },
    });
    if (acts3.length !== 1) {
      throw new Error(`Expected 1 activity for duplicate webhook, got ${acts3.length}`);
    }
    console.log('  ✓ TEST 3 PASS: Duplicate webhook deliveries safely deduplicated without race errors.');

    // =============================================================
    // TEST 4: Different Webhook Event IDs for the same payment
    // =============================================================
    console.log('\n[TEST 4] Different webhook event IDs referring to the same payment...');
    const eventId4b = `evt_t4_different_id_${testSuffix}`;

    const replayDifferentEventIdRes = await request('/api/payments/razorpay/webhook/', {
      method: 'POST',
      headers: {
        'x-razorpay-signature': whSig3,
        'x-razorpay-event-id': eventId4b,
      },
      body: rawWh3,
    });

    if (replayDifferentEventIdRes.status !== 200 || replayDifferentEventIdRes.data?.detail !== 'Webhook processed.') {
      throw new Error(`Expected 200 'Webhook processed.', got ${replayDifferentEventIdRes.status}`);
    }

    const acts4 = await prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        action: 'payment_received',
        metadata: { contains: `"payment_milestone_id":"${m3.id}"` },
      },
    });
    if (acts4.length !== 1) {
      throw new Error(`Expected activity count to remain 1 after different event ID, got ${acts4.length}`);
    }

    const eventRecord4b = await prisma.razorpayWebhookEvent.findUnique({
      where: { razorpayEventId: eventId4b },
    });
    if (!eventRecord4b || eventRecord4b.processingStatus !== 'processed') {
      throw new Error(`Second webhook event record was not marked processed: ${JSON.stringify(eventRecord4b)}`);
    }
    console.log('  ✓ TEST 4 PASS: Different event ID for same payment acknowledged and marked processed with 0 duplicate activities.');

    // =============================================================
    // TEST 5: Manual vs Online Payment Conflicts
    // =============================================================
    console.log('\n[TEST 5] Manual vs Online payment conflict handling...');
    // Create new project for fresh milestone tests
    const projectManual = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Manual vs Online Project',
        companyName: 'Atomic Corp',
        sector: 'Technology',
        projectValue: 50000.0,
        advancePercentage: 100,
        portalToken: `token-manual-${testSuffix}`,
      },
    });
    testIds.projects.push(projectManual.id);

    const mManual = await prisma.paymentMilestone.create({
      data: {
        projectId: projectManual.id,
        type: 'advance',
        percentage: 100,
        amount: 50000.0,
        status: 'requested',
      },
    });

    const orderIdManual = `order_manual_${testSuffix}`;
    const paymentIdManual = `pay_manual_${testSuffix}`;

    const txManual = await prisma.paymentTransaction.create({
      data: {
        projectId: projectManual.id,
        milestoneId: mManual.id,
        razorpayOrderId: orderIdManual,
        amount: 50000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    // 5A: Mark paid manually first with consultant auth
    const consultantToken = jwt.sign(
      { userId: consultant.id, email: consultant.email },
      ENV.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );

    const manualRes = await request(`/api/projects/${projectManual.id}/payments/${mManual.id}/mark-paid/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${consultantToken}`,
      },
    });
    if (manualRes.status !== 200) {
      throw new Error(`Manual pay failed: status=${manualRes.status}, ${JSON.stringify(manualRes.data)}`);
    }

    // Now attempt online verification for same milestone -> MUST fail with 400
    mockPayments.set(paymentIdManual, {
      id: paymentIdManual,
      order_id: orderIdManual,
      amount: 5000000,
      currency: 'INR',
      status: 'captured',
    });
    const verifySigManual = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(`${orderIdManual}|${paymentIdManual}`)
      .digest('hex');

    const onlineAttemptRes = await request(`/api/client-portal/${projectManual.portalToken}/payments/verify/`, {
      method: 'POST',
      body: {
        razorpay_order_id: orderIdManual,
        razorpay_payment_id: paymentIdManual,
        razorpay_signature: verifySigManual,
      },
    });

    if (onlineAttemptRes.status !== 400 || onlineAttemptRes.data?.detail !== 'Only requested payment milestones can be verified.') {
      throw new Error(`Expected 400 rejection for online verify after manual pay, got ${onlineAttemptRes.status}`);
    }

    const txAfterManual = await prisma.paymentTransaction.findUnique({ where: { id: txManual.id } });
    if (txAfterManual.status !== 'created') {
      throw new Error(`Transaction was mutated despite milestone already paid: ${txAfterManual.status}`);
    }
    console.log('  ✓ TEST 5 PASS: Online payment correctly rejected when milestone already paid manually.');

    // =============================================================
    // TEST 6: Different Payment Transactions targeting same Milestone
    // (Preserve genuine second provider payment evidence, do not silently merge)
    // =============================================================
    console.log('\n[TEST 6] Conflicting transactions targeting same milestone...');
    const projectMultiTx = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Multi-Tx Project',
        companyName: 'Atomic Corp',
        sector: 'Technology',
        projectValue: 30000.0,
        advancePercentage: 100,
        portalToken: `token-multitx-${testSuffix}`,
      },
    });
    testIds.projects.push(projectMultiTx.id);

    const mMulti = await prisma.paymentMilestone.create({
      data: {
        projectId: projectMultiTx.id,
        type: 'advance',
        percentage: 100,
        amount: 30000.0,
        status: 'requested',
      },
    });

    const orderIdA = `order_multi_a_${testSuffix}`;
    const paymentIdA = `pay_multi_a_${testSuffix}`;
    const txA = await prisma.paymentTransaction.create({
      data: {
        projectId: projectMultiTx.id,
        milestoneId: mMulti.id,
        razorpayOrderId: orderIdA,
        amount: 30000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    const orderIdB = `order_multi_b_${testSuffix}`;
    const paymentIdB = `pay_multi_b_${testSuffix}`;
    const txB = await prisma.paymentTransaction.create({
      data: {
        projectId: projectMultiTx.id,
        milestoneId: mMulti.id,
        razorpayOrderId: orderIdB,
        amount: 30000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    // Verify Tx A
    mockPayments.set(paymentIdA, {
      id: paymentIdA,
      order_id: orderIdA,
      amount: 3000000,
      currency: 'INR',
      status: 'captured',
    });
    const sigA = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(`${orderIdA}|${paymentIdA}`).digest('hex');

    const verifyARes = await request(`/api/client-portal/${projectMultiTx.portalToken}/payments/verify/`, {
      method: 'POST',
      body: {
        razorpay_order_id: orderIdA,
        razorpay_payment_id: paymentIdA,
        razorpay_signature: sigA,
      },
    });
    if (verifyARes.status !== 200) {
      throw new Error(`Verify Tx A failed: ${verifyARes.status}`);
    }

    // Attempt to verify Tx B with a genuine second payment ID -> MUST fail and preserve Tx B evidence
    mockPayments.set(paymentIdB, {
      id: paymentIdB,
      order_id: orderIdB,
      amount: 3000000,
      currency: 'INR',
      status: 'captured',
    });
    const sigB = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(`${orderIdB}|${paymentIdB}`).digest('hex');

    const verifyBRes = await request(`/api/client-portal/${projectMultiTx.portalToken}/payments/verify/`, {
      method: 'POST',
      body: {
        razorpay_order_id: orderIdB,
        razorpay_payment_id: paymentIdB,
        razorpay_signature: sigB,
      },
    });

    if (verifyBRes.status !== 400) {
      throw new Error(`Expected 400 rejection for Tx B, got ${verifyBRes.status}`);
    }

    // Verify Tx B was NOT modified or merged into Tx A
    const txBAfter = await prisma.paymentTransaction.findUnique({ where: { id: txB.id } });
    if (txBAfter.status !== 'created' || txBAfter.razorpayPaymentId) {
      throw new Error(`Tx B was corrupted or silently merged: ${JSON.stringify(txBAfter)}`);
    }
    console.log('  ✓ TEST 6 PASS: Second transaction rejected without silent overwriting or loss of payment evidence.');

    // =============================================================
    // TEST 7: Failure Between Writes (Partial-Write Rollback & Recovery)
    // =============================================================
    console.log('\n[TEST 7] Simulated failure between writes (Transaction Rollback & Recovery)...');
    const projectRollback = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Rollback Project',
        companyName: 'Atomic Corp',
        sector: 'Technology',
        projectValue: 40000.0,
        advancePercentage: 100,
        portalToken: `token-rollback-${testSuffix}`,
      },
    });
    testIds.projects.push(projectRollback.id);

    const mRollback = await prisma.paymentMilestone.create({
      data: {
        projectId: projectRollback.id,
        type: 'advance',
        percentage: 100,
        amount: 40000.0,
        status: 'requested',
      },
    });

    const orderIdRollback = `order_rb_${testSuffix}`;
    const paymentIdRollback = `pay_rb_${testSuffix}`;

    const txRollback = await prisma.paymentTransaction.create({
      data: {
        projectId: projectRollback.id,
        milestoneId: mRollback.id,
        razorpayOrderId: orderIdRollback,
        amount: 40000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    mockPayments.set(paymentIdRollback, {
      id: paymentIdRollback,
      order_id: orderIdRollback,
      amount: 4000000,
      currency: 'INR',
      status: 'captured',
    });
    const sigRollback = crypto
      .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
      .update(`${orderIdRollback}|${paymentIdRollback}`)
      .digest('hex');

    // Inject failure between transaction update and milestone update
    setTestFailureInjectionHook(() => {
      throw new Error('SIMULATED_DB_CRASH_BETWEEN_WRITES');
    });

    const failedRes = await request(`/api/client-portal/${projectRollback.portalToken}/payments/verify/`, {
      method: 'POST',
      body: {
        razorpay_order_id: orderIdRollback,
        razorpay_payment_id: paymentIdRollback,
        razorpay_signature: sigRollback,
      },
    });

    // Clear injection hook
    setTestFailureInjectionHook(null);

    // Verify error was returned
    if (failedRes.status === 200) {
      throw new Error('Simulated failure did not trigger an error response');
    }

    // Verify COMPLETE ROLLBACK
    const txAfterCrash = await prisma.paymentTransaction.findUnique({ where: { id: txRollback.id } });
    const msAfterCrash = await prisma.paymentMilestone.findUnique({ where: { id: mRollback.id } });
    const actsAfterCrash = await prisma.projectActivity.findMany({
      where: {
        projectId: projectRollback.id,
        action: 'payment_received',
      },
    });

    console.log(`  State after simulated mid-write failure:`);
    console.log(`    Transaction status: ${txAfterCrash.status} (MUST be 'created')`);
    console.log(`    Milestone status: ${msAfterCrash.status} (MUST be 'requested')`);
    console.log(`    Activities count: ${actsAfterCrash.length} (MUST be 0)`);

    if (txAfterCrash.status !== 'created') {
      throw new Error(`Transaction was NOT rolled back: status=${txAfterCrash.status}`);
    }
    if (msAfterCrash.status !== 'requested') {
      throw new Error(`Milestone was NOT rolled back: status=${msAfterCrash.status}`);
    }
    if (actsAfterCrash.length !== 0) {
      throw new Error(`Activities were created despite rollback: ${actsAfterCrash.length}`);
    }

    // Now test SUCCESSFUL RECOVERY
    console.log('  Testing recovery retry without failure injection...');
    const retryRes = await request(`/api/client-portal/${projectRollback.portalToken}/payments/verify/`, {
      method: 'POST',
      body: {
        razorpay_order_id: orderIdRollback,
        razorpay_payment_id: paymentIdRollback,
        razorpay_signature: sigRollback,
      },
    });

    if (retryRes.status !== 200) {
      throw new Error(`Recovery retry failed: status=${retryRes.status}, data=${JSON.stringify(retryRes.data)}`);
    }

    const txRecovered = await prisma.paymentTransaction.findUnique({ where: { id: txRollback.id } });
    const msRecovered = await prisma.paymentMilestone.findUnique({ where: { id: mRollback.id } });
    const actsRecovered = await prisma.projectActivity.findMany({
      where: { projectId: projectRollback.id, action: 'payment_received' },
    });

    if (txRecovered.status !== 'verified' || msRecovered.status !== 'paid' || actsRecovered.length !== 1) {
      throw new Error('Recovery did not reach complete valid paid state');
    }
    console.log('  ✓ TEST 7 PASS: Complete rollback confirmed on partial-write failure; clean recovery succeeded.');

    // =============================================================
    // TEST 8: Webhook Recoverability on Prior Failed Event
    // =============================================================
    console.log('\n[TEST 8] Webhook event recoverability on prior failed status...');
    const projectWhRetry = await prisma.project.create({
      data: {
        consultantId: consultant.id,
        clientId: client.id,
        title: 'Webhook Retry Project',
        companyName: 'Atomic Corp',
        sector: 'Technology',
        projectValue: 15000.0,
        advancePercentage: 100,
        portalToken: `token-whretry-${testSuffix}`,
      },
    });
    testIds.projects.push(projectWhRetry.id);

    const mWhRetry = await prisma.paymentMilestone.create({
      data: {
        projectId: projectWhRetry.id,
        type: 'advance',
        percentage: 100,
        amount: 15000.0,
        status: 'requested',
      },
    });

    const orderIdWhRetry = `order_wh_retry_${testSuffix}`;
    const paymentIdWhRetry = `pay_wh_retry_${testSuffix}`;
    const eventIdWhRetry = `evt_wh_retry_${testSuffix}`;

    await prisma.paymentTransaction.create({
      data: {
        projectId: projectWhRetry.id,
        milestoneId: mWhRetry.id,
        razorpayOrderId: orderIdWhRetry,
        amount: 15000.0,
        currency: 'INR',
        status: 'created',
      },
    });

    // Create a pre-existing FAILED event record (simulating a prior failed delivery attempt)
    await prisma.razorpayWebhookEvent.create({
      data: {
        razorpayEventId: eventIdWhRetry,
        eventType: 'payment.captured',
        processingStatus: 'failed',
        failureReason: 'Prior transient network failure',
      },
    });

    const whPayloadRetry = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentIdWhRetry,
            order_id: orderIdWhRetry,
            amount: 1500000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawWhRetry = JSON.stringify(whPayloadRetry);
    const whSigRetry = crypto
      .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
      .update(rawWhRetry)
      .digest('hex');

    const whRetryRes = await request('/api/payments/razorpay/webhook/', {
      method: 'POST',
      headers: {
        'x-razorpay-signature': whSigRetry,
        'x-razorpay-event-id': eventIdWhRetry,
      },
      body: rawWhRetry,
    });

    if (whRetryRes.status !== 200 || whRetryRes.data?.detail !== 'Webhook processed.') {
      throw new Error(`Webhook retry failed: status=${whRetryRes.status}`);
    }

    const eventRecordRecovered = await prisma.razorpayWebhookEvent.findUnique({
      where: { razorpayEventId: eventIdWhRetry },
    });
    if (eventRecordRecovered.processingStatus !== 'processed') {
      throw new Error(`Event status not updated to processed: ${eventRecordRecovered.processingStatus}`);
    }
    console.log('  ✓ TEST 8 PASS: Prior failed webhook event safely reprocessed and marked processed.');

    // =============================================================
    // TEST 9: Phase 2 Evidence Gap Verification
    // (Draft-Agreement Denial + Signed-PDF Binary Delivery)
    // =============================================================
    console.log('\n[TEST 9] Phase 2 gap verification: Draft agreement denial & Signed-PDF binary streaming...');
    const mediaAgreementsDir = path.join(ENV.MEDIA_ROOT, 'project_agreements', 'signed');
    if (!fs.existsSync(mediaAgreementsDir)) {
      fs.mkdirSync(mediaAgreementsDir, { recursive: true });
    }

    // 9A: Draft agreement without signature requested -> MUST return 404
    const agreementDraft = await prisma.projectAgreement.create({
      data: {
        projectId: project.id,
        status: 'draft',
        basicPdfFile: 'project_agreements/draft.pdf',
        signatureRequestedAt: null,
      },
    });

    const draftRes = await request(`/api/client-portal/${project.portalToken}/agreement/pdf/`);
    console.log(`  Draft agreement download status: ${draftRes.status}`);
    if (draftRes.status !== 404) {
      throw new Error(`Expected 404 for unshared draft agreement, got ${draftRes.status}`);
    }
    console.log('  ✓ Draft unshared agreement download rejected with 404');

    // 9B: Signed agreement with real binary content
    const signedPdfName = `test_signed_${testSuffix}.pdf`;
    const signedPdfPath = path.join(mediaAgreementsDir, signedPdfName);
    const pdfDummyContent = '%PDF-1.4\n%FLOXA_TEST_SIGNED_AGREEMENT_BINARY_PAYLOAD\n%%EOF';
    fs.writeFileSync(signedPdfPath, pdfDummyContent);
    createdFiles.push(signedPdfPath);

    await prisma.projectAgreement.update({
      where: { id: agreementDraft.id },
      data: {
        status: 'signed',
        signedPdfFile: `project_agreements/signed/${signedPdfName}`,
        signatureRequestedAt: new Date(),
        signedAt: new Date(),
        signerName: 'Test Signer',
      },
    });

    const signedPdfRes = await request(`/api/client-portal/${project.portalToken}/agreement/pdf/?type=signed`);
    console.log(`  Signed PDF response status: ${signedPdfRes.status}, Content-Type: ${signedPdfRes.headers['content-type']}`);
    if (signedPdfRes.status !== 200) {
      throw new Error(`Expected 200 for signed PDF delivery, got ${signedPdfRes.status}`);
    }
    if (!signedPdfRes.headers['content-type']?.includes('application/pdf')) {
      throw new Error(`Expected application/pdf content-type, got: ${signedPdfRes.headers['content-type']}`);
    }
    if (!signedPdfRes.rawText.includes('%FLOXA_TEST_SIGNED_AGREEMENT_BINARY_PAYLOAD')) {
      throw new Error('Corrupted signed PDF payload delivered');
    }
    console.log('  ✓ Signed PDF binary delivered with application/pdf Content-Type and matching payload');

    console.log('\n================================================================');
    console.log('  ALL PAYMENT CONCURRENCY & STATE ATOMICITY TESTS PASSED!      ');
    console.log('================================================================\n');
  } finally {
    setTestContentionHook(null);
    setTestFailureInjectionHook(null);
    if (server) server.close();

    console.log('Cleaning up test fixtures and temporary files...');
    for (const f of createdFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (err) {
        console.warn('Cleanup file warning:', err.message);
      }
    }

    try {
      if (testIds.projects.length > 0) {
        await prisma.projectActivity.deleteMany({ where: { projectId: { in: testIds.projects } } });
        await prisma.paymentTransaction.deleteMany({ where: { projectId: { in: testIds.projects } } });
        await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: testIds.projects } } });
        await prisma.projectAgreement.deleteMany({ where: { projectId: { in: testIds.projects } } });
        await prisma.project.deleteMany({ where: { id: { in: testIds.projects } } });
      }
      if (testIds.clients.length > 0) {
        await prisma.client.deleteMany({ where: { id: { in: testIds.clients } } });
      }
      if (testIds.consultants.length > 0) {
        await prisma.consultant.deleteMany({ where: { id: { in: testIds.consultants } } });
      }
      await prisma.razorpayWebhookEvent.deleteMany({ where: { razorpayEventId: { contains: testSuffix } } });
      console.log('✓ Database fixtures cleanly deleted.');
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
    await prisma.$disconnect();
  }
}

runPaymentConcurrencyTests().catch((err) => {
  console.error('\n❌ CONCURRENCY TEST SUITE FAILED:', err);
  process.exit(1);
});
