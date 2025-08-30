import React from "react";
import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { useCurrentFont } from "./context/font";

export type FontStyleChange =
  | { type: "instance"; name: string }
  | { type: "values"; values: Record<string, number> };

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
 * - Handle style selection changes through the provided callbacks
 * - Ensure your font parser provides the necessary data structure this component expects
 * - The component is purely driven by the font context and will automatically deselect
 *   when the current font variations don't match any instance exactly
 */
export function FontStyleControl({
  onValueChange,
}: {
  onValueChange?: (change: FontStyleChange) => void;
}) {
  const { instances, weights, matchingInstanceName, currentFontVariations } =
    useCurrentFont();
  const enums = React.useMemo(() => {
    if (instances && instances.length > 0) {
      const mapped = instances.map((inst) => ({
        value: inst.name,
        label: inst.name,
      }));
      if (mapped.length > 0) return mapped;
    }
    return weights;
  }, [instances, weights]);

  // Show custom placeholder when there's no exact match but we have instances
  const isCustom = instances && instances.length > 0 && !matchingInstanceName;

  // Create informative custom placeholder with actual variation values
  const customPlaceholder = React.useMemo(() => {
    if (!isCustom || !currentFontVariations) return undefined;

    const variations = Object.entries(currentFontVariations)
      .map(([axis, value]) => `${axis}: ${value}`)
      .join(", ");

    return variations || "Custom";
  }, [isCustom, currentFontVariations]);

  return (
    <PropertyEnum
      value={matchingInstanceName || ""}
      placeholder={customPlaceholder}
      enum={enums}
      disabled={enums.length === 0}
      onValueChange={(v) => {
        if (instances && instances.length > 0) {
          onValueChange?.({ type: "instance", name: v });
        } else {
          onValueChange?.({
            type: "values",
            values: { wght: parseInt(v) },
          });
        }
      }}
    />
  );
}
