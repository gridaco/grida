import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export function StrokeCapControl({
  value,
  onValueChange,
}: {
  value?: TMixed<cg.StrokeCap>;
  onValueChange?: (value: cg.StrokeCap) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "None",
          value: "butt" satisfies cg.StrokeCap,
        },
        {
          label: "Round",
          value: "round" satisfies cg.StrokeCap,
        },
        {
          label: "Square",
          value: "square" satisfies cg.StrokeCap,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
