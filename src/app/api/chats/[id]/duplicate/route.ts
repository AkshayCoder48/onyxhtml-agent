import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// POST /api/chats/[id]/duplicate
//   Creates a new chat in the same workspace with title `<original> (copy)`,
//   copies ALL messages from the source chat (preserving role + segments JSON
//   + createdAt order). Returns `{ chat: <new chat DTO> }`.
export async function POST(_req: NextRequest, { params }: Params) {
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

  // Create the new chat + its messages in a transaction so a partial failure
  // never leaves an empty duplicate behind.
  const created = await db.$transaction(async (tx) => {
    const chat = await tx.chat.create({
      data: {
        workspaceId: source.workspaceId,
        title: newTitle,
      },
    });

    if (source.messages.length > 0) {
      // Preserve original ordering by carrying the original createdAt through.
      // We do not preserve the original message IDs (the schema generates new
      // cuids) but the segments JSON is copied verbatim — including tool_call
      // callIds which the frontend uses to render the timeline.
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

  return NextResponse.json({
    chat: {
      id: created.id,
      workspaceId: created.workspaceId,
      title: created.title,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  });
}
