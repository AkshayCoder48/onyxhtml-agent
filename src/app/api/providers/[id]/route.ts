import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toProviderDTO } from "@/lib/ai/provider";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/providers/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await db.provider.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    name?: string;
    baseURL?: string;
    model?: string;
    apiKey?: string | null;
    isActive?: boolean;
  } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.baseURL === "string") data.baseURL = body.baseURL.trim();
  if (typeof body?.model === "string" && body.model.trim()) data.model = body.model.trim();
  // Only update apiKey if a non-empty value is provided
  if (typeof body?.apiKey === "string" && body.apiKey.length > 0) {
    data.apiKey = body.apiKey;
  }
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

  await db.$transaction(async (tx) => {
    if (data.isActive) {
      await tx.provider.updateMany({ data: { isActive: false } });
    }
    await tx.provider.update({ where: { id }, data });
  });

  const updated = await db.provider.findUnique({ where: { id } });
  return NextResponse.json({ provider: toProviderDTO(updated!) });
}

// DELETE /api/providers/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await db.provider.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  await db.provider.delete({ where: { id } });

  // If we deleted the active provider, try to activate the built-in
  if (existing.isActive) {
    const builtin = await db.provider.findFirst({
      where: { baseURL: "zai-built-in" },
    });
    if (builtin) {
      await db.provider.update({ where: { id: builtin.id }, data: { isActive: true } });
    }
  }

  return NextResponse.json({ ok: true });
}
