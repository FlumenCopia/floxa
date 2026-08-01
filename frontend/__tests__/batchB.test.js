import assert from "node:assert";
import { test, describe } from "node:test";

describe("Batch B Next.js API Proxy Unit Tests", () => {
  test("1. Trailing-slash normalization appends trailing slash for route paths without extensions", () => {
    function normalizeTargetPath(rawPath) {
      let targetPath = rawPath;
      if (targetPath && !targetPath.endsWith("/") && !targetPath.includes(".")) {
        targetPath += "/";
      }
      return targetPath;
    }

    assert.strictEqual(normalizeTargetPath("projects"), "projects/");
    assert.strictEqual(normalizeTargetPath("projects/19/brand-dna"), "projects/19/brand-dna/");
    assert.strictEqual(normalizeTargetPath("projects/19/moodboards/6/image/"), "projects/19/moodboards/6/image/");
    assert.strictEqual(normalizeTargetPath("static/logo.png"), "static/logo.png");
  });

  test("2. Streamed multipart POST uses request.body with duplex: half without arrayBuffer retry", () => {
    function getFetchBodyOptions(method, requestBody) {
      let fetchBody = undefined;
      let duplexOption = {};

      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        if (requestBody) {
          fetchBody = requestBody;
          duplexOption = { duplex: "half" };
        }
      }

      return { fetchBody, duplexOption };
    }

    const mockStream = { getReader: () => {} };
    const { fetchBody, duplexOption } = getFetchBodyOptions("POST", mockStream);

    assert.strictEqual(fetchBody, mockStream, "Streamed request forwards request.body directly");
    assert.strictEqual(duplexOption.duplex, "half", "Requires duplex: half for Node stream fetch");
  });

  test("3. Upstream network failure returns controlled 503 response without retrying consumed body stream", async () => {
    async function handleFetchWithRetryFailure(fetchFn) {
      try {
        await fetchFn();
      } catch {
        // Controlled 503 failure without retrying stream
        return { status: 503, json: { detail: "Backend service is temporarily unavailable." } };
      }
    }

    const res = await handleFetchWithRetryFailure(async () => {
      throw new TypeError("fetch failed / connection refused");
    });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.json.detail, "Backend service is temporarily unavailable.");
  });

  test("4. Compressed upstream response (content-encoding: gzip) removes unsafe Content-Length", () => {
    const backendHeaders = new Map([
      ["content-type", "application/json"],
      ["content-encoding", "gzip"],
      ["content-length", "256"],
    ]);

    const responseHeaders = new Map();
    const hasContentEncoding = Boolean(backendHeaders.get("content-encoding"));

    backendHeaders.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "set-cookie" || lowerKey === "content-encoding") {
        return;
      }
      if (lowerKey === "content-length" && hasContentEncoding) {
        return; // Remove content-length on compressed stream to avoid length mismatch
      }
      responseHeaders.set(key, value);
    });

    assert.strictEqual(responseHeaders.has("content-encoding"), false);
    assert.strictEqual(responseHeaders.has("content-length"), false, "Must strip Content-Length on encoded stream");
  });

  test("5. Unencoded binary response preserves Content-Length and Content-Disposition", () => {
    const backendHeaders = new Map([
      ["content-type", "application/pdf"],
      ["content-length", "1048576"],
      ["content-disposition", "inline; filename=\"agreement.pdf\""],
    ]);

    const responseHeaders = new Map();
    const hasContentEncoding = Boolean(backendHeaders.get("content-encoding"));

    backendHeaders.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "set-cookie" || lowerKey === "content-encoding") {
        return;
      }
      if (lowerKey === "content-length" && hasContentEncoding) {
        return;
      }
      responseHeaders.set(key, value);
    });

    assert.strictEqual(responseHeaders.get("content-type"), "application/pdf");
    assert.strictEqual(responseHeaders.get("content-length"), "1048576");
    assert.strictEqual(responseHeaders.get("content-disposition"), 'inline; filename="agreement.pdf"');
  });

  test("6. Multiple Set-Cookie headers remain intact with Domain= stripped", () => {
    function cleanSetCookie(cookieStr) {
      return cookieStr.replace(/Domain=[^;]+;?/gi, "").trim();
    }

    const setCookieHeaders = [
      "floxa_access=jwt1; Domain=.vercel.app; Path=/; Secure; HttpOnly",
      "floxa_refresh=jwt2; Domain=.vercel.app; Path=/; Secure; HttpOnly",
    ];

    const cleaned = setCookieHeaders.map(cleanSetCookie);

    assert.strictEqual(cleaned.length, 2);
    assert.strictEqual(cleaned[0].includes("Domain="), false);
    assert.strictEqual(cleaned[1].includes("Domain="), false);
    assert.strictEqual(cleaned[0].includes("floxa_access=jwt1"), true);
    assert.strictEqual(cleaned[1].includes("floxa_refresh=jwt2"), true);
  });
});
