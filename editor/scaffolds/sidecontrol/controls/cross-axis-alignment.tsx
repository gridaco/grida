import React from "react";
import {
  AlignLeftIcon,
  AlignRightIcon,
  AlignCenterHorizontallyIcon,
  AlignTopIcon,
  AlignCenterVerticallyIcon,
  AlignBottomIcon,
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import type { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

const iconsbyaxis = {
  vertical: {
    start: AlignTopIcon,
    center: AlignCenterVerticallyIcon,
    end: AlignBottomIcon,
  },
  horizontal: {
    start: AlignLeftIcon,
    center: AlignCenterHorizontallyIcon,
    end: AlignRightIcon,
  },
};

const icons = {
  horizontal: iconsbyaxis.vertical,
  vertical: iconsbyaxis.horizontal,
};

type CrossAxisAlignment = cg.CrossAxisAlignment;

export function CrossAxisAlignmentControl({
  value,
  direction = "horizontal",
  onValueChange,
}: {
  value?: TMixed<CrossAxisAlignment>;
  direction?: cg.Axis;
  onValueChange?: (value: CrossAxisAlignment) => void;
}) {
  return (
    <PropertyEnumToggle<CrossAxisAlignment>
      enum={[
        {
          label: "Start",
          value: "start",
          icon: React.createElement(icons[direction].start),
        },
        {
          label: "Center",
          value: "center",
          icon: React.createElement(icons[direction].center),
        },
        {
          label: "End",
          value: "end",
          icon: React.createElement(icons[direction].end),
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
