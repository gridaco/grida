"use client";

import React from "react";
import {
  ChunkPaints,
  usePaintContentEditMode,
  SectionPaintsHeader,
} from "./chunk-paints";
import {
  PropertySection,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertyRow,
} from "../ui";
import {
  useCurrentEditor,
  useMixedProperties,
  useBackendState,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react";
import { editor } from "@/grida-canvas";
import type cg from "@grida/cg";
import kolor from "@grida/color";

function getNextFillPaint(currentPaints: cg.Paint[]): cg.Paint {
  return {
    type: "solid",
    color: kolor.colorformats.newRGBA32F(
      0,
      0,
      0,
      currentPaints.length > 0 ? 0.5 : 1
    ),
    active: true,
  };
}

export function SectionFills({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const backend = useBackendState();
  const actions = useNodeActions(node_id)!;

  // Get paint data from node state
  const paintData = useNodeState<{
    paint: cg.Paint;
    paints: cg.Paint[];
  }>(node_id, (node) => {
    return {
      paint: node.fill as cg.Paint,
      paints: node.fill_paints as cg.Paint[],
    };
  });

  const { paint, paints } = paintData;

  const isCanvasBackend = backend === "canvas";
  const paintList = isCanvasBackend
    ? Array.isArray(paints) && paints.length > 0
      ? paints
      : paint
        ? [paint]
        : []
    : paint
      ? [paint]
      : [];

  // Track which paint is currently open (user-controlled state)
  const [openPaintIndex, setOpenPaintIndex] = React.useState<number | null>(
    null
  );

  // Use content edit mode hook
  const {
    selectedGradientStop,
    currentlyOpenIndex,
    handleSelectGradientStop,
    handleOpenChange: handleOpenChangeFromHook,
  } = usePaintContentEditMode({
    node_id,
    paintTarget: "fill",
    paints: paintList,
    openPaintIndex,
  });

  // Reset user-controlled state when content edit mode changes to a different node
  React.useEffect(() => {
    const { content_edit_mode } = instance.state;
    if (content_edit_mode && content_edit_mode.node_id !== node_id) {
      setOpenPaintIndex(null);
    }
  }, [instance, node_id]);

  // Reset open state when node_id changes (different node selected)
  const prevNodeIdRef = React.useRef(node_id);
  React.useEffect(() => {
    if (prevNodeIdRef.current !== node_id) {
      prevNodeIdRef.current = node_id;
      setOpenPaintIndex(null);
    }
  }, [node_id]);

  const handleOpenChange = React.useCallback(
    (paintIndex: number, open: boolean) => {
      if (open) {
        setOpenPaintIndex(paintIndex);
      } else {
        setOpenPaintIndex(null);
      }
      handleOpenChangeFromHook(paintIndex, open);
    },
    [handleOpenChangeFromHook]
  );

  const handleAddPaint = React.useCallback(() => {
    const newPaint = getNextFillPaint(paintList);
    actions.addFill(newPaint, "end");
  }, [actions, paintList]);

  const handleValueChange = React.useCallback(
    (nextPaints: cg.Paint[]) => {
      actions.fill_paints(nextPaints);
    },
    [actions]
  );

  const empty = paintList.length === 0;

  return (
    <PropertySection
      data-empty={empty}
      className="border-b pb-2 [&[data-empty='true']]:pb-0"
    >
      <SectionPaintsHeader
        title="Fills"
        onAddPaint={isCanvasBackend ? handleAddPaint : undefined}
        showAddButton={isCanvasBackend}
      />
      {!empty && (
        <ChunkPaints
          value={paintList}
          onValueChange={handleValueChange}
          contentEditMode={{
            onSelectGradientStop: handleSelectGradientStop,
            onOpenChange: handleOpenChange,
            selectedGradientStop,
            openPaintIndex: currentlyOpenIndex,
          }}
        />
      )}
    </PropertySection>
  );
}

export function SectionFillsMixed({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const backend = useBackendState();

  // Get fill_paints for all nodes using useMixedProperties
  const mp = useMixedProperties(ids, (node) => {
    const { paints } = editor.resolvePaints(node, "fill", 0);
    return {
      fill_paints: paints,
    };
  });

  const isCanvasBackend = backend === "canvas";

  // Check if all nodes have identical paint arrays
  const paintArrays = React.useMemo(() => {
    if (!mp.fill_paints) return null;
    // useMixedProperties returns mixed/partial/consistent structure
    if (mp.fill_paints.mixed === true || mp.fill_paints.partial === true) {
      return null;
    }
    // If consistent, all nodes have the same value (could be empty array)
    return mp.fill_paints.value ?? [];
  }, [mp.fill_paints]);

  const paintsAreIdentical = paintArrays !== null;
  const commonPaints = paintsAreIdentical ? paintArrays : [];

  if (!paintsAreIdentical) {
    return (
      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Fills</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <span className="text-[10px] text-muted-foreground/80">
              Mixed fill paints
            </span>
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>
    );
  }

  const handleAddPaint = React.useCallback(() => {
    const newPaint = getNextFillPaint(commonPaints);
    const currentPaints = [...commonPaints, newPaint];
    instance.commands.changeNodePropertyFills(ids, currentPaints);
  }, [commonPaints, ids, instance]);

  const handleValueChange = React.useCallback(
    (paints: cg.Paint[]) => {
      instance.commands.changeNodePropertyFills(ids, paints);
    },
    [ids, instance]
  );

  const empty = commonPaints.length === 0;

  return (
    <PropertySection
      data-empty={empty}
      className="border-b pb-2 [&[data-empty='true']]:pb-0"
    >
      <SectionPaintsHeader
        title="Fills"
        onAddPaint={isCanvasBackend ? handleAddPaint : undefined}
        showAddButton={isCanvasBackend}
      />
      {!empty && (
        <ChunkPaints value={commonPaints} onValueChange={handleValueChange} />
      )}
    </PropertySection>
  );
}
