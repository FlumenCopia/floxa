import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://floxa-1o19.vercel.app/api"
).replace(/\/+$/, "");

const ALLOWED_ORIGINS = [
  "https://floxa-frontend-test-lyart.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function getValidatedOriginAndReferer(request: NextRequest) {
  const incomingOrigin = request.headers.get("origin");
  const incomingReferer = request.headers.get("referer");

  let validOrigin: string | null = null;
  let validReferer: string | null = null;

  if (incomingOrigin) {
    const cleanOrigin = incomingOrigin.trim().replace(/\/+$/, "");
    if (ALLOWED_ORIGINS.includes(cleanOrigin)) {
      validOrigin = cleanOrigin;
    }
  }

  if (incomingReferer) {
    const cleanReferer = incomingReferer.trim();
    for (const allowed of ALLOWED_ORIGINS) {
      if (cleanReferer.startsWith(allowed)) {
        validReferer = cleanReferer;
        if (!validOrigin) {
          validOrigin = allowed;
        }
        break;
      }
    }
  }

  if (!validOrigin) {
    const hostHeader = request.headers.get("host") || "";
    const protoHeader = request.headers.get("x-forwarded-proto") || "https";
    const requestOrigin = `${protoHeader}://${hostHeader}`.replace(/\/+$/, "");

    if (ALLOWED_ORIGINS.includes(requestOrigin)) {
      validOrigin = requestOrigin;
    } else {
      validOrigin = "https://floxa-frontend-test-lyart.vercel.app";
    }
  }

  if (!validReferer && validOrigin) {
    validReferer = `${validOrigin}/`;
  }

  return { validOrigin, validReferer, untrustedOrigin: Boolean(incomingOrigin && !validOrigin) };
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
    let body: ArrayBuffer | undefined = undefined;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      try {
        body = await request.arrayBuffer();
      } catch {
        body = undefined;
      }
    }

    const backendRes = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body,
      redirect: "manual",
    });

    const responseHeaders = new Headers();

    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "set-cookie" &&
        lowerKey !== "content-encoding" &&
        lowerKey !== "content-length"
      ) {
        responseHeaders.set(key, value);
      }
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
  } catch (error: any) {
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
