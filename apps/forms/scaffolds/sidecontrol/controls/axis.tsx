"use client";

import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import type { grida } from "@/grida";

export function AxisControl({
  value,
  onValueChange,
}: {
  value: grida.program.cg.Axis;
  onValueChange?: (value: grida.program.cg.Axis) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="flex-direction"
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as grida.program.cg.Axis);
      }}
    >
      <ToggleGroupItem value={"horizontal" satisfies grida.program.cg.Axis}>
        <ViewVerticalIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value={"vertical" satisfies grida.program.cg.Axis}>
        <ViewHorizontalIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
