import assert from "node:assert";
import { test, describe, beforeEach } from "node:test";

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.window = {
  localStorage: new MockStorage(),
  sessionStorage: new MockStorage(),
  location: { search: "" },
};
global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;

let mockFetchHandler = null;
let lastFetchUrl = "";

global.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  if (urlStr.includes("/auth/csrf/")) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ csrfToken: "mock-csrf" }),
    };
  }
  lastFetchUrl = urlStr;
  if (mockFetchHandler) {
    return mockFetchHandler(url, options);
  }
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ id: 1, title: "Test Project" }),
  };
};

const { clientPortalService } = await import("../services/clientPortalService.js");

describe("Client Portal Initial Access & Error Classification Unit Tests", () => {
  beforeEach(() => {
    mockFetchHandler = null;
    lastFetchUrl = "";
    global.window.location.search = "";
  });

  test("1. HTTP 404 classifies as notFound: true", async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Not found." }),
    });

    const result = await clientPortalService.createSession("fake-token-404");
    assert.strictEqual(result.notFound, true);
    assert.strictEqual(result.requirePassword, undefined);
    assert.strictEqual(result.forbidden, undefined);
    assert.strictEqual(result.unauthorized, undefined);
  });

  test("2. HTTP 403 with password detail classifies as requirePassword: true", async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Portal password verification required." }),
    });

    const result = await clientPortalService.createSession("protected-token");
    assert.strictEqual(result.requirePassword, true);
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.forbidden, undefined);
    assert.strictEqual(result.unauthorized, undefined);
  });

  test("3. HTTP 403 without password detail classifies as forbidden: true", async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Permission denied: you are not the assigned consultant for this project." }),
    });

    const result = await clientPortalService.createSession("unassigned-token");
    assert.strictEqual(result.forbidden, true);
    assert.strictEqual(result.requirePassword, undefined);
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.unauthorized, undefined);
  });

  test("4. HTTP 401 classifies as unauthorized: true and does not ask for portal password", async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Authentication credentials were not provided." }),
    });

    const result = await clientPortalService.createSession("token-401");
    assert.strictEqual(result.unauthorized, true);
    assert.strictEqual(result.requirePassword, undefined);
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.forbidden, undefined);
  });

  test("5. HTTP 500 classifies as serverError: true", async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Internal server error" }),
    });

    const result = await clientPortalService.createSession("token-500");
    assert.strictEqual(result.serverError, true);
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.requirePassword, undefined);
  });

  test("6. Network failure classifies as networkError: true", async () => {
    mockFetchHandler = async () => {
      throw new Error("Failed to fetch");
    };

    const result = await clientPortalService.createSession("token-net-err");
    assert.strictEqual(result.networkError, true);
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.requirePassword, undefined);
  });

  test("7. HTTP 200 returns valid project data without error flags", async () => {
    mockFetchHandler = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: 42, title: "FLOXA Portal", company_name: "Acme" }),
    });

    const result = await clientPortalService.createSession("token-200");
    assert.strictEqual(result.notFound, undefined);
    assert.strictEqual(result.requirePassword, undefined);
    assert.strictEqual(result.forbidden, undefined);
    assert.strictEqual(result.unauthorized, undefined);
    assert.strictEqual(result.serverError, undefined);
    assert.strictEqual(result.networkError, undefined);
    assert.ok(result.project);
    assert.strictEqual(result.project.name, "Acme");
  });

  test("8. Search parameters are preserved during resolution", async () => {
    global.window.location.search = "?mode=consultant&consultant=true";
    mockFetchHandler = async (url) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: 10, mode: "consultant" }),
    });

    await clientPortalService.createSession("token-search-params");
    assert.ok(lastFetchUrl.includes("mode=consultant"));
    assert.ok(lastFetchUrl.includes("consultant=true"));
  });

  test("9. verifyPortalPassword correctly routes URL token when called as (password, token)", async () => {
    const validUuid = "11111111-2222-3333-4444-555555555555";
    let capturedBody = "";
    mockFetchHandler = async (url, options) => {
      lastFetchUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true }),
      };
    };

    const res = await clientPortalService.verifyPortalPassword("nidhin123", validUuid);
    assert.strictEqual(res.success, true);
    assert.ok(lastFetchUrl.includes(validUuid));
    assert.ok(!lastFetchUrl.includes("nidhin123"));
    assert.strictEqual(capturedBody.password, "nidhin123");
  });

  test("10. verifyPortalPassword defensively handles inverted (token, password) without putting password in URL", async () => {
    const validUuid = "11111111-2222-3333-4444-555555555555";
    let capturedBody = "";
    mockFetchHandler = async (url, options) => {
      lastFetchUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ success: true }),
      };
    };

    const res = await clientPortalService.verifyPortalPassword(validUuid, "nidhin123");
    assert.strictEqual(res.success, true);
    assert.ok(lastFetchUrl.includes(validUuid));
    assert.ok(!lastFetchUrl.includes("nidhin123"));
    assert.strictEqual(capturedBody.password, "nidhin123");
  });
});
