import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export function StrokeJoinControl({
  value,
  onValueChange,
}: {
  value?: TMixed<cg.StrokeJoin>;
  onValueChange?: (value: cg.StrokeJoin) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "Miter",
          value: "miter" satisfies cg.StrokeJoin,
        },
        {
          label: "Round",
          value: "round" satisfies cg.StrokeJoin,
        },
        {
          label: "Bevel",
          value: "bevel" satisfies cg.StrokeJoin,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
