// ============================================================================
// Agent Web Worker
//
// Runs the agentic LLM loop off the main thread so streaming tokens and tool
// calls never block the editor/preview UI. The main thread posts a "start"
// message containing all workspace data + provider; the worker emits
// StreamEvent-shaped messages back. Browser tools (which must touch the DOM)
// are surfaced as a "browser.tools_pending" event and executed by the main
// thread, which then posts "resume" with the results.
// ============================================================================

import { AgentRunner, type WorkerInMessage } from "@/lib/ai/agent-runner";

const runner = new AgentRunner();

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "start":
      runner.start(msg);
      break;
    case "resume":
      runner.resume(msg.results);
      break;
    case "stop":
      runner.stop();
      break;
  }
};

// Notify the main thread the worker is ready (useful for first-run spinner).
self.postMessage({ type: "worker-ready" });

export {};
