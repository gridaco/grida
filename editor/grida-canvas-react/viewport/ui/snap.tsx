import React, { useMemo } from "react";
import {
  useContentEditModeMinimalState,
  useGestureState,
  useToolState,
  useTransformState,
} from "@/grida-canvas-react/provider";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import { useViewport } from "../context";
import { SnapGuide as SnapGuideCanvas } from "@grida/hud/react";
import { WorkbenchColors } from "@/grida-canvas-react/ui-config";

export function SnapGuide() {
  const editor = useCurrentEditor();
  const surface_snapping = useEditorState(
    editor,
    (state) => state.surface_snapping
  );
  const { transform } = useTransformState();
  const { gesture } = useGestureState();
  const cem = useContentEditModeMinimalState();
  const tool = useToolState();
  const viewport = useViewport();

  const shouldShow = useMemo(
    () =>
      (cem?.type === "vector" && tool.type === "path") ||
      gesture.type === "translate" ||
      gesture.type === "translate-vector-controls" ||
      gesture.type === "curve" ||
      gesture.type === "nudge" ||
      gesture.type === "scale",
    [gesture, cem?.type, tool.type]
  );

  const snapping = shouldShow ? surface_snapping : undefined;

  return (
    <SnapGuideCanvas
      width={viewport?.clientWidth ?? 0}
      height={viewport?.clientHeight ?? 0}
      transform={transform}
      snapping={snapping}
      color={WorkbenchColors.red}
      className="absolute inset-0 z-[999999]"
    />
  );
}
