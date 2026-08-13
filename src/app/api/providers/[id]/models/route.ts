import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchProviderModels } from "@/lib/ai/provider";

type Params = { params: Promise<{ id: string }> };

// GET /api/providers/[id]/models — fetch model list (non-fatal; returns [] on error)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  const models = await fetchProviderModels(provider);
  return NextResponse.json({ models });
}
