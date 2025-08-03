"use client";

import React from "react";

import {
  SidebarMenuSectionContent,
  SidebarSection,
} from "@/components/sidebar";
import { PropertyLine, PropertyLineLabel } from "../ui";
import InputPropertyNumber from "../ui/number";
import useSurfaceVectorEditor from "@/grida-canvas-react/use-sub-vector-network-editor";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-editor/select";

export function ModeVectorEditModeProperties({ node_id }: { node_id: string }) {
  const { selected_vertices, selected_tangents, absolute_vertices, segments } =
    useSurfaceVectorEditor();

  let x: number | null = null;
  let y: number | null = null;

  if (selected_vertices.length === 1) {
    const p = absolute_vertices[selected_vertices[0]];
    x = p[0];
    y = p[1];
  } else if (selected_tangents.length === 1) {
    const [v_idx, t_idx] = selected_tangents[0];
    const seg = segments.find((s) =>
      t_idx === 0 ? s.a === v_idx : s.b === v_idx
    );
    if (seg) {
      const vertex = absolute_vertices[t_idx === 0 ? seg.a : seg.b];
      const tangent = t_idx === 0 ? seg.ta : seg.tb;
      x = vertex[0] + tangent[0];
      y = vertex[1] + tangent[1];
    }
  }

  return (
    <div key={node_id} className="mt-4 mb-10">
      <SidebarSection className="border-b pb-4">
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center gap-1">
            <PropertyLineLabel>Position</PropertyLineLabel>
            <InputPropertyNumber
              mode="fixed"
              value={x ?? ""}
              readOnly
              icon={<span className="text-[9px] text-muted-foreground">X</span>}
            />
            <InputPropertyNumber
              mode="fixed"
              value={y ?? ""}
              readOnly
              icon={<span className="text-[9px] text-muted-foreground">Y</span>}
            />
          </PropertyLine>
          <PropertyLine className="items-center gap-1">
            {/* TODO: */}
            <PropertyLineLabel>Mirroring</PropertyLineLabel>
            <Select disabled>
              <SelectTrigger size="xs">
                <SelectValue placeholder="Select a mirroring mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="angle">Angle</SelectItem>
              </SelectContent>
            </Select>
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}
