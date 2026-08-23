"use client";

import * as React from "react";
import { db, flushStorage } from "@/lib/db";
import { useWorkspaceStore } from "@/stores/workspace-store";

type FileMap = Record<string, { content: string; isBinary: boolean }>;

/**
 * Every file edit is written to localStorage almost immediately.
 * There is no manual save — the workspace store is the source of truth
 * and this hook keeps the persisted DB in lockstep.
 */
export function useInstantFileSync() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const files = useWorkspaceStore((s) => s.files);
  const prevRef = React.useRef<{ wsId: string | null; files: FileMap }>({
    wsId: null,
    files: {},
  });

  React.useEffect(() => {
    if (!wsId) {
      prevRef.current = { wsId: null, files: {} };
      return;
    }

    const keys = Object.keys(files);
    if (keys.length === 0) {
      prevRef.current = { wsId, files };
      return;
    }

    const prev = prevRef.current;
    const workspaceJustChanged = prev.wsId !== wsId;
    prevRef.current = { wsId, files };
    // Bootstrap just loaded this workspace — don't rewrite every file.
    if (workspaceJustChanged) return;

    const handle = window.setTimeout(() => {
      const prevPaths = new Set(Object.keys(prev.files));
      const nextPaths = new Set(Object.keys(files));

      for (const path of prevPaths) {
        if (!nextPaths.has(path)) {
          db.file
            .deleteMany({ where: { workspaceId: wsId, path } })
            .catch(() => {});
        }
      }

      for (const [path, f] of Object.entries(files)) {
        const old = prev.files[path];
        if (old && old.content === f.content && old.isBinary === f.isBinary) continue;
        db.file
          .upsert({
            where: { workspaceId_path: { workspaceId: wsId, path } },
            update: { content: f.content, isBinary: f.isBinary },
            create: {
              workspaceId: wsId,
              path,
              content: f.content,
              isBinary: f.isBinary,
            },
          })
          .catch(() => {});
      }

      useWorkspaceStore.getState().markAllSaved();
      flushStorage();
    }, 40);

    return () => window.clearTimeout(handle);
  }, [files, wsId]);

  React.useEffect(() => {
    function flush() {
      const state = useWorkspaceStore.getState();
      const id = state.currentWorkspaceId;
      if (!id) return;
      for (const [path, f] of Object.entries(state.files)) {
        try {
          // Best-effort sync write via the already-open db (microtask persist).
          void db.file.upsert({
            where: { workspaceId_path: { workspaceId: id, path } },
            update: { content: f.content, isBinary: f.isBinary },
            create: {
              workspaceId: id,
              path,
              content: f.content,
              isBinary: f.isBinary,
            },
          });
        } catch {
          // ignore
        }
      }
      flushStorage();
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
}
