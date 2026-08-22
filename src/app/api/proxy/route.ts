import { NextRequest, NextResponse } from "next/server";

// Server-side reverse proxy used ONLY to reach external LLM providers
// (OpenAI-compatible /chat/completions, /models). Custom providers often
// don't send CORS headers, so browser fetch would be blocked. We forward the
// request server-side and stream the response straight back.
//
// This route deliberately does NOT touch any database — all data now lives
// in the browser's localStorage.

export async function POST(req: NextRequest) {
  let target: string;
  let body: unknown;
  let headers: Record<string, string> = {};
  try {
    const json = (await req.json()) as {
      url?: string;
      body?: unknown;
      headers?: Record<string, string>;
    };
    target = (json.url ?? "").trim();
    body = json.body;
    headers = json.headers ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) targets allowed" }, {
      status: 400,
    });
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // @ts-expect-error - Next.js extended fetch supports this
      duplex: "half",
    });

    const respHeaders = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) respHeaders.set("content-type", ct);
    respHeaders.set("cache-control", "no-cache, no-transform");

    return new NextResponse(upstream.body as unknown as BodyInit, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Proxy request failed" },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) targets allowed" }, {
      status: 400,
    });
  }

  const authHeader = req.headers.get("authorization");
  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: authHeader ? { Authorization: authHeader } : undefined,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Proxy request failed" },
      { status: 502 }
    );
  }
}
