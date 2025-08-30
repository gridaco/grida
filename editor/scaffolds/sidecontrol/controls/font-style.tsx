import React from "react";
import type cg from "@grida/cg";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import { useCurrentFont } from "./context/font";

type NFontWeight = cg.NFontWeight;

/**
 * Font Style (Variation Instance) Control Component
 *
 * This component is a font-pre-defined style picker designed specifically for usage with:
 * - OpenType STAT Axis names
 * - fvar.instances
 *
 * While this may look similar to font-weight.tsx, this component is explicitly designed
 * for handling font style variations through OpenType font features rather than generic
 * font weight controls.
 *
 * IMPORTANT: This component requires a proper font parser to function correctly.
 * The component itself does not provide font parsing functionality - it is purely
 * a UI wrapper around font parsing results. You must integrate this with a font
 * parser that can extract STAT axis information and fvar instances from OpenType fonts.
 *
 * Usage:
 * - Pass parsed font style data (STAT axis values, fvar instances) as props
 * - Handle style selection changes through the provided callbacks
 * - Ensure your font parser provides the necessary data structure this component expects
 */
export function FontStyleControl({
  value,
  onValueChange,
}: {
  value?: TMixed<NFontWeight>;
  onValueChange?: (value: NFontWeight) => void;
}) {
  const { instances, weights } = useCurrentFont();
  const enums = React.useMemo(() => {
    if (instances && instances.length > 0) {
      const mapped = instances
        .map((inst) => {
          const wght = inst.coordinates["wght"];
          if (typeof wght !== "number") return null;
          return { value: wght.toString(), label: inst.name };
        })
        .filter(Boolean) as { value: string; label: string }[];
      if (mapped.length > 0) return mapped;
    }
    return weights;
  }, [instances, weights]);

  const valueString = typeof value === "number" ? value.toString() : value;
  const isCustom =
    typeof value === "number" && !enums.some((e) => e.value === valueString);

  return (
    <PropertyEnum
      value={isCustom ? undefined : valueString}
      placeholder={isCustom ? `wght: ${valueString?.toString()}` : undefined}
      enum={enums}
      disabled={enums.length === 0}
      onValueChange={(v) => {
        onValueChange?.(parseInt(v) as NFontWeight);
      }}
    />
  );
}
