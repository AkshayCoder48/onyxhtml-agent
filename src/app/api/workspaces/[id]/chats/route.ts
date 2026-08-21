import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { Chat, MessageSegment } from "@/lib/types";
import { parseJSON } from "@/lib/settings";

type Params = { params: Promise<{ id: string }> };

function toChatDTO(row: {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
  lastSeg?: string | null;
}): Chat {
  let lastMessage: string | undefined;
  if (typeof row.lastSeg === "string") {
    try {
      const segs = parseJSON<MessageSegment[]>(row.lastSeg, []);
      const text = segs
        .filter((s) => s.type === "content")
        .map((s) => (s as { content: string }).content)
        .join(" ")
        .trim();
      lastMessage = text.slice(0, 160) || undefined;
    } catch {}
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: row._count?.messages,
    lastMessage,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const chats = await db.chat.findMany({
      where: { workspaceId: id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { segments: true },
        },
      },
    });
    const out = chats.map((c) => {
      const lastSeg = c.messages[0]?.segments ?? null;
      return toChatDTO({
        id: c.id,
        workspaceId: c.workspaceId,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { messages: c._count.messages },
        lastSeg,
      });
    });
    return NextResponse.json({ chats: out });
  } catch (e) {
    console.error('GET /api/workspaces/[id]/chats error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed', chats: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "New Chat";

    const chat = await db.chat.create({
      data: { workspaceId: id, title },
    });
    return NextResponse.json({
      chat: {
        id: chat.id,
        workspaceId: chat.workspaceId,
        title: chat.title,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error('POST /api/workspaces/[id]/chats error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
