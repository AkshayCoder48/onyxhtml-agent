import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { fetchProviderModels } from "@/lib/ai/provider";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const provider = await db.provider.findUnique({ where: { id } });
    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const overrideKey = searchParams.get("apiKey") ?? undefined;
    const providerToUse = overrideKey ? { ...provider, apiKey: overrideKey } : provider;

    const models = await fetchProviderModels(providerToUse);
    return NextResponse.json({ models });
  } catch (e) {
    console.error('GET /api/providers/[id]/models error:', e);
    return NextResponse.json({ models: [], error: e instanceof Error ? e.message : 'Failed' });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const provider = await db.provider.findUnique({ where: { id } });
    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    let overrideKey: string | undefined;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.apiKey === "string" && body.apiKey.trim()) {
        overrideKey = body.apiKey.trim();
      }
    } catch {}

    const providerToUse = overrideKey ? { ...provider, apiKey: overrideKey } : provider;
    const models = await fetchProviderModels(providerToUse);
    return NextResponse.json({ models });
  } catch (e) {
    console.error('POST /api/providers/[id]/models error:', e);
    return NextResponse.json({ models: [], error: e instanceof Error ? e.message : 'Failed' });
  }
}
