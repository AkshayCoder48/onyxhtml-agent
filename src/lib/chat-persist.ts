import { db, flushStorage } from "./db";
import { stringifyJSON } from "./settings";
import type { Message } from "./types";

function lastChatKey(wsId: string) {
  return `onyxhtml:last-chat:${wsId}`;
}

export function readLastChatId(wsId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastChatKey(wsId));
  } catch {
    return null;
  }
}

export function writeLastChatId(wsId: string, chatId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastChatKey(wsId), chatId);
  } catch {
    // quota / private mode
  }
}

export function titleFromText(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New Chat";
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

export async function persistChatMessages(chatId: string, messages: Message[]): Promise<void> {
  if (!chatId) return;
  for (const m of messages) {
    const segments = stringifyJSON(m.segments ?? []);
    try {
      await db.message.update({
        where: { id: m.id },
        data: { segments },
      });
    } catch {
      try {
        await db.message.create({
          data: {
            id: m.id,
            chatId,
            role: m.role,
            segments,
          },
        });
      } catch {
        // already exists or storage full
      }
    }
  }
  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }).catch(() => {});
  flushStorage();
}

export function firstUserText(messages: Message[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = m.segments
      .filter((s): s is { type: "content"; content: string } => s.type === "content")
      .map((s) => s.content)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
}
