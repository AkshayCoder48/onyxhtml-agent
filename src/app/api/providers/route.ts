import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { Provider as ProviderType } from "@/lib/types";
import {
  seedBuiltInProviderIfNeeded,
  toProviderDTO,
} from "@/lib/ai/provider";

// GET /api/providers — list providers (seeds built-in on first call)
export async function GET() {
  try {
    await ensureDbInitialized();
    await seedBuiltInProviderIfNeeded();
    const rows = await db.provider.findMany({ orderBy: { createdAt: "asc" } });
    const providers: ProviderType[] = rows.map(toProviderDTO);
    return NextResponse.json({ providers });
  } catch (e) {
    console.error('GET /api/providers error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to list providers', providers: [] }, { status: 500 });
  }
}

// POST /api/providers — create a provider
export async function POST(req: NextRequest) {
  try {
    await ensureDbInitialized();
    await seedBuiltInProviderIfNeeded();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Provider";
    const baseURLRaw = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
    const baseURL = baseURLRaw.replace(/\/+$/, "");
    const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "";
    const apiKey = typeof body?.apiKey === "string" && body.apiKey.trim().length > 0 ? body.apiKey.trim() : null;
    const isActive = body?.isActive !== undefined ? Boolean(body?.isActive) : true;

    if (!baseURL) return NextResponse.json({ error: "baseURL is required — e.g. https://api.openai.com/v1" }, { status: 400 });
    if (!model) return NextResponse.json({ error: "model is required — e.g. gpt-4o" }, { status: 400 });

    // Validate URL — allow built-in special value and localhost
    const isBuiltIn = baseURL === "zai-built-in";
    if (!isBuiltIn) {
      try {
        new URL(baseURL);
      } catch {
        return NextResponse.json({ error: "Invalid baseURL — must be a valid URL like https://api.openai.com/v1 or http://localhost:11434/v1" }, { status: 400 });
      }
    }

    // If setting active, deactivate others first
    if (isActive) {
      try {
        await db.provider.updateMany({ data: { isActive: false } });
      } catch {}
    }

    const created = await db.provider.create({
      data: { name, baseURL, apiKey, model, isActive },
    });
    return NextResponse.json({ provider: toProviderDTO(created) });
  } catch (e) {
    console.error('POST /api/providers error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create provider' }, { status: 500 });
  }
}
