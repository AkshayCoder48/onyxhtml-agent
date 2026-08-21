import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { toProviderDTO } from "@/lib/ai/provider";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/providers/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
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
    if (typeof body?.baseURL === "string" && body.baseURL.trim()) {
      const normalized = body.baseURL.trim().replace(/\/+$/, "");
      const isBuiltIn = normalized === "zai-built-in";
      if (!isBuiltIn) {
        try {
          new URL(normalized);
          data.baseURL = normalized;
        } catch {
          return NextResponse.json({ error: "Invalid baseURL" }, { status: 400 });
        }
      } else {
        data.baseURL = normalized;
      }
    }
    if (typeof body?.model === "string" && body.model.trim()) data.model = body.model.trim();
    if (typeof body?.apiKey === "string") {
      if (body.apiKey.trim().length > 0) {
        data.apiKey = body.apiKey.trim();
      } else if (body.apiKey === "" && body.clearApiKey === true) {
        data.apiKey = null;
      }
    }
    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

    // Handle active switching without transaction (more resilient for SQLite)
    if (data.isActive) {
      try {
        await db.provider.updateMany({ data: { isActive: false } });
      } catch {}
    }

    const updated = await db.provider.update({ where: { id }, data });
    return NextResponse.json({ provider: toProviderDTO(updated) });
  } catch (e) {
    console.error('PATCH /api/providers/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update provider' }, { status: 500 });
  }
}

// DELETE /api/providers/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const existing = await db.provider.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

    await db.provider.delete({ where: { id } });

    if (existing.isActive) {
      try {
        const builtin = await db.provider.findFirst({
          where: { baseURL: "zai-built-in" },
        });
        if (builtin) {
          await db.provider.update({ where: { id: builtin.id }, data: { isActive: true } });
        } else {
          const first = await db.provider.findFirst({ orderBy: { createdAt: "asc" } });
          if (first) {
            await db.provider.update({ where: { id: first.id }, data: { isActive: true } });
          }
        }
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/providers/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to delete provider' }, { status: 500 });
  }
}
