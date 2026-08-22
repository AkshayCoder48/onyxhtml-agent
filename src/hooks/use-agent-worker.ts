"use client";

import * as React from "react";
import type { StreamEvent } from "@/lib/streaming/types";
import type {
  StartMessage,
  WorkerChatMessage,
  WorkerFile,
  WorkerProvider,
} from "@/lib/ai/agent-runner";

export type AgentRunHandle = {
  // Consume events as they arrive. Returns a promise that resolves when the
  // run finishes (done or error).
  events: AsyncIterable<StreamEvent>;
  stop: () => void;
  resume: (
    results: { callId: string; result?: unknown; error?: string }[]
  ) => void;
  done: Promise<void>;
};

let workerSingleton: Worker | null = null;
let workerReady: Promise<void> | null = null;

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  if (typeof window === "undefined") {
    throw new Error("Worker cannot be created during SSR");
  }
  const worker = new Worker(
    // @vite-ignore / webpack chunk name hint
    new URL("../workers/agent.worker.ts", import.meta.url),
    { type: "module", name: "onyx-agent" }
  );
  workerSingleton = worker;
  workerReady = new Promise<void>((resolve) => {
    function onReady(e: MessageEvent) {
      if (e.data && e.data.type === "worker-ready") {
        worker.removeEventListener("message", onReady);
        resolve();
      }
    }
    worker.addEventListener("message", onReady);
  });
  return worker;
}

type StartInput = Omit<StartMessage, "type" | "runId" | "messageId"> & {
  messageId: string;
};

export function useAgentWorker() {
  const runRef = React.useRef<{
    resolve: () => void;
    reject: (e: unknown) => void;
    queue: StreamEvent[];
    waiters: Array<(ev: IteratorResult<StreamEvent>) => void>;
    finished: boolean;
  } | null>(null);

  const listenersRef = React.useRef<Set<(ev: StreamEvent | { type: "__done" }) => void>>(new Set());

  React.useEffect(() => {
    const worker = getWorker();
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data) return;
      if (data.type === "worker-ready") return;
      if (data.type === "__done" || data.type === "done") {
        const run = runRef.current;
        if (run) {
          run.finished = true;
          // Flush any pending waiters
          for (const w of run.waiters.splice(0)) w({ value: undefined, done: true });
          run.resolve();
        }
        listenersRef.current.forEach((l) => l({ type: "__done" }));
        return;
      }
      // StreamEvent or persist/files-snapshot (non-stream control messages)
      if (data.type === "persist" || data.type === "files-snapshot") {
        listenersRef.current.forEach((l) => l(data));
        return;
      }
      const run = runRef.current;
      if (run) {
        if (run.waiters.length > 0) {
          const w = run.waiters.shift()!;
          w({ value: data as StreamEvent, done: false });
        } else {
          run.queue.push(data as StreamEvent);
        }
      }
      listenersRef.current.forEach((l) => l(data));
    }
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, []);

  const start = React.useCallback(
    async (input: StartInput): Promise<AgentRunHandle> => {
      const worker = getWorker();
      await workerReady;

      const runId =
        "run_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

      const queue: StreamEvent[] = [];
      const waiters: Array<(ev: IteratorResult<StreamEvent>) => void> = [];
      let resolveDone!: () => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<void>((res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      });

      runRef.current = {
        resolve: resolveDone,
        reject: rejectDone,
        queue,
        waiters,
        finished: false,
      };

      const msg: StartMessage = {
        type: "start",
        runId,
        ...input,
      };
      worker.postMessage(msg);

      const events: AsyncIterable<StreamEvent> = {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<StreamEvent>> {
              const run = runRef.current;
              if (!run) return Promise.resolve({ value: undefined, done: true });
              if (run.queue.length > 0) {
                return Promise.resolve({
                  value: run.queue.shift()!,
                  done: false,
                });
              }
              if (run.finished) {
                return Promise.resolve({ value: undefined, done: true });
              }
              return new Promise((resolve) => {
                run.waiters.push(resolve);
              });
            },
          };
        },
      };

      return {
        events,
        stop: () => worker.postMessage({ type: "stop" }),
        resume: (results) =>
          worker.postMessage({ type: "resume", results }),
        done,
      };
    },
    []
  );

  const onWorkerMessage = React.useCallback(
    (cb: (ev: StreamEvent | { type: "persist"; segments: unknown[]; files: WorkerFile[] } | { type: "files-snapshot"; files: WorkerFile[] } | { type: "__done" }) => void) => {
      listenersRef.current.add(cb);
      return () => {
        listenersRef.current.delete(cb);
      };
    },
    []
  );

  return { start, onWorkerMessage };
}

export type { WorkerProvider, WorkerChatMessage, WorkerFile };
