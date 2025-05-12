"use client";

import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";
import type cg from "@grida/cg";

export function AxisControl({
  value,
  onValueChange,
}: {
  value?: TMixed<cg.Axis>;
  onValueChange?: (value: cg.Axis) => void;
}) {
  return (
    <PropertyEnumToggle<cg.Axis>
      enum={[
        {
          label: "Horizontal",
          value: "horizontal" satisfies cg.Axis,
          icon: <ViewVerticalIcon />,
        },
        {
          label: "Vertical",
          value: "vertical" satisfies cg.Axis,
          icon: <ViewHorizontalIcon />,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
