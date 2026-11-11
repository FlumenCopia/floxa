export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000/api"
).replace(/\/+$/, "");

const ADDITIONAL_ALLOWED_ORIGINS = (process.env.ADDITIONAL_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://floxa.flumenx.in",
  ...ADDITIONAL_ALLOWED_ORIGINS,
];

function getValidatedOriginAndReferer(request: NextRequest) {
  const incomingOrigin = request.headers.get("origin");
  const incomingReferer = request.headers.get("referer");

  let validOrigin: string | null = null;
  let validReferer: string | null = null;
  let untrustedOrigin = false;

  if (incomingOrigin) {
    const cleanOrigin = incomingOrigin.trim().replace(/\/+$/, "");
    if (ALLOWED_ORIGINS.includes(cleanOrigin)) {
      validOrigin = cleanOrigin;
    } else {
      untrustedOrigin = true;
    }
  }

  if (incomingReferer) {
    try {
      const parsedReferer = new URL(incomingReferer.trim());
      const refererOrigin = `${parsedReferer.protocol}//${parsedReferer.host}`.replace(/\/+$/, "");
      if (ALLOWED_ORIGINS.includes(refererOrigin)) {
        validReferer = incomingReferer.trim();
        if (!validOrigin) {
          validOrigin = refererOrigin;
        }
      } else {
        untrustedOrigin = true;
      }
    } catch {
      untrustedOrigin = true;
    }
  }

  if (!validOrigin && !untrustedOrigin) {
    const hostHeader = (request.headers.get("host") || "").trim();
    const protoHeader = (request.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
    const requestOrigin = hostHeader ? `${protoHeader}://${hostHeader}`.replace(/\/+$/, "") : "";

    if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
      validOrigin = requestOrigin;
    }
  }

  if (!validReferer && validOrigin) {
    validReferer = `${validOrigin}/`;
  }

  return { validOrigin, validReferer, untrustedOrigin };
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    const pathSegments = path || [];
    const rawPath = pathSegments.join("/");

    // Ensure Django trailing slash compatibility if no extension/file is targeted
    let targetPath = rawPath;
    if (targetPath && !targetPath.endsWith("/") && !targetPath.includes(".")) {
      targetPath += "/";
    }

    const search = request.nextUrl.search || "";
    const targetUrl = `${BACKEND_BASE_URL}/${targetPath}${search}`;

    const { validOrigin, validReferer, untrustedOrigin } = getValidatedOriginAndReferer(request);

    if (untrustedOrigin) {
      return NextResponse.json(
        { detail: "CSRF or origin verification failed: Untrusted Origin." },
        { status: 403 }
      );
    }

    const forwardHeaders = new Headers();

    const headersToForward = [
      "cookie",
      "content-type",
      "x-csrftoken",
      "x-csrf-token",
      "authorization",
      "accept",
      "user-agent",
      "x-client-portal-token",
      "x-portal-access-token",
      "x-support-mode",
      "x-consultant-support",
    ];

    for (const headerName of headersToForward) {
      const value = request.headers.get(headerName);
      if (value) {
        forwardHeaders.set(headerName, value);
      }
    }

    if (validOrigin) {
      forwardHeaders.set("origin", validOrigin);
    }
    if (validReferer) {
      forwardHeaders.set("referer", validReferer);
    }

    const csrfToken = request.headers.get("x-csrftoken") || request.headers.get("x-csrf-token");
    if (csrfToken) {
      forwardHeaders.set("X-CSRFToken", csrfToken);
      forwardHeaders.set("x-csrftoken", csrfToken);
    }

    const method = request.method;
    let fetchBody: BodyInit | undefined = undefined;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      try {
        const arrayBuffer = await request.arrayBuffer();
        if (arrayBuffer && arrayBuffer.byteLength > 0) {
          fetchBody = Buffer.from(arrayBuffer);
          forwardHeaders.set("content-length", String(arrayBuffer.byteLength));
        }
      } catch {
        fetchBody = undefined;
      }
    }

    let backendRes: Response;
    try {
      backendRes = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: fetchBody,
        redirect: "manual",
      });
    } catch (fetchErr: unknown) {
      console.error("[Proxy Backend Connection Error]:", fetchErr);
      return NextResponse.json(
        { detail: "Backend service is temporarily unavailable." },
        { status: 503 }
      );
    }

    const responseHeaders = new Headers();
    const hasContentEncoding = Boolean(backendRes.headers.get("content-encoding"));

    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "set-cookie" || lowerKey === "content-encoding") {
        return;
      }
      if (lowerKey === "content-length" && hasContentEncoding) {
        return;
      }
      responseHeaders.set(key, value);
    });

    const response = new NextResponse(backendRes.body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders,
    });

    const setCookieHeaders =
      typeof backendRes.headers.getSetCookie === "function"
        ? backendRes.headers.getSetCookie()
        : backendRes.headers.get("set-cookie")
        ? [backendRes.headers.get("set-cookie")!]
        : [];

    for (const cookieStr of setCookieHeaders) {
      if (!cookieStr) continue;
      const cleanedCookie = cookieStr.replace(/Domain=[^;]+;?/gi, "").trim();
      response.headers.append("Set-Cookie", cleanedCookie);
    }

    return response;
  } catch (error: unknown) {
    console.error("[Next.js API Proxy Error]:", error);
    return NextResponse.json(
      { detail: "Backend API proxy connection failed." },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
