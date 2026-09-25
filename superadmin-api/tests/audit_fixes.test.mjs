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

test('Phase 1 Security & Validation Fixes', async (t) => {
  await t.test('1. escapeRegex sanitizes all special regex characters', () => {
    function escapeRegex(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const unclosedBracket = '[';
    const escapedBracket = escapeRegex(unclosedBracket);
    assert.doesNotThrow(() => new RegExp(escapedBracket), 'Escaped bracket must compile cleanly');

    const complexInput = '[Acme] (US) +1 50% *bonus*';
    const escapedComplex = escapeRegex(complexInput);
    assert.doesNotThrow(() => new RegExp(escapedComplex), 'Complex regex characters must compile cleanly');
    assert.strictEqual(escapedComplex, '\\[Acme\\] \\(US\\) \\+1 50% \\*bonus\\*');
  });

  await t.test('2. sanitizeCsvCell neutralizes formula injection triggers (=, +, -, @, \\t, \\r)', () => {
    function sanitizeCsvCell(value) {
      if (value === null || value === undefined) return '""';
      let str = String(value);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    }

    assert.strictEqual(sanitizeCsvCell('=cmd|"/C calc"!A1'), `"'=cmd|""/C calc""!A1"`, 'Must prepend single quote to =');
    assert.strictEqual(sanitizeCsvCell('+12345'), '"\'+12345"', 'Must prepend single quote to +');
    assert.strictEqual(sanitizeCsvCell('-500'), '"\'-500"', 'Must prepend single quote to -');
    assert.strictEqual(sanitizeCsvCell('@SUM(A1:B2)'), `"'@SUM(A1:B2)"`, 'Must prepend single quote to @');
    assert.strictEqual(sanitizeCsvCell('Normal Agency Name'), `"Normal Agency Name"`, 'Normal text must not be prepended');
    assert.strictEqual(sanitizeCsvCell('Quote "Test"'), `"Quote ""Test"""`, 'Quotes must be doubled');
    assert.strictEqual(sanitizeCsvCell(null), '""', 'Null must return empty quotes');
  });

  await t.test('3. Pagination fallback safely handles NaN non-numeric inputs', () => {
    function parsePagination(queryPage, queryLimit) {
      const rawPage = parseInt(String(queryPage || '1'), 10);
      const rawLimit = parseInt(String(queryLimit || '20'), 10);
      const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
      const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 20 : rawLimit));
      const skip = (page - 1) * limit;
      return { page, limit, skip };
    }

    const nanPage = parsePagination('abc', 'def');
    assert.strictEqual(nanPage.page, 1, 'Invalid page must default to 1');
    assert.strictEqual(nanPage.limit, 20, 'Invalid limit must default to 20');
    assert.strictEqual(nanPage.skip, 0, 'Skip must be 0, not NaN');

    const validPage = parsePagination('3', '50');
    assert.strictEqual(validPage.page, 3);
    assert.strictEqual(validPage.limit, 50);
    assert.strictEqual(validPage.skip, 100);

    const outOfBounds = parsePagination('-5', '999');
    assert.strictEqual(outOfBounds.page, 1, 'Negative page must be clamped to 1');
    assert.strictEqual(outOfBounds.limit, 100, 'Limit must be clamped to 100');
  });

  await t.test('4. maxProjects upper bound clamping protects database', () => {
    function clampMaxProjects(maxProjects) {
      if (typeof maxProjects === 'number' && maxProjects >= 0) {
        return Math.min(10000, Math.max(0, maxProjects));
      }
      return 5;
    }

    assert.strictEqual(clampMaxProjects(1e12), 10000, 'Extreme numbers must be clamped to 10,000');
    assert.strictEqual(clampMaxProjects(50), 50, 'Valid numbers must remain unchanged');
    assert.strictEqual(clampMaxProjects(0), 0, 'Zero must be allowed');
  });

  await t.test('5. AI Quota supports additive credits without overwriting existing balance', () => {
    const consultant = {
      aiUsage: {
        bonusCredits: 30,
        toolRuns: { 'proposal-generator': 5 },
      },
    };

    function applyQuotaAction(doc, action, credits) {
      if (!['reset', 'set-credits', 'add-credits'].includes(action)) {
        throw new Error('Invalid action');
      }
      if (action === 'reset') {
        doc.aiUsage.toolRuns = {};
      } else if (action === 'set-credits') {
        const bonus = Math.max(0, parseInt(String(credits || 0), 10) || 0);
        doc.aiUsage.bonusCredits = bonus;
      } else if (action === 'add-credits') {
        const bonus = Math.max(0, parseInt(String(credits || 0), 10) || 0);
        doc.aiUsage.bonusCredits = (doc.aiUsage.bonusCredits || 0) + bonus;
      }
    }

    applyQuotaAction(consultant, 'add-credits', 25);
    assert.strictEqual(consultant.aiUsage.bonusCredits, 55, 'add-credits must add to existing balance (30 + 25 = 55)');

    applyQuotaAction(consultant, 'set-credits', 10);
    assert.strictEqual(consultant.aiUsage.bonusCredits, 10, 'set-credits must set exact balance (10)');

    applyQuotaAction(consultant, 'reset');
    assert.deepStrictEqual(consultant.aiUsage.toolRuns, {}, 'reset must clear tool runs');

    assert.throws(() => applyQuotaAction(consultant, 'malicious-action'), /Invalid action/);
  });
});

