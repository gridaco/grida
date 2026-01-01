"use client";

import React from "react";
import { ChunkPaints } from "./chunk-paints";
import {
  PropertyLineLabel,
  PropertyRow,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
} from "../ui";
import { useCurrentEditor, useMixedProperties } from "@/grida-canvas-react";
import { PropertySection } from "../ui";
import { PaintControl } from "../controls/paint";
import type cg from "@grida/cg";

export function SectionFills({ node_id }: { node_id: string }) {
  return <ChunkPaints node_id={node_id} paintTarget="fill" title="Fills" />;
}

export function SectionFillsMixed({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const mp = useMixedProperties(ids, (node) => {
    return {
      fill: node.fill,
    };
  });

  const fill = mp.fill;

  return (
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Fills</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <PropertyRow>
          <PropertyLineLabel>Fill</PropertyLineLabel>
          <PaintControl
            value={fill?.mixed || fill?.partial ? undefined : fill?.value}
            onValueChange={(value) => {
              const paints = value === null ? [] : [value as cg.Paint];
              instance.commands.changeNodePropertyFills(ids, paints);
            }}
          />
        </PropertyRow>
      </PropertySectionContent>
    </PropertySection>
  );
}
