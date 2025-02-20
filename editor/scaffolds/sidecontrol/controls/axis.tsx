"use client";

import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import type { grida } from "@/grida";
import { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

type Axis = grida.program.cg.Axis;

export function AxisControl({
  value,
  onValueChange,
}: {
  value?: TMixed<Axis>;
  onValueChange?: (value: Axis) => void;
}) {
  return (
    <PropertyEnumToggle<Axis>
      enum={[
        {
          label: "Horizontal",
          value: "horizontal" satisfies Axis,
          icon: <ViewVerticalIcon />,
        },
        {
          label: "Vertical",
          value: "vertical" satisfies Axis,
          icon: <ViewHorizontalIcon />,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
