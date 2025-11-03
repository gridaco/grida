import React, { useMemo } from "react";
import { TMixed } from "./utils/types";
import InputPropertyNumber from "../ui/number";
import cmath from "@grida/cmath";
import grida from "@grida/schema";

/**
 * Stroke Miter Limit Control
 *
 * Controls the miter limit for stroke joins, determining when a miter join
 * falls back to a bevel join on sharp corners.
 *
 * **Value Conversion:**
 * - Internal/Renderer: Ratio format (e.g., 4.0) - the geometric extension ratio
 * - User Display: Angle format (e.g., 29°) - the minimum interior angle
 *
 * The conversion uses the geometric relationship:
 * - `ratio = 1 / sin(angle/2)`
 * - `angle = 2 * asin(1/ratio)`
 *
 * **Examples:**
 * - Ratio 4.0 → Angle ~29° (SVG/CSS default)
 * - Ratio 2.0 → Angle 60°
 * - Ratio 1.414 → Angle 90°
 *
 * Angles smaller than the displayed value will render as beveled corners.
 */
export function StrokeMiterLimitControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (value: number) => void;
}) {
  // Convert ratio (internal) to angle (display) for user
  const displayValue = useMemo(() => {
    if (value === undefined || value === grida.mixed) return value;
    return Math.round(cmath.miter.angle(value));
  }, [value]);

  // Convert angle (user input) back to ratio (internal)
  const handleChange = (angleValue: number) => {
    if (!onValueChange) return;
    const ratio = cmath.miter.ratio(angleValue);
    onValueChange(ratio);
  };

  return (
    <InputPropertyNumber
      mode="fixed"
      type="number"
      placeholder="29"
      min={1}
      max={180}
      value={displayValue}
      onValueChange={handleChange}
    />
  );
}
