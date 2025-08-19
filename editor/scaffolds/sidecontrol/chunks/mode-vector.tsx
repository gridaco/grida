"use client";

import React from "react";

import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { PropertyEnumTabs, PropertyLine, PropertyLineLabel } from "../ui";
import InputPropertyNumber from "../ui/number";
import useVectorContentEditMode from "@/grida-canvas-react/use-sub-vector-network-editor";
import useTangentMirroring from "./use-tangent-mirroring";
import vn from "@grida/vn";
import grida from "@grida/schema";
import type { editor } from "@/grida-canvas";
import {
  useA11yActions,
  useNodeActions,
  useNodeState,
} from "@/grida-canvas-react/provider";
import { encodeTranslateVectorCommand } from "@/grida-canvas/reducers/methods";
import { FillControl } from "../controls/fill";
import {
  MirroringAll,
  MirroringAngle,
  MirroringNone,
} from "@/grida-canvas-react-starter-kit/starterkit-icons/tangent-mirroring-mode";

export function ModeVectorEditModeProperties({ node_id }: { node_id: string }) {
  return (
    <div key={node_id} className="mt-4 mb-10">
      <SectionGeometry node_id={node_id} />
      <SectionFills node_id={node_id} />
    </div>
  );
}

function SectionGeometry({ node_id }: { node_id: string }) {
  const {
    selected_vertices,
    selected_segments,
    selected_tangents,
    absolute_vertices,
    segments,
    network: vectorNetwork,
  } = useVectorContentEditMode();
  const {
    value: mirroring,
    setValue: setMirroring,
    disabled: mirroringDisabled,
  } = useTangentMirroring(
    node_id,
    vectorNetwork,
    selected_tangents,
    selected_vertices
  );

  const { a11yarrow } = useA11yActions();

  const points = React.useMemo(() => {
    const { vertices, tangents } = encodeTranslateVectorCommand(vectorNetwork, {
      selected_vertices,
      selected_segments,
      selected_tangents,
    });
    const result: [number, number][] = [];
    for (const v of vertices) {
      result.push(absolute_vertices[v]);
    }
    for (const [v_idx, t_idx] of tangents) {
      const seg = segments.find((s) =>
        t_idx === 0 ? s.a === v_idx : s.b === v_idx
      );
      if (!seg) continue;
      const vertex = absolute_vertices[t_idx === 0 ? seg.a : seg.b];
      const tangent = t_idx === 0 ? seg.ta : seg.tb;
      result.push([vertex[0] + tangent[0], vertex[1] + tangent[1]]);
    }
    return result;
  }, [
    vectorNetwork,
    selected_vertices,
    selected_segments,
    selected_tangents,
    absolute_vertices,
    segments,
  ]);

  const computeMixed = React.useCallback(
    (values: number[]): typeof grida.mixed | number | "" => {
      if (values.length === 0) return "";
      const first = values[0];
      return values.every((v) => v === first) ? first : grida.mixed;
    },
    []
  );

  const x = computeMixed(points.map((p) => p[0]));
  const y = computeMixed(points.map((p) => p[1]));

  const handleDelta = React.useCallback(
    (axis: "x" | "y") => (change: editor.api.NumberChange) => {
      if (change.type !== "delta") return;
      const direction =
        axis === "x"
          ? change.value > 0
            ? "right"
            : "left"
          : change.value > 0
            ? "down"
            : "up";
      const shift = Math.abs(change.value) > 1;
      a11yarrow("selection", direction, shift);
    },
    [a11yarrow]
  );

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine className="items-center gap-1">
          <PropertyLineLabel>Position</PropertyLineLabel>
          <InputPropertyNumber
            mode="auto"
            value={x}
            onValueChange={handleDelta("x")}
            icon={<span className="text-[9px] text-muted-foreground">X</span>}
          />
          <InputPropertyNumber
            mode="auto"
            value={y}
            onValueChange={handleDelta("y")}
            icon={<span className="text-[9px] text-muted-foreground">Y</span>}
          />
        </PropertyLine>
        <PropertyLine className="items-center gap-1">
          <PropertyLineLabel>Mirroring</PropertyLineLabel>
          <PropertyEnumTabs
            enum={[
              {
                value: "none",
                icon: <MirroringNone className="size-5" />,
                title: "No mirroring",
              },
              {
                value: "all",
                icon: <MirroringAll className="size-5" />,
                title: "Perfect mirroring",
              },
              {
                value: "angle",
                icon: <MirroringAngle className="size-5" />,
                title: "Only angle is mirrored, length can vary",
              },
            ]}
            value={mirroring}
            onValueChange={(v) =>
              setMirroring(v as vn.StrictTangentMirroringMode)
            }
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
  //
}

function SectionFills({ node_id }: { node_id: string }) {
  const { fill } = useNodeState(node_id, (node) => ({
    fill: node.fill,
  }));

  const actions = useNodeActions(node_id)!;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Fills</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Fill</PropertyLineLabel>
          <FillControl value={fill} onValueChange={actions.fill} removable />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}
