import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export function StrokeAlignControl({
  value = "inside",
  onValueChange,
}: {
  value?: TMixed<cg.StrokeAlign>;
  onValueChange?: (value: cg.StrokeAlign) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "Inside",
          value: "inside" satisfies cg.StrokeAlign,
        },
        {
          label: "Center",
          value: "center" satisfies cg.StrokeAlign,
        },
        {
          label: "Outside",
          value: "outside" satisfies cg.StrokeAlign,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
