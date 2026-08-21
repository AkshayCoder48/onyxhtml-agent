import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { parseJSON } from "@/lib/settings";
import { serializeMessage } from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const chat = await db.chat.findUnique({ where: { id } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const rows = await db.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
    });
    const messages = rows.map(serializeMessage);
    return NextResponse.json({
      chat: {
        id: chat.id,
        workspaceId: chat.workspaceId,
        title: chat.title,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      },
      messages,
    });
  } catch (e) {
    console.error('GET /api/chats/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const chat = await db.chat.findUnique({ where: { id } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const data: { title?: string } = {};
    if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();
    const updated = await db.chat.update({ where: { id }, data });
    return NextResponse.json({
      chat: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        title: updated.title,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error('PATCH /api/chats/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const chat = await db.chat.findUnique({ where: { id } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    await db.chat.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/chats/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

void parseJSON;
