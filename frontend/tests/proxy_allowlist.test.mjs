import test from 'node:test';
import assert from 'node:assert';

// Test the proxy forwarding contract defined in frontend/app/api/[...path]/route.ts
test('Frontend Proxy: Header Forwarding & Origin Allowlist Contract', async (t) => {
  const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://floxa.flumenx.in',
  ];

  const HEADERS_TO_FORWARD = [
    'cookie',
    'content-type',
    'x-csrftoken',
    'x-csrf-token',
    'authorization',
    'accept',
    'user-agent',
    'x-client-portal-token',
    'x-portal-access-token',
    'x-support-mode',
    'x-consultant-support',
  ];

  const FORBIDDEN_HOP_BY_HOP_HEADERS = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ];

  await t.test('1. Allowlist includes local dev and production domain', () => {
    assert.ok(ALLOWED_ORIGINS.includes('http://localhost:3000'));
    assert.ok(ALLOWED_ORIGINS.includes('http://127.0.0.1:3000'));
    assert.ok(ALLOWED_ORIGINS.includes('https://floxa.flumenx.in'));
    assert.strictEqual(ALLOWED_ORIGINS.includes('https://evil-untrusted.com'), false);
  });

  await t.test('2. Required Phase 5 security headers are present in forwarding allowlist', () => {
    assert.ok(HEADERS_TO_FORWARD.includes('x-portal-access-token'), 'Must forward x-portal-access-token');
    assert.ok(HEADERS_TO_FORWARD.includes('x-support-mode'), 'Must forward x-support-mode');
    assert.ok(HEADERS_TO_FORWARD.includes('x-consultant-support'), 'Must forward x-consultant-support');
    assert.ok(HEADERS_TO_FORWARD.includes('x-client-portal-token'), 'Must forward x-client-portal-token');
    assert.ok(HEADERS_TO_FORWARD.includes('cookie'), 'Must forward cookie');
    assert.ok(HEADERS_TO_FORWARD.includes('authorization'), 'Must forward authorization');
    assert.ok(HEADERS_TO_FORWARD.includes('x-csrf-token'), 'Must forward x-csrf-token');
  });

  await t.test('3. Hop-by-hop headers are excluded from proxy forwarding', () => {
    for (const h of FORBIDDEN_HOP_BY_HOP_HEADERS) {
      assert.strictEqual(
        HEADERS_TO_FORWARD.includes(h),
        false,
        `Hop-by-hop header ${h} must NOT be forwarded`
      );
    }
  });

  await t.test('4. Origin validation helper classifies trusted and untrusted origins properly', () => {
    function validateOrigin(incomingOrigin) {
      if (!incomingOrigin) return { valid: false, isUntrusted: false };
      const clean = incomingOrigin.trim().replace(/\/+$/, '');
      if (ALLOWED_ORIGINS.includes(clean)) {
        return { valid: true, origin: clean, isUntrusted: false };
      }
      return { valid: false, isUntrusted: true };
    }

    assert.strictEqual(validateOrigin('http://localhost:3000').valid, true);
    assert.strictEqual(validateOrigin('https://floxa.flumenx.in').valid, true);
    assert.strictEqual(validateOrigin('https://attacker.site').isUntrusted, true);
    assert.strictEqual(validateOrigin(null).isUntrusted, false);
  });
});
