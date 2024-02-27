import React, { useCallback } from "react";
import { usePreferences } from "@code-editor/preferences";
import {
  D2CVanillaPreview,
  OptimizedPreviewCanvas,
} from "scaffolds/preview-canvas";
import { CraftRenderPipeline } from "@/renderers/pipeline";

/**
 * Returns a dedicated funtion to render a node with preferred renderer component.
 * @returns
 */
export function useRenderItemWithPreference(props?: {
  force_use_renderer?:
    | "bitmap-renderer"
    | "d2c-vanilla-iframe-renderer"
    | "craft-renderer";
}) {
  const { config: preferences } = usePreferences();
  const { renderer: _preferred_renderer } = preferences.canvas;

  const renderer = props?.force_use_renderer || _preferred_renderer;

  const renderItem = useCallback(
    (p) => {
      switch (renderer) {
        case "bitmap-renderer": {
          return (
            <OptimizedPreviewCanvas key={p.node.id} target={p.node} {...p} />
          );
        }
        case "d2c-vanilla-iframe-renderer": {
          return <D2CVanillaPreview key={p.node.id} target={p.node} {...p} />;
        }
        case "craft-renderer": {
          return <CraftRenderPipeline key={p.node.id} target={p.node} {...p} />;
        }
        default:
          throw new Error("Unknown renderer", renderer as unknown);
      }
    },
    [renderer]
  );

  return renderItem;
}
