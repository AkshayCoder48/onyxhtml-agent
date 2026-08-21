import { NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { stringifyJSON } from "@/lib/settings";
import {
  runAgentAsReadableStream,
  sseResponse,
} from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id: chatId } = await params;
    const chat = await db.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const rows = await db.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });

    let lastUserIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx < 0) {
      return NextResponse.json(
        { error: "No user message to regenerate from" },
        { status: 400 }
      );
    }

    const toDelete = rows.slice(lastUserIdx + 1);
    if (toDelete.length > 0) {
      try {
        await db.message.deleteMany({
          where: { id: { in: toDelete.map((m) => m.id) } },
        });
      } catch {}
    }

    await db.message.create({
      data: {
        chatId,
        role: "assistant",
        segments: stringifyJSON([]),
      },
    });

    try {
      await db.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });
    } catch {}

    const stream = await runAgentAsReadableStream({
      chatId,
      workspaceId: chat.workspaceId,
      context: { activeFile: null },
    });
    return sseResponse(stream);
  } catch (e) {
    console.error('POST /api/chats/[id]/messages/regenerate error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
