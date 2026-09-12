export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const BACKEND_HOST = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000"
)
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");

async function proxyMedia(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    const pathSegments = path || [];
    const mediaPath = pathSegments.join("/");

    const targetUrl = `${BACKEND_HOST}/media/${mediaPath}`;

    const forwardHeaders = new Headers();
    const headersToForward = [
      "range",
      "if-none-match",
      "if-modified-since",
      "accept",
      "user-agent",
      "cookie",
    ];

    for (const h of headersToForward) {
      const val = request.headers.get(h);
      if (val) {
        forwardHeaders.set(h, val);
      }
    }

    const backendRes = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      cache: "no-store",
    });

    if (backendRes.status === 304) {
      return new NextResponse(null, { status: 304 });
    }

    const resHeaders = new Headers();
    const headerCopyList = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
      "content-disposition",
    ];

    for (const h of headerCopyList) {
      const v = backendRes.headers.get(h);
      if (v) {
        resHeaders.set(h, v);
      }
    }

    if (!resHeaders.has("cache-control")) {
      resHeaders.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
    }

    return new NextResponse(backendRes.body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error("[MediaProxy] Error proxying media request:", err);
    return new NextResponse("Media file could not be loaded", { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyMedia(request, context);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyMedia(request, context);
}
