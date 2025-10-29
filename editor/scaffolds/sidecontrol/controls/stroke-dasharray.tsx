import type { TMixed } from "./utils/types";
import { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

export function StrokeDashArrayControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number[] | undefined>;
  onValueChange?: (value: number[] | undefined) => void;
  onValueCommit?: (value: number[] | undefined) => void;
}) {
  // Extract dash (first) and gap (second) values
  const dashValue =
    value && Array.isArray(value) && value.length > 0 ? value[0] : undefined;
  const gapValue =
    value && Array.isArray(value) && value.length > 1 ? value[1] : undefined;

  // When gap is not set, show dash value as placeholder (renderer will use it)
  const gapPlaceholder = dashValue !== undefined ? String(dashValue) : "0";

  const updateArray = (newDash?: number, newGap?: number) => {
    if (newDash === undefined) return undefined;
    if (newGap === undefined) return [newDash];
    return [newDash, newGap];
  };

  const handleDashChange = (change: editor.api.NumberChange) => {
    onValueChange?.(updateArray(change.value, gapValue));
  };

  const handleDashCommit = (change: editor.api.NumberChange) => {
    onValueCommit?.(updateArray(change.value, gapValue));
  };

  const handleGapChange = (change: editor.api.NumberChange) => {
    if (dashValue === undefined) return;
    onValueChange?.(updateArray(dashValue, change.value));
  };

  const handleGapCommit = (change: editor.api.NumberChange) => {
    if (dashValue === undefined) return;
    onValueCommit?.(updateArray(dashValue, change.value));
  };

  return (
    <div className="flex gap-1">
      <InputPropertyNumber
        type="number"
        value={dashValue}
        min={0}
        max={100}
        step={1}
        placeholder="0"
        aria-label="Dash"
        onValueChange={handleDashChange}
        onValueCommit={handleDashCommit}
      />
      <InputPropertyNumber
        type="number"
        value={gapValue}
        min={0}
        max={100}
        step={1}
        placeholder={gapPlaceholder}
        aria-label="Gap"
        onValueChange={handleGapChange}
        onValueCommit={handleGapCommit}
      />
    </div>
  );
}
