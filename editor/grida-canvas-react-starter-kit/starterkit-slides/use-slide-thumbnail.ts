"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@/grida-canvas/editor";

/** Thumbnail width in px — sidebar is ~240px, with padding the card is ~210px */
const THUMBNAIL_WIDTH = 320;
/** Debounce delay in ms — wait for interaction to settle before re-baking */
const THUMBNAIL_DEBOUNCE_MS = 500;

/**
 * Hook that produces an object-URL thumbnail for a given node, re-baked on
 * document changes with a debounce so we don't thrash the WASM exporter
 * while the user is still interacting.
 */
export function useSlideThumbnail(
  editor: Editor,
  nodeId: string | undefined
): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef(0);

  const bake = useCallback(async () => {
    if (!nodeId) return;

    const gen = ++genRef.current;
    try {
      const bytes = await editor.exportNodeAs(nodeId, "PNG", {
        format: "PNG",
        constraints: {
          type: "scale-to-fit-width",
          value: THUMBNAIL_WIDTH,
        },
      });

      if (gen !== genRef.current) return;

      const blob = new Blob([bytes as BlobPart], { type: "image/png" });
      const url = URL.createObjectURL(blob);

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setSrc(url);
    } catch {
      // Export may fail for empty scenes, nodes not yet synced, etc.
    }
  }, [editor, nodeId]);

  useEffect(() => {
    if (!nodeId) return;

    void bake();

    const unsubscribe = editor.doc.subscribeWithSelector(
      (state) => state.document,
      () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          void bake();
        }, THUMBNAIL_DEBOUNCE_MS);
      }
    );

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [editor, nodeId, bake]);

  return src;
}
