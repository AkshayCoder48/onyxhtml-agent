import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAgentAsReadableStream, sseResponse } from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

// POST /api/chats/[id]/messages/continue
//   body { results: { callId, result?, error? }[] }
//   → SSE stream that resumes after browser tools execute client-side
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
  const results = Array.isArray(body?.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json({ error: "No tool results provided" }, { status: 400 });
  }
  // Normalize each result entry
  const normalized = results.map((r: any) => ({
    callId: String(r?.callId ?? ""),
    result: r?.result,
    error: typeof r?.error === "string" ? r.error : undefined,
  })).filter((r: any) => r.callId);

  // Touch chat updatedAt
  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  const stream = await runAgentAsReadableStream({
    chatId,
    workspaceId: chat.workspaceId,
    resumeResults: normalized,
  });
  return sseResponse(stream);
}
