'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  startTestServer,
  closeTestServer,
  connectTestDatabase,
  disconnectTestDatabase,
  createTestFixtures,
  buildMultipart,
  models,
} = require('./helpers.cjs');

test('Agreement Digital Signing: Base64, Storage, PDF, Multipart, and Typed Signatures', async (t) => {
  await connectTestDatabase();
  const { baseUrl } = await startTestServer();
  const fixtures = await createTestFixtures();

  const portalToken = fixtures.project.portalToken;
  const projectId = fixtures.project._id;

  // Clean any existing agreement for this project
  await models.ProjectAgreement.deleteMany({ projectId });

  // Create initial test agreement
  const agreement = await models.ProjectAgreement.create({
    projectId,
    status: 'signature_requested',
    basicPdfFile: '/media/project_agreements/basic/test.pdf',
    signerName: '',
    signatureMethod: '',
  });
  const agreementId = agreement._id;

  // Generate a valid 100x40 PNG signature image buffer using sharp
  const validPngBuffer = await sharp({
    create: {
      width: 100,
      height: 40,
      channels: 4,
      background: { r: 16, g: 185, b: 129, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const validPngBase64 = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

  t.after(async () => {
    if (agreementId) await models.ProjectAgreement.deleteOne({ _id: agreementId });
    await fixtures.cleanup();
    await closeTestServer();
    await disconnectTestDatabase();
  });

  await t.test('1. Signs agreement with JSON base64 signature image', async () => {
    const res = await fetch(`${baseUrl}/api/client-portal/${portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Portal-Token': portalToken,
      },
      body: JSON.stringify({
        signer_name: 'Jane Smith',
        signature_method: 'drawn',
        signature_image: validPngBase64,
        has_read_agreement: true,
      }),
    });

    assert.strictEqual(res.status, 200, 'Signing with JSON base64 signature must return 200');
    const data = await res.json();
    assert.strictEqual(data.status, 'signed');
    assert.strictEqual(data.signer_name, 'Jane Smith');

    // Verify DB record
    const updated = await models.ProjectAgreement.findById(agreementId);
    assert.strictEqual(updated.status, 'signed');
    assert.strictEqual(updated.signerName, 'Jane Smith');
    assert.strictEqual(updated.signatureMethod, 'drawn');
    assert.ok(updated.signatureImage, 'signatureImage path must be populated in DB');
    assert.ok(updated.signatureImage.includes('/media/project_agreements/signatures/'));

    // Verify signature image exists on disk
    const relativeSignaturePath = updated.signatureImage.replace(/^\/media\//, '');
    const mediaRoot = path.resolve(__dirname, '../media');
    const fullSignatureDiskPath = path.join(mediaRoot, relativeSignaturePath);
    assert.ok(fs.existsSync(fullSignatureDiskPath), 'Decoded signature image must exist on disk');

    // Verify signed PDF file exists on disk
    assert.ok(updated.signedPdfFile, 'signedPdfFile must be set in DB');
    const relativePdfPath = updated.signedPdfFile.replace(/^\/media\//, '');
    const fullPdfDiskPath = path.join(mediaRoot, relativePdfPath);
    assert.ok(fs.existsSync(fullPdfDiskPath), 'Generated signed PDF must exist on disk');
    const pdfStat = fs.statSync(fullPdfDiskPath);
    assert.ok(pdfStat.size > 500, 'Signed PDF must have content');
  });

  await t.test('2. Signs agreement with multipart/form-data signature image', async () => {
    // Reset agreement to signature_requested
    await models.ProjectAgreement.findByIdAndUpdate(agreementId, {
      status: 'signature_requested',
      signatureImage: null,
      signedPdfFile: null,
    });

    const multipart = buildMultipart(
      {
        signer_name: 'Multipart Signer',
        signature_method: 'uploaded',
        has_read_agreement: 'true',
      },
      [
        {
          name: 'signature_image',
          filename: 'client_signature.png',
          contentType: 'image/png',
          buffer: validPngBuffer,
        },
      ]
    );

    const res = await fetch(`${baseUrl}/api/client-portal/${portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': multipart.contentType,
        'X-Client-Portal-Token': portalToken,
      },
      body: multipart.body,
    });

    assert.strictEqual(res.status, 200, 'Signing with multipart/form-data must return 200');
    const updated = await models.ProjectAgreement.findById(agreementId);
    assert.strictEqual(updated.signerName, 'Multipart Signer');
    assert.strictEqual(updated.signatureMethod, 'uploaded');
    assert.ok(updated.signatureImage, 'signatureImage must be populated from multipart file');
    assert.ok(updated.signatureImage.includes('/media/project_agreements/signatures/'));
  });

  await t.test('3. Signs agreement with typed signature (no image)', async () => {
    // Reset agreement to signature_requested
    await models.ProjectAgreement.findByIdAndUpdate(agreementId, {
      status: 'signature_requested',
      signatureImage: null,
      signedPdfFile: null,
    });

    const res = await fetch(`${baseUrl}/api/client-portal/${portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Portal-Token': portalToken,
      },
      body: JSON.stringify({
        signer_name: 'John Doe',
        signature_method: 'typed',
        has_read_agreement: true,
      }),
    });

    assert.strictEqual(res.status, 200, 'Signing with typed signature must return 200');
    const data = await res.json();
    assert.strictEqual(data.status, 'signed');

    const updated = await models.ProjectAgreement.findById(agreementId);
    assert.strictEqual(updated.signerName, 'John Doe');
    assert.strictEqual(updated.signatureMethod, 'typed');
    assert.ok(!updated.signatureImage, 'Typed signature should have no image path');
    assert.ok(updated.signedPdfFile, 'Signed PDF must be generated for typed signature');
  });

  await t.test('4. Rejects signing request when signer_name is missing', async () => {
    const res = await fetch(`${baseUrl}/api/client-portal/${portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Portal-Token': portalToken,
      },
      body: JSON.stringify({
        signer_name: '',
        signature_method: 'drawn',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.detail.includes('required'));
  });

  await t.test('5. Safely ignores corrupted base64 data without crashing', async () => {
    // Reset agreement status
    await models.ProjectAgreement.findByIdAndUpdate(agreementId, {
      status: 'signature_requested',
      signatureImage: null,
    });

    const res = await fetch(`${baseUrl}/api/client-portal/${portalToken}/agreement/sign/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Portal-Token': portalToken,
      },
      body: JSON.stringify({
        signer_name: 'Corrupted Test',
        signature_method: 'drawn',
        signature_image: 'data:image/png;base64,not_valid_base64_data_garbage!!!',
        has_read_agreement: true,
      }),
    });

    // Should succeed with fallback to text rather than crashing with 500
    assert.strictEqual(res.status, 200);
    const updated = await models.ProjectAgreement.findById(agreementId);
    assert.strictEqual(updated.signerName, 'Corrupted Test');
    assert.ok(!updated.signatureImage, 'Invalid base64 must not save an invalid image path');
  });
});
