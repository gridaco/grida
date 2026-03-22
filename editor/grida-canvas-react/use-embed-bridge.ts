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
  }: {
    canvasReady: boolean;
    onFile?: (file: File) => void;
  }
): void {
  // Store onFile in a ref to avoid recreating the bridge when it changes.
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  useEffect(() => {
    // Don't create bridge until canvas is ready — notifyReady needs to be
    // called exactly once per bridge lifetime, at creation time.
    if (!canvasReady) return;

    const bridge = new EmbedBridge(ed, {
      onFile: (file) => onFileRef.current?.(file),
    });
    bridge.notifyReady();

    return () => {
      bridge.dispose();
    };
  }, [ed, canvasReady]);
}
