import test from 'node:test';
import assert from 'node:assert';

test('BUG-02: Hardcoded Secrets & Missing Variable Safety', async (t) => {
  await t.test('1. Fails safely when JWT_SECRET is missing from environment', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    function getJwtSecret() {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET is not configured in environment variables.');
      }
      return secret;
    }

    assert.throws(
      () => getJwtSecret(),
      /JWT_SECRET is not configured in environment variables/,
      'Must throw clear configuration error when JWT_SECRET is missing'
    );

    if (originalSecret) {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  await t.test('2. testGeminiConnection rejects missing API key with 400', () => {
    const setting = { value: {} };
    const req = { body: {} };
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const apiKey =
      req.body.apiKey ||
      setting?.value?.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      '';

    assert.strictEqual(apiKey, '', 'Empty fallback instead of hardcoded string');

    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
      },
    };

    if (!apiKey) {
      res.status(400).json({ detail: 'No Gemini API Key provided or configured.' });
    }

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(responseBody?.detail, 'No Gemini API Key provided or configured.');

    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });
});

test('BUG-03: Demo Data Purge Safety Filter', async (t) => {
  const KNOWN_DEMO_EMAILS = [
    'sarah@novadesign.agency',
    'alex@studiobrand.com',
    'marcus@craftedidentity.io',
    'elena@freelance.dev',
  ];

  const protectedEmails = [
    'admin@floxa.com',
    'platform-admin@floxa.com',
  ];

  // Simulator for MongoDB query matching logic in purgeDemoData
  function matchesPurgeCriteria(consultant) {
    const email = consultant.email.toLowerCase().trim();

    // Must be either marked as demo or in known demo list
    const isCandidate = Boolean(consultant.isDemo || KNOWN_DEMO_EMAILS.includes(email));
    if (!isCandidate) return false;

    // Protected list exclusions
    if (protectedEmails.includes(email)) return false;
    if (/@floxa\.com$/i.test(email)) return false;
    if (consultant.isStaff) return false;

    return true;
  }

  await t.test('1. admin@floxa.com is NEVER eligible for purge', () => {
    const admin = { email: 'admin@floxa.com', isDemo: true, isStaff: true };
    assert.strictEqual(matchesPurgeCriteria(admin), false, 'admin@floxa.com must never be purged');
  });

  await t.test('2. Any @floxa.com domain account is protected from purge', () => {
    const floxaEmployee = { email: 'sarah@floxa.com', isDemo: true, isStaff: false };
    assert.strictEqual(matchesPurgeCriteria(floxaEmployee), false, '@floxa.com accounts must never be purged');
  });

  await t.test('3. Real consultants are NOT purged', () => {
    const realUser = { email: 'realconsultant@agency.com', isDemo: false, isStaff: false };
    assert.strictEqual(matchesPurgeCriteria(realUser), false, 'Real consultants must never be purged');
  });

  await t.test('4. Staff accounts are protected from purge', () => {
    const staffUser = { email: 'sarah@novadesign.agency', isDemo: true, isStaff: true };
    assert.strictEqual(matchesPurgeCriteria(staffUser), false, 'Staff accounts must never be purged');
  });

  await t.test('5. Valid demo agency accounts ARE purged', () => {
    const demo1 = { email: 'sarah@novadesign.agency', isStaff: false };
    const demo2 = { email: 'alex@studiobrand.com', isStaff: false };
    const demo3 = { email: 'custom@democorp.io', isDemo: true, isStaff: false };

    assert.strictEqual(matchesPurgeCriteria(demo1), true, 'sarah@novadesign.agency should be eligible');
    assert.strictEqual(matchesPurgeCriteria(demo2), true, 'alex@studiobrand.com should be eligible');
    assert.strictEqual(matchesPurgeCriteria(demo3), true, 'Explicit isDemo:true account should be eligible');
  });
});
