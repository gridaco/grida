import React, { useCallback } from "react";
import { usePreferences } from "@code-editor/preferences";
import {
  D2CVanillaPreview,
  OptimizedPreviewCanvas,
} from "scaffolds/preview-canvas";

/**
 * Returns a dedicated funtion to render a node with preferred renderer component.
 * @returns
 */
export function useRenderItemWithPreference() {
  const { config: preferences } = usePreferences();
  const { renderer } = preferences.canvas;

  const renderItem = useCallback(
    (p) => {
      switch (renderer) {
        case "bitmap-renderer": {
          return (
            <OptimizedPreviewCanvas key={p.node.id} target={p.node} {...p} />
          );
        }
        case "vanilla-renderer": {
          return <D2CVanillaPreview key={p.node.id} target={p.node} {...p} />;
        }
        default:
          throw new Error("Unknown renderer", renderer);
      }
    },
    [renderer]
  );

  return renderItem;
}
