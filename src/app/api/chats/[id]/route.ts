import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJSON } from "@/lib/settings";
import { serializeMessage } from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id] → { chat, messages }
export async function GET(_req: NextRequest, { params }: Params) {
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
}

// PATCH /api/chats/[id] body { title? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const chat = await db.chat.findUnique({ where: { id } });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // noop
  }
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
}

// DELETE /api/chats/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const chat = await db.chat.findUnique({ where: { id } });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  await db.chat.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Avoid unused warning for parseJSON import
void parseJSON;
