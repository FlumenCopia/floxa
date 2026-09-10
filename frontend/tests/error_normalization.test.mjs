import test from 'node:test';
import assert from 'node:assert';

test('Frontend Error Normalization: Safe Extraction Without Info Disclosure', async (t) => {
  function normalizeErrorMessage(errorOrResponse, fallback = 'An error occurred. Please try again.') {
    if (!errorOrResponse) return fallback;

    // If it is a string
    if (typeof errorOrResponse === 'string') {
      // Strip any HTML tags
      const stripped = errorOrResponse.replace(/<[^>]*>?/gm, '').trim();
      if (stripped.length > 0 && stripped.length < 250 && !stripped.includes('at ') && !stripped.includes('Error:')) {
        return stripped;
      }
      return fallback;
    }

    // If it has a detail property (Django / Express API standard contract)
    if (typeof errorOrResponse.detail === 'string' && errorOrResponse.detail.trim()) {
      const detail = errorOrResponse.detail.trim();
      if (!detail.includes('stack') && !detail.includes('node_modules') && !detail.includes('C:\\')) {
        return detail;
      }
    }

    // If it has message property
    if (typeof errorOrResponse.message === 'string' && errorOrResponse.message.trim()) {
      const msg = errorOrResponse.message.trim();
      if (!msg.includes('stack') && !msg.includes('node_modules') && !msg.includes('C:\\')) {
        return msg;
      }
    }

    return fallback;
  }

  await t.test('1. Extracts clean API detail string', () => {
    const error = { detail: 'Consultant support mode cannot execute client-only actions.' };
    assert.strictEqual(
      normalizeErrorMessage(error),
      'Consultant support mode cannot execute client-only actions.'
    );
  });

  await t.test('2. Filters out raw stack traces or internal paths to prevent disclosure', () => {
    const leak = {
      detail: 'Error: file not found at C:\\It Projects\\FLOXA-OG\\floxa\\backend\\src\\index.ts:12:4',
    };
    assert.strictEqual(normalizeErrorMessage(leak), 'An error occurred. Please try again.');
  });

  await t.test('3. Strips raw HTML error pages (e.g. 502/504 proxy errors)', () => {
    const html = '<html><body><h1>502 Bad Gateway</h1><p>Nginx trace</p></body></html>';
    const normalized = normalizeErrorMessage(html);
    assert.ok(!normalized.includes('<html'), 'HTML must not be returned directly');
  });

  await t.test('4. Gracefully handles null, undefined, or empty error values', () => {
    assert.strictEqual(normalizeErrorMessage(null), 'An error occurred. Please try again.');
    assert.strictEqual(normalizeErrorMessage(undefined), 'An error occurred. Please try again.');
    assert.strictEqual(normalizeErrorMessage({}), 'An error occurred. Please try again.');
  });
});
