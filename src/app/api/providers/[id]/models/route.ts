import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchProviderModels } from "@/lib/ai/provider";

type Params = { params: Promise<{ id: string }> };

// GET /api/providers/[id]/models — fetch model list (non-fatal; returns [] on error)
// Also supports POST with { apiKey } to test with a new key without saving.
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  // Allow apiKey override via query param for live testing
  const { searchParams } = new URL(req.url);
  const overrideKey = searchParams.get("apiKey") ?? undefined;
  const providerToUse = overrideKey ? { ...provider, apiKey: overrideKey } : provider;

  const models = await fetchProviderModels(providerToUse);
  return NextResponse.json({ models });
}

export async function POST(req: NextRequest, { params }: Params) {
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
}
