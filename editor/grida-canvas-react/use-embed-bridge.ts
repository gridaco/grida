"use client";

import { useEffect, useRef } from "react";
import type { Editor } from "@/grida-canvas/editor";
import { EmbedBridge } from "@/grida-canvas/embed-bridge";

/**
 * Thin React wrapper around {@link EmbedBridge}.
 */
export function useEmbedBridge(
  ed: Editor,
  {
    canvasReady,
    onFile,
    __dangerously_transform_node_id,
  }: {
    canvasReady: boolean;
    onFile?: (file: File) => void;
    /**
     * Optional transform applied to every node ID before it is emitted to the
     * host via postMessage. See {@link EmbedBridge} for details.
     */
    __dangerously_transform_node_id?: (id: string) => string;
  }
): void {
  // Store callbacks in refs to avoid recreating the bridge when they change.
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const transformRef = useRef(__dangerously_transform_node_id);
  transformRef.current = __dangerously_transform_node_id;

  useEffect(() => {
    // Don't create bridge until canvas is ready — notifyReady needs to be
    // called exactly once per bridge lifetime, at creation time.
    if (!canvasReady) return;

    const bridge = new EmbedBridge(ed, {
      onFile: (file) => onFileRef.current?.(file),
      __dangerously_transform_node_id: (id) =>
        transformRef.current ? transformRef.current(id) : id,
    });
    bridge.notifyReady();

    return () => {
      bridge.dispose();
    };
  }, [ed, canvasReady]);
}
