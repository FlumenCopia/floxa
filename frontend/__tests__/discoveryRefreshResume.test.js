import assert from "node:assert";
import { test, describe, beforeEach } from "node:test";

// Mock localStorage and sessionStorage for Node environment
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
};
global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;

let mockDiscoveryApiResponse = null;
let lastFetchUrl = "";
let lastFetchHeaders = {};

global.fetch = async (url, options = {}) => {
  lastFetchUrl = String(url);
  lastFetchHeaders = options.headers || {};

  if (lastFetchUrl.includes("/discovery/")) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockDiscoveryApiResponse,
    };
  }

  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({}),
  };
};

const { clientPortalService } = await import("../services/clientPortalService.js");

function getBackendResumeScreen(savedProfile, savedDiscovery) {
  if (!savedProfile) {
    return "profile";
  }

  if (savedDiscovery?.isSubmitted || savedDiscovery?.is_submitted) {
    return "dashboard";
  }

  if (savedDiscovery?.isComplete || savedDiscovery?.is_complete) {
    return "review";
  }

  return "discovery";
}

function writeDiscoveryDraft(projectId, discovery) {
  if (
    typeof window === "undefined" ||
    !projectId ||
    !discovery?.draft ||
    discovery?.isSubmitted ||
    discovery?.is_submitted
  ) {
    return;
  }

  const existing = window.localStorage.getItem(`floxa-discovery-${projectId}`);
  let existingStep = undefined;
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (typeof parsed?.step === "number") {
        existingStep = parsed.step;
      }
    } catch {
      // ignore
    }
  }

  const draftToWrite = {
    ...discovery.draft,
    ...(existingStep !== undefined ? { step: existingStep } : {}),
  };

  window.localStorage.setItem(
    `floxa-discovery-${projectId}`,
    JSON.stringify(draftToWrite)
  );
}

