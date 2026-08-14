// ============================================================================
// StreamEngine (PRD §5) + IncrementalDecoder (PRD §6) + EventParser (PRD §11).
//
// The engine consumes a raw ReadableStream<Uint8Array> from the provider,
// decodes bytes safely across chunk boundaries, parses SSE `data:` frames,
// and yields parsed StreamEvents to the caller IMMEDIATELY — no batching,
// no throttling, no paragraph-level buffering.
//
// Per PRD §8: the engine never performs UI work and never introduces
// artificial streaming latency. A render scheduler (in the stores) protects
// the browser from pathological rates, NOT this engine.
// ============================================================================

import type { StreamEvent } from "./types";

// ---------- IncrementalDecoder ----------
//
// Wraps a TextDecoder with `{ stream: true }` so multi-byte UTF-8 sequences
// split across network chunks are reconstructed correctly (PRD §6).

export class IncrementalDecoder {
  private decoder = new TextDecoder();
  private buffer = "";

  push(bytes: Uint8Array): string {
    // TextDecoder with stream:true retains incomplete multibyte sequences
    // internally and emits only complete characters. This is exactly the
    // "reconstruct Hello world from H/el/lo /wo/rld" requirement.
    this.buffer += this.decoder.decode(bytes, { stream: true });
    return this.flushReady();
  }

  // Returns the complete pending string (call after stream ends).
  finish(): string {
    const rest = this.decoder.decode();
    const out = this.buffer + rest;
    this.buffer = "";
    return out;
  }

  private flushReady(): string {
    // Everything in `this.buffer` is ready to consume right now.
    const out = this.buffer;
    this.buffer = "";
    return out;
  }
}

// ---------- SSE line splitter ----------
//
// SSE frames are separated by a blank line (`\n\n`). A single network chunk
// may contain partial frames, multiple frames, or a frame split across
// chunks. We buffer until a full frame (`\n\n`) is available, then emit it.

export class SSELineBuffer {
  private buffer = "";

  push(text: string): string[] {
    this.buffer += text;
    const frames: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) >= 0) {
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      frames.push(frame);
    }
    return frames;
  }

  // Flush any trailing partial frame (call after stream ends).
  finish(): string[] {
    const frames: string[] = [];
    const tail = this.buffer.trim();
    if (tail) frames.push(tail);
    this.buffer = "";
    return frames;
  }
}

// ---------- EventParser ----------
//
// Parses a single SSE frame into a StreamEvent. A frame is one or more
// `data:` lines; we concatenate them and JSON.parse the result. `[DONE]`
// is mapped to null (end-of-stream sentinel).

export function parseSSEFrame(frame: string): StreamEvent | "DONE" | null {
  const lines = frame.split("\n");
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataStr += line.slice(5).trimStart();
    }
  }
  if (!dataStr) return null;
  if (dataStr === "[DONE]") return "DONE";
  try {
    return JSON.parse(dataStr) as StreamEvent;
  } catch {
    // Malformed JSON — drop silently but never crash the stream (PRD §33).
    return null;
  }
}

// ---------- StreamEngine ----------
//
// The top-level async generator. Consume with `for await (const ev of engine)`.
// Yields StreamEvent objects in strict server-arrival order (PRD §27).
//
// Cancellation: pass an AbortSignal; the engine stops reading and returns.
// Errors: yielded as `stream.error` events so the caller can surface them
// without a try/catch around the loop (PRD §33).

export type StreamEngineOptions = {
  signal?: AbortSignal;
};

export async function* consumeReadableStream(
  stream: ReadableStream<Uint8Array>,
  opts: StreamEngineOptions = {}
): AsyncGenerator<StreamEvent, void, unknown> {
  const decoder = new IncrementalDecoder();
  const sseBuffer = new SSELineBuffer();
  const reader = stream.getReader();

  try {
    while (true) {
      if (opts.signal?.aborted) return;

      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err) {
        // Network error or abort — yield a stream.error so callers can react.
        if (opts.signal?.aborted) return;
        const msg = err instanceof Error ? err.message : "Network read failed";
        yield { type: "stream.error", messageId: "", content: msg };
        return;
      }

      if (readResult.done) break;

      const text = decoder.push(readResult.value);
      const frames = sseBuffer.push(text);
      for (const frame of frames) {
        const parsed = parseSSEFrame(frame);
        if (parsed === "DONE") return;
        if (parsed) yield parsed;
      }
    }

    // Flush any trailing partial bytes / frames.
    const tailText = decoder.finish();
    if (tailText) {
      const tailFrames = sseBuffer.push(tailText);
      for (const frame of tailFrames) {
        const parsed = parseSSEFrame(frame);
        if (parsed === "DONE") return;
        if (parsed) yield parsed;
      }
    }
    const finalFrames = sseBuffer.finish();
    for (const frame of finalFrames) {
      const parsed = parseSSEFrame(frame);
      if (parsed === "DONE") return;
      if (parsed) yield parsed;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
    }
  }
}
