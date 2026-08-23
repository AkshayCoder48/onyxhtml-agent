"use client";
import * as React from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";

export function useAutoCheckpoint() {
  const files = useWorkspaceStore((s) => s.files);
  const addCheckpoint = useCheckpointStore((s) => s.addCheckpoint);
  const editCountRef = React.useRef(0);
  const lastFilesRef = React.useRef<string>("");

  React.useEffect(() => {
    const key = Object.keys(files).sort().join(",");
    if (key === lastFilesRef.current && Object.keys(files).length !== 0) {
      // Content changed, not just file list
      editCountRef.current += 1;
      if (editCountRef.current >= 5) {
        editCountRef.current = 0;
        const wsFiles = useWorkspaceStore.getState().files;
        addCheckpoint(`Auto checkpoint (${Object.keys(wsFiles).length} files)`, wsFiles);
      }
    }
    lastFilesRef.current = key;
  }, [files, addCheckpoint]);
}