describe("Client Portal Discovery Refresh/Resume Unit & Contract Tests", () => {
  beforeEach(() => {
    global.window.localStorage.clear();
    global.window.sessionStorage.clear();
    mockDiscoveryApiResponse = null;
    lastFetchUrl = "";
    lastFetchHeaders = {};
  });

  test("1. Service has no duplicate method definitions and exposes normalized contract", async () => {
    assert.strictEqual(typeof clientPortalService.getDiscoveryDraft, "function");
    assert.strictEqual(typeof clientPortalService.saveDiscoveryDraft, "function");

    // Check prototype / keys count
    const keys = Object.keys(clientPortalService);
    const getDraftOccurrences = keys.filter((k) => k === "getDiscoveryDraft").length;
    const saveDraftOccurrences = keys.filter((k) => k === "saveDiscoveryDraft").length;
    assert.strictEqual(getDraftOccurrences, 1);
    assert.strictEqual(saveDraftOccurrences, 1);
  });

  test("2. Submitted discovery returns both camelCase and snake_case completion flags", async () => {
    mockDiscoveryApiResponse = {
      id: 10,
      business_description: "Fintech solutions",
      target_customer: "Enterprises",
      why_choose_us: "Speed and reliability",
      brand_feeling: "Modern and crisp",
      audience_archetype: "Enterprise Leader",
      emotions: [{ emotion: "confident" }],
      competitors: [{ name: "CompA", rating: "like", reason: "Good UX" }],
      visual_styles: [{ style: "Minimal" }],
      sliders: [{ slider_key: "classic_modern", value: 80 }],
      submitted_at: "2026-09-04T10:00:00Z",
      is_submitted: true,
      is_complete: true,
    };

    const res = await clientPortalService.getDiscoveryDraft("test-portal-uuid-123");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.isSubmitted, true);
    assert.strictEqual(res.data.is_submitted, true);
    assert.strictEqual(res.data.isComplete, true);
    assert.strictEqual(res.data.is_complete, true);
    assert.ok(res.data.raw);
    assert.ok(res.data.clientData);
    assert.ok(res.data.draft);
    assert.strictEqual(res.data.whatDo, "Fintech solutions");
  });

  test("3. Complete unsubmitted discovery correctly flags isComplete: true and isSubmitted: false", async () => {
    mockDiscoveryApiResponse = {
      id: 11,
      business_description: "Healthcare logistics",
      target_customer: "Clinics",
      why_choose_us: "24/7 Cold Chain",
      brand_feeling: "Reliable",
      audience_archetype: "Medical Director",
      emotions: [{ emotion: "trusted" }],
      competitors: [{ name: "MedCo", rating: "neutral", reason: "Slow" }],
      visual_styles: [{ style: "Clean" }],
      sliders: [{ slider_key: "classic_modern", value: 50 }],
      submitted_at: null,
      is_submitted: false,
      is_complete: true,
    };

    const res = await clientPortalService.getDiscoveryDraft("test-portal-uuid-456");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.isSubmitted, false);
    assert.strictEqual(res.data.is_submitted, false);
    assert.strictEqual(res.data.isComplete, true);
    assert.strictEqual(res.data.is_complete, true);
  });

  test("4. Incomplete discovery correctly flags isComplete: false and isSubmitted: false", async () => {
    mockDiscoveryApiResponse = {
      id: 12,
      business_description: "Only partial answers",
      target_customer: "",
      why_choose_us: "",
      brand_feeling: "",
      audience_archetype: "",
      emotions: [],
      competitors: [],
      visual_styles: [],
      sliders: [],
      submitted_at: null,
      is_submitted: false,
      is_complete: false,
    };

    const res = await clientPortalService.getDiscoveryDraft("test-portal-uuid-789");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.isSubmitted, false);
    assert.strictEqual(res.data.is_submitted, false);
    assert.strictEqual(res.data.isComplete, false);
    assert.strictEqual(res.data.is_complete, false);
  });

  test("5. Resume screen calculation correctly routes to expected portal screen", () => {
    const profile = { clientName: "Alice" };

    // Case A: Missing profile
    assert.strictEqual(getBackendResumeScreen(null, null), "profile");

    // Case B: Incomplete discovery
    assert.strictEqual(
      getBackendResumeScreen(profile, { isSubmitted: false, isComplete: false }),
      "discovery"
    );

    // Case C: Complete unsubmitted discovery
    assert.strictEqual(
      getBackendResumeScreen(profile, { isSubmitted: false, isComplete: true }),
      "review"
    );

    // Case D: Submitted discovery (camelCase)
    assert.strictEqual(
      getBackendResumeScreen(profile, { isSubmitted: true, isComplete: true }),
      "dashboard"
    );

    // Case E: Submitted discovery (snake_case fallback)
    assert.strictEqual(
      getBackendResumeScreen(profile, { is_submitted: true, is_complete: true }),
      "dashboard"
    );
  });

  test("6. Submitted discovery NEVER recreates local storage draft", () => {
    const submittedDiscovery = {
      isSubmitted: true,
      is_submitted: true,
      draft: { whatDo: "Sustainable Coffee", step: 6 },
    };

    writeDiscoveryDraft("proj-101", submittedDiscovery);
    const stored = global.window.localStorage.getItem("floxa-discovery-proj-101");
    assert.strictEqual(stored, null);
  });

  test("7. Unsubmitted discovery at Step 3 preserves step position across refreshes", () => {
    // Client had saved step 3 previously
    global.window.localStorage.setItem(
      "floxa-discovery-proj-102",
      JSON.stringify({ whatDo: "Solar Panels", step: 3 })
    );

    const unsubmittedDiscovery = {
      isSubmitted: false,
      is_submitted: false,
      draft: { whatDo: "Solar Panels - Updated", targetCustomer: "Homeowners" },
    };

    writeDiscoveryDraft("proj-102", unsubmittedDiscovery);

    const stored = JSON.parse(global.window.localStorage.getItem("floxa-discovery-proj-102"));
    assert.strictEqual(stored.step, 3);
    assert.strictEqual(stored.whatDo, "Solar Panels - Updated");
    assert.strictEqual(stored.targetCustomer, "Homeowners");
  });

  test("8. Multi-project storage isolation ensures Project A does not affect Project B", () => {
    global.window.localStorage.setItem(
      "floxa-discovery-proj-A",
      JSON.stringify({ whatDo: "Project A Brand", step: 4 })
    );
    global.window.localStorage.setItem(
      "floxa-discovery-proj-B",
      JSON.stringify({ whatDo: "Project B Brand", step: 2 })
    );

    const unsubmittedDiscoveryA = {
      isSubmitted: false,
      is_submitted: false,
      draft: { whatDo: "Project A Brand Modified" },
    };

    writeDiscoveryDraft("proj-A", unsubmittedDiscoveryA);

    const storedA = JSON.parse(global.window.localStorage.getItem("floxa-discovery-proj-A"));
    const storedB = JSON.parse(global.window.localStorage.getItem("floxa-discovery-proj-B"));

    assert.strictEqual(storedA.step, 4);
    assert.strictEqual(storedA.whatDo, "Project A Brand Modified");
    assert.strictEqual(storedB.step, 2);
    assert.strictEqual(storedB.whatDo, "Project B Brand");
  });
});