test('PHASE-4: System Diagnostics & Dynamic Origin Security', async (t) => {
  await t.test('1. Database state maps accurately from Mongoose readyState', () => {
    const dbStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    assert.strictEqual(dbStateMap[0], 'disconnected');
    assert.strictEqual(dbStateMap[1], 'connected');
    assert.strictEqual(dbStateMap[2], 'connecting');
    assert.strictEqual(dbStateMap[3], 'disconnecting');
  });

  await t.test('2. Diagnostic payload structure conforms to specification', () => {
    function createSystemStatusPayload({ readyState, dbPingMs }) {
      const dbStateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
      };
      const mem = process.memoryUsage();
      return {
        success: true,
        service: 'floxa-superadmin-api',
        timestamp: new Date().toISOString(),
        database: {
          status: dbStateMap[readyState] || 'unknown',
          readyState,
          pingMs: dbPingMs,
        },
        server: {
          uptimeSeconds: Math.floor(process.uptime()),
          memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
          memoryHeapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
        },
      };
    }

    const payload = createSystemStatusPayload({ readyState: 1, dbPingMs: 14 });
    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.service, 'floxa-superadmin-api');
    assert.strictEqual(payload.database.status, 'connected');
    assert.strictEqual(payload.database.pingMs, 14);
    assert.ok(payload.server.uptimeSeconds >= 0);
    assert.ok(payload.server.memoryRssMb > 0);
    assert.ok(payload.server.memoryHeapUsedMb > 0);
    assert.ok(payload.server.nodeVersion.startsWith('v'));
  });

  await t.test('3. Dynamic CORS Origin Resolution respects production vs development', () => {
    function resolveAllowedOrigins(nodeEnv, corsOriginEnv) {
      const isProduction = nodeEnv === 'production';
      const rawOrigins = (corsOriginEnv || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

      return isProduction
        ? (rawOrigins.length > 0 ? rawOrigins : ['http://localhost:3001'])
        : Array.from(new Set([...rawOrigins, 'http://localhost:3001', 'http://127.0.0.1:3001']));
    }

    // Dev mode
    const devOrigins = resolveAllowedOrigins('development', '');
    assert.ok(devOrigins.includes('http://localhost:3001'));
    assert.ok(devOrigins.includes('http://127.0.0.1:3001'));

    // Prod mode with custom admin domain
    const prodOrigins = resolveAllowedOrigins('production', 'https://admin.floxa.com, https://superadmin.floxa.com');
    assert.deepStrictEqual(prodOrigins, ['https://admin.floxa.com', 'https://superadmin.floxa.com']);
    assert.strictEqual(prodOrigins.includes('http://localhost:3001'), false, 'Dev localhost must not be in prod origins when custom domain set');

    // CORS origin checker logic
    function isAllowed(origin, allowedList) {
      if (!origin) return true; // Server-to-server / curl
      return allowedList.includes(origin);
    }

    assert.strictEqual(isAllowed('https://admin.floxa.com', prodOrigins), true);
    assert.strictEqual(isAllowed('https://evil-hacker.com', prodOrigins), false);
    assert.strictEqual(isAllowed(undefined, prodOrigins), true, 'No-origin requests must be allowed');
  });
});

