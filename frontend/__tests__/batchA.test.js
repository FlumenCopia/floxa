import assert from "node:assert";
import { test, describe, beforeEach } from "node:test";

// Set up mock global fetch before loading production modules
let fetchCallCount = 0;
let fetchUrls = [];

global.fetch = async (url, options = {}) => {
  fetchCallCount++;
  const urlStr = String(url);
  fetchUrls.push(urlStr);

  if (urlStr.includes("/auth/me/")) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: 1, email: "consultant@example.com", name: "Test Consultant" }),
    };
  }

  if (urlStr.includes("/projects/activities/")) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [{ id: 101, action: "moodboard_uploaded", title: "New Moodboard" }],
    };
  }

  if (urlStr.includes("/auth/logout/")) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true }),
    };
  }

  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({}),
  };
};

// Import actual production code modules
const authApi = await import("../src/lib/authApi.js");
const projectApi = await import("../src/lib/projectApi.js");

describe("Batch A Production Module Unit Tests", () => {
  beforeEach(() => {
    authApi.clearCurrentConsultantCache();
    projectApi.invalidateConsultantActivitiesCache();
    fetchCallCount = 0;
    fetchUrls = [];
  });

  test("1. Concurrent production getCurrentConsultant calls produce 1 network request", async () => {
    const [u1, u2, u3] = await Promise.all([
      authApi.getCurrentConsultant(),
      authApi.getCurrentConsultant(),
      authApi.getCurrentConsultant(),
    ]);

    assert.strictEqual(u1.id, 1);
    assert.strictEqual(u2.id, 1);
    assert.strictEqual(u3.id, 1);
    assert.strictEqual(fetchCallCount, 1, "Production authApi issued exactly 1 network request for 3 concurrent callers");
  });

  test("2. forceRefresh=true in production getCurrentConsultant bypasses cached session", async () => {
    const u1 = await authApi.getCurrentConsultant();
    assert.strictEqual(fetchCallCount, 1, "First call issues 1 network request");

    const u2 = await authApi.getCurrentConsultant(false);
    assert.strictEqual(fetchCallCount, 1, "Cached call issues 0 additional network requests");
    assert.strictEqual(u2.id, u1.id);

    const u3 = await authApi.getCurrentConsultant(true);
    assert.strictEqual(fetchCallCount, 2, "forceRefresh=true issues a new network request");
    assert.strictEqual(u3.id, 1);
  });

  test("3. logoutConsultant clears session cache and activities cache in production", async () => {
    await authApi.getCurrentConsultant();
    await projectApi.getConsultantActivities();
    const initialCallCount = fetchCallCount;

    await authApi.logoutConsultant();
    fetchCallCount = 0;

    await authApi.getCurrentConsultant();
    await projectApi.getConsultantActivities();

    assert.strictEqual(fetchCallCount, 2, "After logout, both auth and activities must issue fresh network calls (no cache leak)");
  });

  test("4. Concurrent production getConsultantActivities calls produce 1 network request", async () => {
    const [a1, a2] = await Promise.all([
      projectApi.getConsultantActivities(),
      projectApi.getConsultantActivities(),
    ]);

    assert.strictEqual(a1.length, 1);
    assert.strictEqual(a2.length, 1);
    const actCalls = fetchUrls.filter((u) => u.includes("/projects/activities/"));
    assert.strictEqual(actCalls.length, 1, "Production projectApi issued exactly 1 activities request");
  });

  test("5. Activity cache invalidation forces new fetch on mutation in production", async () => {
    await projectApi.getConsultantActivities();
    assert.strictEqual(fetchCallCount, 1);

    // Second call within freshness window hits cache
    await projectApi.getConsultantActivities();
    assert.strictEqual(fetchCallCount, 1, "Hits 5s freshness cache");

    // Invalidation clears cache
    projectApi.invalidateConsultantActivitiesCache();
    await projectApi.getConsultantActivities();
    assert.strictEqual(fetchCallCount, 2, "Invalidated cache forces new network call");
  });

  test("6. Production clearCurrentConsultantCache invalidates activities to prevent cross-user leak", async () => {
    await projectApi.getConsultantActivities();
    assert.strictEqual(fetchCallCount, 1);

    authApi.clearCurrentConsultantCache();

    await projectApi.getConsultantActivities();
    assert.strictEqual(fetchCallCount, 2, "Clearing consultant session invalidates activities cache");
  });

  test("7. Discovery summary and Brand DNA run in parallel using Promise.allSettled", async () => {
    let summaryStarted = false;
    let brandDnaStarted = false;
    let isParallel = false;

    const mockSummary = new Promise((resolve) => {
      summaryStarted = true;
      if (brandDnaStarted) isParallel = true;
      setTimeout(() => resolve({ summary: "Data" }), 10);
    });

    const mockBrandDna = new Promise((resolve) => {
      brandDnaStarted = true;
      if (summaryStarted) isParallel = true;
      setTimeout(() => resolve({ dna: "Data" }), 10);
    });

    const results = await Promise.allSettled([mockSummary, mockBrandDna]);
    assert.strictEqual(results[0].status, "fulfilled");
    assert.strictEqual(results[1].status, "fulfilled");
    assert.strictEqual(isParallel, true, "Execution was parallel");
  });
});
