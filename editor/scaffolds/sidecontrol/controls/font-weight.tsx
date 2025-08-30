import React from "react";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import { useCurrentFont } from "./context/font";
import type cg from "@grida/cg";

type NFontWeight = cg.NFontWeight;

export function FontWeightControl({
  value,
  onValueChange,
}: {
  value?: TMixed<NFontWeight>;
  onValueChange?: (value: NFontWeight) => void;
}) {
  const { weights } = useCurrentFont();
  const valueString = typeof value === "number" ? value.toString() : value;
  const isCustom =
    typeof value === "number" && !weights.some((f) => f.value === valueString);

  return (
    <PropertyEnum
      value={isCustom ? undefined : valueString}
      placeholder={isCustom ? `wght: ${valueString?.toString()}` : undefined}
      enum={weights}
      disabled={weights.length === 0}
      onValueChange={(v) => {
        onValueChange?.(parseInt(v) as NFontWeight);
      }}
    />
  );
}
