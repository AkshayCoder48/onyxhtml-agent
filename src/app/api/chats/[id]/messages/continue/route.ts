import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { runAgentAsReadableStream, sseResponse } from "@/lib/ai/agent";

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
    const results = Array.isArray(body?.results) ? body.results : [];
    if (results.length === 0) {
      return NextResponse.json({ error: "No tool results provided" }, { status: 400 });
    }
    const normalized = results.map((r: any) => ({
      callId: String(r?.callId ?? ""),
      result: r?.result,
      error: typeof r?.error === "string" ? r.error : undefined,
    })).filter((r: any) => r.callId);

    try {
      await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    } catch {}

    const stream = await runAgentAsReadableStream({
      chatId,
      workspaceId: chat.workspaceId,
      resumeResults: normalized,
    });
    return sseResponse(stream);
  } catch (e) {
    console.error('POST /api/chats/[id]/messages/continue error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
