import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Provider as ProviderType } from "@/lib/types";
import {
  seedBuiltInProviderIfNeeded,
  toProviderDTO,
} from "@/lib/ai/provider";

// GET /api/providers — list providers (seeds built-in on first call)
export async function GET() {
  await seedBuiltInProviderIfNeeded();
  const rows = await db.provider.findMany({ orderBy: { createdAt: "asc" } });
  const providers: ProviderType[] = rows.map(toProviderDTO);
  return NextResponse.json({ providers });
}

// POST /api/providers — create a provider
export async function POST(req: NextRequest) {
  await seedBuiltInProviderIfNeeded();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Provider";
  const baseURL = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "";
  const apiKey = typeof body?.apiKey === "string" && body.apiKey.length > 0 ? body.apiKey : null;
  const isActive = Boolean(body?.isActive);

  if (!baseURL) return NextResponse.json({ error: "baseURL is required" }, { status: 400 });
  if (!model) return NextResponse.json({ error: "model is required" }, { status: 400 });

  await db.$transaction(async (tx) => {
    if (isActive) {
      await tx.provider.updateMany({ data: { isActive: false } });
    }
  });

  const created = await db.provider.create({
    data: { name, baseURL, apiKey, model, isActive },
  });
  return NextResponse.json({ provider: toProviderDTO(created) });
}
