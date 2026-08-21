import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { Chat, MessageSegment } from "@/lib/types";
import { parseJSON } from "@/lib/settings";

export async function GET(req: NextRequest) {
  try {
    await ensureDbInitialized();
    const url = new URL(req.url);
    const q = (url.searchParams.get("search") ?? "").trim();
    if (!q) {
      return NextResponse.json({ chats: [] });
    }

    const chats = await db.chat.findMany({
      include: {
        workspace: { select: { name: true } },
        messages: { select: { role: true, segments: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const ql = q.toLowerCase();
    const results: Chat[] = [];
    for (const c of chats) {
      let snippet: string | undefined;
      let matched = c.title.toLowerCase().includes(ql);
      if (!matched) {
        for (const m of c.messages) {
          const segs = parseJSON<MessageSegment[]>(m.segments, []);
          for (const s of segs) {
            if (s.type === "content") {
              const text = (s as { content: string }).content;
              const idx = text.toLowerCase().indexOf(ql);
              if (idx >= 0) {
                matched = true;
                const start = Math.max(0, idx - 30);
                snippet =
                  (start > 0 ? "…" : "") + text.slice(start, start + 160).trim() + (start + 160 < text.length ? "…" : "");
                break;
              }
            }
          }
          if (matched) break;
        }
      }
      if (matched) {
        results.push({
          id: c.id,
          workspaceId: c.workspaceId,
          title: c.title,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          lastMessage: snippet,
        });
        if (results.length >= 50) break;
      }
    }
    return NextResponse.json({ chats: results });
  } catch (e) {
    console.error('GET /api/chats error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed', chats: [] }, { status: 500 });
  }
}
