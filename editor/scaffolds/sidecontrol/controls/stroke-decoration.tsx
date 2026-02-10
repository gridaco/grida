import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export function StrokeDecorationControl({
  value,
  onValueChange,
}: {
  value?: TMixed<cg.StrokeDecoration>;
  onValueChange?: (value: cg.StrokeDecoration) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "None",
          value: "none" satisfies cg.StrokeDecoration,
        },
        {
          label: "Arrow",
          value: "arrow_filled" satisfies cg.StrokeDecoration,
        },
        {
          label: "Open Arrow",
          value: "arrow_open" satisfies cg.StrokeDecoration,
        },
        {
          label: "Circle",
          value: "circle_filled" satisfies cg.StrokeDecoration,
        },
        {
          label: "Diamond",
          value: "diamond_filled" satisfies cg.StrokeDecoration,
        },
        {
          label: "Triangle",
          value: "triangle_filled" satisfies cg.StrokeDecoration,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
