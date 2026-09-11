'use strict';

const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const path = require('path');

test('Watermark Asset Protection Tests', async (t) => {
  const { generateWatermarkedImage } = await import('file:///' + path.resolve(__dirname, '../dist/services/storage.service.js').replace(/\\/g, '/'));
  const { serializeClientPortalMoodboard, serializeClientPortalConcept } = await import('file:///' + path.resolve(__dirname, '../dist/utils/serializer.js').replace(/\\/g, '/'));

  await t.test('generateWatermarkedImage produces a sharp JPEG buffer with watermark elements', async () => {
    // Generate a 400x300 sample PNG buffer
    const sampleBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 10, g: 30, b: 20, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateWatermarkedImage(sampleBuffer, 'test_design.png');
    assert.ok(result, 'Result should be returned');
    assert.ok(result.buffer instanceof Buffer, 'Should return a Buffer');
    assert.ok(result.buffer.length > 0, 'Buffer should not be empty');
    assert.match(result.filename, /_watermarked/, 'Filename should include _watermarked suffix');

    const meta = await sharp(result.buffer).metadata();
    assert.strictEqual(meta.format, 'jpeg', 'Watermarked image should be JPEG');
    assert.strictEqual(meta.width, 400, 'Width should be preserved');
    assert.strictEqual(meta.height, 300, 'Height should be preserved');
  });

  await t.test('Serializer routes client moodboard images to client portal endpoint without exposing internal file paths', () => {
    const mockMoodboard = {
      id: 'mb123',
      projectId: 'proj456',
      title: 'Brand Archetype Direction',
      description: 'Test description',
      image: 'moodboards/123_test.png',
      watermarkImage: 'moodboards/watermarked/123_test_watermarked.jpg',
      isSelected: false,
      isShared: true,
      clientFeedback: '',
      createdAt: new Date(),
    };

    const clientSerialized = serializeClientPortalMoodboard(mockMoodboard, 'token_xyz');
    assert.ok(clientSerialized, 'Client moodboard should be serialized');
    assert.strictEqual(
      clientSerialized.image_url,
      '/api/client-portal/token_xyz/moodboards/mb123/image/',
      'Client should receive portal-routed endpoint only'
    );
    assert.strictEqual(clientSerialized.image, undefined, 'Raw internal image path must not be disclosed');
    assert.strictEqual(clientSerialized.watermarkImage, undefined, 'Internal watermark path must not be disclosed');
  });

  await t.test('Concept serializer routes client concept images to client portal endpoint', () => {
    const mockConcept = {
      id: 'cpt123',
      projectId: 'proj456',
      title: 'Concept Route 1',
      description: 'Test concept',
      image: 'concepts/123_concept.png',
      watermarkImage: 'concepts/watermarked/123_concept_watermarked.jpg',
      file: null,
      version: 1,
      status: 'shared',
      clientFeedback: '',
      createdAt: new Date(),
    };

    const clientSerialized = serializeClientPortalConcept(mockConcept, 'token_xyz');
    assert.strictEqual(
      clientSerialized.image_url,
      '/api/client-portal/token_xyz/concepts/cpt123/image/',
      'Client should receive portal-routed concept endpoint'
    );
  });
});
