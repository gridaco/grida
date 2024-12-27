import React from "react";
import { grida } from "@/grida";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

type NFontWeight = grida.program.cg.NFontWeight;

export function FontWeightControl({
  value,
  onValueChange,
}: {
  value?: TMixed<NFontWeight>;
  onValueChange?: (value: NFontWeight) => void;
}) {
  return (
    <PropertyEnum
      value={typeof value === "number" ? value.toString() : value}
      enum={[
        { value: "100", label: "Thin" },
        { value: "200", label: "Extra Light" },
        { value: "300", label: "Light" },
        { value: "400", label: "Regular" },
        { value: "500", label: "Medium" },
        { value: "600", label: "Semi Bold" },
        { value: "700", label: "Bold" },
        { value: "800", label: "Extra Bold" },
        { value: "900", label: "Black" },
      ]}
      onValueChange={(v) => {
        onValueChange?.(parseInt(v) as NFontWeight);
      }}
    />
  );
}
