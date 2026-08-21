import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { testProviderConnection, ZAI_BUILT_IN_MODEL } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  try {
    await ensureDbInitialized();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON", ok: false }, { status: 400 });
    }

    const baseURL = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : null;
    const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined;

    if (!baseURL) {
      return NextResponse.json({ error: "baseURL is required", ok: false }, { status: 400 });
    }

    const tempProvider: any = {
      id: "temp",
      name: "temp",
      baseURL: baseURL.replace(/\/+$/, ""),
      apiKey,
      model: model ?? ZAI_BUILT_IN_MODEL,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await testProviderConnection(tempProvider);
    return NextResponse.json(result);
  } catch (e) {
    console.error('POST /api/providers/test-connection error:', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Test failed' });
  }
}
