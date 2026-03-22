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
  const bridgeRef = useRef<EmbedBridge | null>(null);

  useEffect(() => {
    const bridge = new EmbedBridge(ed, { onFile });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [ed, onFile]);

  useEffect(() => {
    if (canvasReady) bridgeRef.current?.notifyReady();
  }, [canvasReady]);
}
