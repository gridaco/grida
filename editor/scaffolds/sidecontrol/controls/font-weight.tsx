import React from "react";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import type cg from "@grida/cg";

type NFontWeight = cg.NFontWeight;

const FONT_WEIGHT_ENUM = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

export function FontWeightControl({
  value,
  onValueChange,
}: {
  value?: TMixed<NFontWeight>;
  onValueChange?: (value: NFontWeight) => void;
}) {
  const valueString = typeof value === "number" ? value.toString() : value;
  const isCustom =
    typeof value === "number" &&
    !FONT_WEIGHT_ENUM.some((f) => f.value === valueString);

  return (
    <PropertyEnum
      value={isCustom ? undefined : valueString}
      placeholder={isCustom ? `wght: ${valueString}` : undefined}
      enum={FONT_WEIGHT_ENUM}
      onValueChange={(v) => {
        onValueChange?.(parseInt(v) as NFontWeight);
      }}
    />
  );
}
