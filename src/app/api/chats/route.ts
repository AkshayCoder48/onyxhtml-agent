import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Chat, MessageSegment } from "@/lib/types";
import { parseJSON } from "@/lib/settings";

// GET /api/chats?search=<q> — global chat search
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("search") ?? "").trim();
  if (!q) {
    return NextResponse.json({ chats: [] });
  }
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;

  // Pull all candidate chats (with messages) — SQLite doesn't support JSON queries well,
  // so we filter in JS for content segments only.
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
  void like;
  return NextResponse.json({ chats: results });
}
