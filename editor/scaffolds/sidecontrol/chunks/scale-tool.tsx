"use client";

import * as React from "react";
import type { Editor } from "@/grida-canvas/editor";
import cmath from "@grida/cmath";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { Button } from "@/components/ui-editor/button";
import { Cross2Icon } from "@radix-ui/react-icons";
import { PropertyLine, PropertyLineLabel } from "../ui";
import InputPropertyNumber from "../ui/number";
import { ScaleFactorControl } from "../controls/scale-factor";
import { Alignment9Control } from "../controls/alignment9";
import { useEditorState } from "@/grida-canvas-react";

/**
 * Manages the Scale tool's *session-scale* value.
 *
 * Why this exists:
 * - The Scale tool (K) can be driven by **two sources**:
 *   1) direct UI edits (typing a scale value)
 *   2) an interactive canvas gesture (drag scale handles)
 * - During a gesture, the reducer tracks a `gesture.uniform_scale` that is
 *   relative to the gesture's own start (1 → ...).
 * - The panel's `sessionScale` is an **ephemeral, per-panel baseline** that can
 *   already be != 1 before a new gesture begins (e.g. user typed 2x, then drags).
 *
 * Contract:
 * - On gesture start, capture the current `sessionScale` as baseline.
 * - While gesture is active, keep `sessionScale = baseline * uniform_scale`.
 * - When the panel is re-initialized (selection/tool changes), reset gesture baseline.
 */
function useScaleToolSessionScale({
  editor,
  visible,
  selection_key,
  sessionScale,
  setSessionScale,
}: {
  editor: Editor;
  visible: boolean;
  selection_key: string;
  sessionScale: number;
  setSessionScale: (v: number) => void;
}) {
  const isParametricScaling = useEditorState(editor, (state) => {
    const g = state.gesture;
    return g.type === "scale" && g.mode === "parametric";
  });

  const uniformScale = useEditorState(editor, (state) => {
    const g = state.gesture;
    if (g.type !== "scale" || g.mode !== "parametric") return null;
    return g.uniform_scale ?? 1;
  });

  const session_scale_at_gesture_start = React.useRef(1);
  const was_parametric_scaling = React.useRef(false);

  React.useEffect(() => {
    // Capture the session scale baseline when a new drag gesture begins.
    if (isParametricScaling && !was_parametric_scaling.current) {
      session_scale_at_gesture_start.current = sessionScale;
    }
    was_parametric_scaling.current = isParametricScaling;
  }, [isParametricScaling, sessionScale]);

  React.useEffect(() => {
    if (!isParametricScaling) return;
    if (uniformScale === null) return;
    if (!Number.isFinite(uniformScale)) return;

    const next = session_scale_at_gesture_start.current * uniformScale;
    setSessionScale(next);
  }, [isParametricScaling, uniformScale, setSessionScale]);

  React.useEffect(() => {
    // If the panel is re-initialized, also reset the gesture baseline.
    session_scale_at_gesture_start.current = 1;
    was_parametric_scaling.current = false;
  }, [visible, selection_key]);
}

export function ScaleToolSection({
  visible,
  selection,
  editor,
}: {
  visible: boolean;
  selection: string[];
  editor: Editor;
}) {
  const selection_key = selection.join(",");
  const [baseRect, setBaseRect] = React.useState<cmath.Rectangle | null>(null);
  const [sessionScale, setSessionScale] = React.useState<number>(1);
  const [sessionOrigin, setSessionOrigin] =
    React.useState<cmath.Alignment9>("center");

  // UX:
  // The Scale tool panel auto-focuses the scale factor input when the user enters the tool (K).
  // We should auto-exit the tool only if the user commits *directly* from that initial focus
  // state (e.g. K -> type -> Enter). If the user interacted elsewhere (the auto-focused input
  // ever blurred), we do NOT auto-exit on commit.
  const didAutofocusScaleFactorEverBlur = React.useRef(false);

  useScaleToolSessionScale({
    editor,
    visible,
    selection_key,
    sessionScale,
    setSessionScale,
  });

  React.useEffect(() => {
    if (!visible) return;
    didAutofocusScaleFactorEverBlur.current = false;
  }, [visible]);

  React.useEffect(() => {
    if (!visible) return;
    if (!selection.length) return;

    const rects = selection
      .map((id) => editor.geometryProvider.getNodeAbsoluteBoundingRect(id))
      .filter((r): r is cmath.Rectangle => !!r);
    if (!rects.length) return;

    setBaseRect(cmath.rect.union(rects));
    setSessionScale(1);
    setSessionOrigin("center");
  }, [visible, selection_key, editor]);

  const baseWidth = baseRect?.width ?? 0;
  const baseHeight = baseRect?.height ?? 0;

  const width = baseWidth * sessionScale;
  const height = baseHeight * sessionScale;

  const applyNewScale = React.useCallback(
    (next: number) => {
      if (!visible) return;
      if (!selection.length) return;
      if (!Number.isFinite(next)) return;

      const nextScale = Math.max(0.01, next);
      const factorToApply = nextScale / sessionScale;

      // apply delta factor to the authored state (anchor from selection alignment)
      if (Number.isFinite(factorToApply) && factorToApply !== 1) {
        editor.commands.applyScale(selection, factorToApply, {
          origin: cmath.compass.fromAlignment9(sessionOrigin),
          include_subtree: true,
        });

        // Auto-exit only if the user committed directly from the initial autofocus.
        if (!didAutofocusScaleFactorEverBlur.current) {
          editor.surface.surfaceSetTool(
            { type: "cursor" },
            "scale-tool/applyScale"
          );
        }
      }

      // keep panel-internal scale as display state (ephemeral session memory)
      setSessionScale(nextScale);
    },
    [editor, selection, sessionOrigin, sessionScale, visible]
  );

  if (!visible || selection.length === 0) return null;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Scale</SidebarSectionHeaderLabel>
        <SidebarSectionHeaderActions>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.surface.surfaceSetTool({ type: "cursor" })}
          >
            <Cross2Icon className="size-3" />
          </Button>
        </SidebarSectionHeaderActions>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Size</PropertyLineLabel>
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
              <InputPropertyNumber
                mode="fixed"
                type="number"
                value={width}
                step={1}
                min={0}
                onValueCommit={(v) => {
                  if (!baseWidth) return;
                  applyNewScale(v / baseWidth);
                }}
                icon={
                  <span className="text-[9px] text-muted-foreground">W</span>
                }
              />
            </div>
            <div className="flex-1 min-w-0">
              <InputPropertyNumber
                mode="fixed"
                type="number"
                value={height}
                step={1}
                min={0}
                onValueCommit={(v) => {
                  if (!baseHeight) return;
                  applyNewScale(v / baseHeight);
                }}
                icon={
                  <span className="text-[9px] text-muted-foreground">H</span>
                }
              />
            </div>
          </div>
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Scale</PropertyLineLabel>
          <div className="flex items-start gap-2 w-full">
            <div className="flex-1 min-w-0">
              <ScaleFactorControl
                value={sessionScale}
                onValueCommit={applyNewScale}
                autoFocus
                onInputBlur={() => {
                  didAutofocusScaleFactorEverBlur.current = true;
                }}
              />
            </div>
            <Alignment9Control
              value={sessionOrigin}
              onValueChange={setSessionOrigin}
              className="aspect-square flex-1"
            />
          </div>
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}
