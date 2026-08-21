import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id: sourceId } = await params;
    const source = await db.chat.findUnique({
      where: { id: sourceId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const newTitle = `${source.title || "New Chat"} (copy)`;

    let created;
    try {
      created = await db.$transaction(async (tx) => {
        const chat = await tx.chat.create({
          data: {
            workspaceId: source.workspaceId,
            title: newTitle,
          },
        });

        if (source.messages.length > 0) {
          await tx.message.createMany({
            data: source.messages.map((m) => ({
              chatId: chat.id,
              role: m.role,
              segments: m.segments,
              createdAt: m.createdAt,
            })),
          });
        }

        return chat;
      });
    } catch {
      // Fallback without transaction
      const chat = await db.chat.create({
        data: { workspaceId: source.workspaceId, title: newTitle },
      });
      if (source.messages.length > 0) {
        for (const m of source.messages) {
          try {
            await db.message.create({
              data: { chatId: chat.id, role: m.role, segments: m.segments, createdAt: m.createdAt },
            });
          } catch {}
        }
      }
      created = chat;
    }

    return NextResponse.json({
      chat: {
        id: created.id,
        workspaceId: created.workspaceId,
        title: created.title,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error('POST /api/chats/[id]/duplicate error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
