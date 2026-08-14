import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stringifyJSON } from "@/lib/settings";
import {
  runAgentAsReadableStream,
  sseResponse,
} from "@/lib/ai/agent";

type Params = { params: Promise<{ id: string }> };

// POST /api/chats/[id]/messages/regenerate
//   → SSE stream
//
// Finds the last assistant message in the chat, deletes it (and any tool
// messages that followed the last user message), then re-streams a new
// assistant response using the last user message as the prompt.
//
// Mirrors the shape of POST /api/chats/[id]/messages (creates an empty
// assistant message and returns sseResponse(stream)).
export async function POST(_req: Request, { params }: Params) {
  const { id: chatId } = await params;
  const chat = await db.chat.findUnique({ where: { id: chatId } });
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // 1. Load all messages ordered by createdAt ASC so we can find the LAST
  //    user message and everything after it.
  const rows = await db.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });

  // 2. Find the index of the LAST user message.
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

  // 3. Delete every message strictly AFTER the last user message — these
  //    are the old assistant + tool messages we want to regenerate.
  const toDelete = rows.slice(lastUserIdx + 1);
  if (toDelete.length > 0) {
    await db.message.deleteMany({
      where: { id: { in: toDelete.map((m) => m.id) } },
    });
  }

  // 4. Create a new empty assistant message (we'll stream into it).
  await db.message.create({
    data: {
      chatId,
      role: "assistant",
      segments: stringifyJSON([]),
    },
  });

  // 5. Touch chat updatedAt so the chat bubbles to the top of history.
  await db.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  });

  // 6. Run the agent and return as SSE. The agent loads the chat's messages
  //    fresh from the DB, so it will see the user message as the latest turn
  //    and stream a brand-new assistant response.
  const stream = await runAgentAsReadableStream({
    chatId,
    workspaceId: chat.workspaceId,
    context: { activeFile: null },
  });
  return sseResponse(stream);
}
