import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stringifyJSON } from "@/lib/settings";
import { runAgentAsReadableStream, maybeAutoTitle, sseResponse } from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

// POST /api/chats/[id]/messages
//   body { content: string, context?: { activeFile?: string|null, selectedFiles?: string[] } }
//   → SSE stream
export async function POST(req: NextRequest, { params }: Params) {
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

  // 1. Create user message
  await db.message.create({
    data: {
      chatId,
      role: "user",
      segments: stringifyJSON([{ type: "content", content }]),
    },
  });

  // 2. Create empty assistant message (we'll stream into it)
  await db.message.create({
    data: {
      chatId,
      role: "assistant",
      segments: stringifyJSON([]),
    },
  });

  // 3. Auto-title from first user message if still "New Chat"
  await maybeAutoTitle(chatId);

  // 4. Touch chat updatedAt
  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  // 5. Run the agent and return as SSE
  const stream = await runAgentAsReadableStream({
    chatId,
    workspaceId: chat.workspaceId,
    context: {
      activeFile: context.activeFile ?? null,
      selectedFiles: Array.isArray(context.selectedFiles) ? context.selectedFiles : [],
    },
  });
  return sseResponse(stream);
}
