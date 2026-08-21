import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { stringifyJSON } from "@/lib/settings";
import { runAgentAsReadableStream, maybeAutoTitle, sseResponse } from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id: chatId } = await params;
    const chat = await db.chat.findUnique({ where: { id: chatId } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const content = typeof body?.content === "string" ? body.content : "";
    if (!content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }
    const context = body?.context ?? {};

    await db.message.create({
      data: {
        chatId,
        role: "user",
        segments: stringifyJSON([{ type: "content", content }]),
      },
    });

    await db.message.create({
      data: {
        chatId,
        role: "assistant",
        segments: stringifyJSON([]),
      },
    });

    try {
      await maybeAutoTitle(chatId);
    } catch {}

    try {
      await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    } catch {}

    const stream = await runAgentAsReadableStream({
      chatId,
      workspaceId: chat.workspaceId,
      context: {
        activeFile: context.activeFile ?? null,
        selectedFiles: Array.isArray(context.selectedFiles) ? context.selectedFiles : [],
      },
    });
    return sseResponse(stream);
  } catch (e) {
    console.error('POST /api/chats/[id]/messages error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
