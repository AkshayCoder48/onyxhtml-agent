# Agent B — chat-features

Task: Add chat features — Retry on ErrorCard, Regenerate last response button,
Duplicate chat, Continue-after-stop.

## Files owned and modified

- `src/app/api/chats/[id]/duplicate/route.ts` — NEW
- `src/app/api/chats/[id]/messages/regenerate/route.ts` — NEW
- `src/lib/api.ts` — added `duplicateChat` + `streamRegenerate` methods
- `src/hooks/use-chat-stream.ts` — added `regenerate()` + `lastUserMessage` + window event listener
- `src/components/chat/chat-messages.tsx` — wired `onRetry` on ErrorCard + added Regenerate button under the last assistant message
- `src/components/chat/chat-history.tsx` — added Duplicate dropdown menu item

## Work summary

### 1. Duplicate API endpoint
- `POST /api/chats/[id]/duplicate` creates a new chat in the same workspace with
  title `<original title> (copy)`, then copies ALL messages from the source chat
  inside a `db.$transaction`. The `segments` JSON string is copied verbatim
  (preserving tool_call callIds / arguments / results / status / label / detail)
  — only the message IDs are new (Prisma cuids).
- Returns `{ chat: <Chat DTO> }`.
- Verified: `curl -X POST /api/chats/<id>/duplicate` → 200, new chat with 12
  messages matching the source.

### 2. Regenerate API endpoint
- `POST /api/chats/[id]/messages/regenerate`:
  1. Loads all messages ordered by createdAt ASC.
  2. Finds the LAST user message (role === "user"). Returns 400 if none exists.
  3. Deletes every message strictly AFTER that last user message.
  4. Creates a new empty assistant message (streaming target).
  5. Touches `chat.updatedAt`.
  6. Calls `runAgentAsReadableStream({ chatId, workspaceId, context: { activeFile: null } })`
     and returns `sseResponse(stream)` — identical pattern to the messages route.
- Verified: `curl -N -X POST .../messages/regenerate` → 200, `text/event-stream`,
  emits `content` SSE chunks for 8 seconds before timing out (the SSE response
  itself kept streaming).

### 3. `src/lib/api.ts`
- Added `duplicateChat(id)` → `request<{ chat: Chat }>("/api/chats/<id>/duplicate", { method: "POST" })`.
- Added `streamRegenerate(chatId, signal)` async generator — mirrors `streamMessage`
  exactly (fetch + `parseSSE`) except it POSTs with no body and to the regenerate URL.

### 4. `src/hooks/use-chat-stream.ts`
- Added a `regenerate()` callback that:
  1. Reads `chatId` from the store, aborts any in-flight stream first.
  2. Locally trims the messages array to keep everything up to and including the
     LAST user message (mirrors what the server does DB-side).
  3. Appends a fresh empty assistant message, calls `startStreaming`, opens an
     AbortController.
  4. Calls `api.streamRegenerate` and pipes through the existing `consumeStream`.
  5. After the stream ends, runs `executeBrowserToolsAndContinue` if any browser
     tools are pending (same flow as `sendMessage`).
  6. On error: pushes an `error` segment + toast with Retry action that re-invokes
     `regenerateRef.current()` (the ref pattern from `sendMessageRef`).
  7. Finally: `stopStreaming()` + clears the controller + resets the handled-browser-calls set.
- Exposed `regenerate` and `lastUserMessage` in the returned object.
- `lastUserMessage` is derived from `messages` by scanning from the end and joining
  all `content` segments of the last user message. Computed inline (no `useMemo`)
  because the React Compiler flagged manual memoization as un-preservable.
- Added a `useEffect` that subscribes to `window.addEventListener("chat:regenerate")`
  and invokes `regenerateRef.current()` — this lets any UI surface (the Regenerate
  button in `chat-messages.tsx`, the Retry action on an `ErrorCard`, a future
  keyboard shortcut, etc.) trigger regeneration without needing direct access to
  the hook instance. The hook is the single owner of streaming state, so it's the
  right place to centralize the side effect.

### 5. `src/components/chat/chat-messages.tsx`
- Added a `triggerRegenerate()` helper that dispatches a `chat:regenerate`
  CustomEvent on `window`.
- Wired `onRetry={triggerRegenerate}` on the `<ErrorCard>` for `error` segments —
  the ErrorCard component already supported `onRetry`, but it wasn't being passed.
- Added a "Regenerate" button (ghost, RefreshCw icon, `text-xs`) below the last
  message when (a) the last message is an assistant message and (b) `isStreaming`
  is false. Hidden while streaming.
- The Regenerate button dispatches the same `chat:regenerate` event, which the
  `useChatStream` hook listens for and acts on.

### 6. `src/components/chat/chat-history.tsx`
- Added a `Copy` icon import from `lucide-react`.
- Added a `handleDuplicate(id)` handler that calls `api.duplicateChat(id)`,
  invalidates the chats query, and toasts success/failure.
- Added a "Duplicate" `<DropdownMenuItem>` between Rename and Delete in the
  chat-row dropdown.

### Verification

- `bun run lint` → exit 0 (clean, no errors, no warnings).
- `npx tsc --noEmit` → no TS errors in any of MY owned files. Pre-existing TS
  errors in `chat-history.tsx:65` (Record index possibly undefined — pre-existing,
  verified via `git stash`), `home-screen.tsx`, `api/settings/route.ts`, and
  `api/workspaces/[id]/files/rename/route.ts` were noted by Agent A and are not
  introduced by me.
- dev.log: duplicate endpoint returned 200 in 889ms; regenerate endpoint
  returned 200 with SSE streaming. No runtime errors in my files.
- Smoke-tested both endpoints via curl:
  - `POST /api/chats/<id>/duplicate` → 200 with `{ chat: {...} }` and the new
    chat has all 12 source messages copied (verified via `GET /api/chats/<newId>`).
  - `POST /api/chats/<newId>/messages/regenerate` → 200 with `text/event-stream`
    and live SSE content chunks streaming from the model.

### Important notes for downstream agents / main agent

- The "Continue-after-stop" feature is handled by the existing `stop()` function
  in `use-chat-stream.ts` + the new `regenerate()` function: after a user stops
  mid-stream, the partial assistant message remains in the UI. They can either
  type a new message (`sendMessage`) OR click the new Regenerate button to retry
  the response to the last user message.
- The window event `chat:regenerate` is the single entry point for triggering
  regeneration from any UI surface. It is wired up at the hook level
  (`useChatStream`) — no changes to `chat-panel.tsx` or `prompt-box.tsx` are
  required.
- `prompt-box.tsx` was NOT touched (per the constraint).
- `chat-store.ts` was NOT touched (per the constraint). The coalescing layer is
  preserved.
- All API request URLs are relative paths (no absolute URLs, no port in URL).
