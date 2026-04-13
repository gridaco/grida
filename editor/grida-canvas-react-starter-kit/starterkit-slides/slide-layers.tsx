"use client";

import { NodeHierarchyList } from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  useSlideEditorMode,
  useCurrentSlide,
} from "@/grida-canvas-react/use-slide-editor";

/**
 * Slide-aware layers panel.
 *
 * Renders the node hierarchy for the currently active slide by passing
 * the slide's tray id as `rootId` to {@link NodeHierarchyList}.
 *
 * Renders nothing when no slide is active.
 */
export function SlideLayersList() {
  const mode = useSlideEditorMode();
  const current = useCurrentSlide(mode);

  if (!current) return null;
  return <NodeHierarchyList rootId={current.id} />;
}
