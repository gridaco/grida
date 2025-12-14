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
            size="xs"
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
