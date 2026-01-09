import React, { useMemo } from "react";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { cn } from "@/components/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui-editor/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import type { TMixed } from "./utils/types";
import grida from "@grida/schema";

/**
 * Tailwind CSS gap preset values.
 *
 * @see https://tailwindcss.com/docs/gap
 */
const GAP_UNIT = 4;
const twgap = {
  "gap-0": { gap: 0 },
  "gap-1": { gap: 1 * GAP_UNIT },
  "gap-2": { gap: 2 * GAP_UNIT },
  "gap-3": { gap: 3 * GAP_UNIT },
  "gap-4": { gap: 4 * GAP_UNIT },
  "gap-5": { gap: 5 * GAP_UNIT },
  "gap-6": { gap: 6 * GAP_UNIT },
  "gap-8": { gap: 8 * GAP_UNIT },
  "gap-10": { gap: 10 * GAP_UNIT },
  "gap-12": { gap: 12 * GAP_UNIT },
  "gap-16": { gap: 16 * GAP_UNIT },
  "gap-20": { gap: 20 * GAP_UNIT },
  "gap-24": { gap: 24 * GAP_UNIT },
  "gap-32": { gap: 32 * GAP_UNIT },
  "gap-40": { gap: 40 * GAP_UNIT },
  "gap-48": { gap: 48 * GAP_UNIT },
  "gap-56": { gap: 56 * GAP_UNIT },
  "gap-64": { gap: 64 * GAP_UNIT },
  "gap-72": { gap: 72 * GAP_UNIT },
  "gap-80": { gap: 80 * GAP_UNIT },
  "gap-96": { gap: 96 * GAP_UNIT },
} as const;

function GapControlSingle({
  value,
  disabled,
  onValueCommit,
}: {
  value: TMixed<number>;
  disabled?: boolean;
  onValueCommit?: (value: number) => void;
}) {
  const isMixed = value === grida.mixed;
  const numericValue = isMixed ? undefined : value;
  const hasPreset = useMemo(() => {
    if (!numericValue || typeof numericValue !== "number") return false;
    return Object.values(twgap).some((preset) => preset.gap === numericValue);
  }, [numericValue]);

  return (
    <div className="relative flex-1">
      <InputPropertyNumber
        mode="fixed"
        disabled={disabled}
        type="number"
        value={numericValue}
        placeholder={isMixed ? "mixed" : "0"}
        step={1}
        min={0}
        className={cn(
          WorkbenchUI.inputVariants({ size: "xs" }),
          "overflow-hidden",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
        onValueCommit={(v) => v !== undefined && onValueCommit?.(v)}
        aria-label="Gap"
      />
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
        <Select
          disabled={disabled}
          value={hasPreset && numericValue ? String(numericValue) : undefined}
          onValueChange={
            disabled ? undefined : (v) => onValueCommit?.(parseInt(v, 10))
          }
        >
          <SelectPrimitive.SelectTrigger asChild>
            <button
              disabled={disabled}
              className={cn(
                "w-full text-muted-foreground flex items-center justify-center size-6 p-1 opacity-50",
                disabled && "cursor-not-allowed opacity-30"
              )}
            >
              <ChevronDownIcon />
            </button>
          </SelectPrimitive.SelectTrigger>
          <SelectContent align="end">
            {Object.entries(twgap).map(([key, preset]) => (
              <SelectItem key={key} value={String(preset.gap)}>
                {preset.gap}{" "}
                <span className="text-muted-foreground text-xs">{key}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function GapControlMultiple({
  value,
  disabled,
  onValueCommit,
}: {
  value: {
    layout_main_axis_gap: TMixed<number>;
    layout_cross_axis_gap?: TMixed<number>;
  };
  disabled?: boolean;
  onValueCommit?: (value: {
    layout_main_axis_gap: number;
    layout_cross_axis_gap: number;
  }) => void;
}) {
  const isMainAxisMixed = value.layout_main_axis_gap === grida.mixed;
  const isCrossAxisMixed = value.layout_cross_axis_gap === grida.mixed;
  const mainAxisGap = isMainAxisMixed
    ? undefined
    : (value.layout_main_axis_gap ?? 0);
  const crossAxisGap = isCrossAxisMixed
    ? undefined
    : value.layout_cross_axis_gap;

  return (
    <div className="flex gap-2 w-full">
      <InputPropertyNumber
        mode="fixed"
        type="number"
        disabled={disabled}
        value={mainAxisGap}
        placeholder={isMainAxisMixed ? "mixed" : "0"}
        step={1}
        min={0}
        onValueCommit={(v) =>
          onValueCommit?.({
            layout_main_axis_gap: v ?? 0,
            layout_cross_axis_gap:
              typeof crossAxisGap === "number" ? crossAxisGap : (v ?? 0),
          })
        }
      />
      <InputPropertyNumber
        mode="fixed"
        type="number"
        disabled={disabled}
        value={crossAxisGap}
        placeholder={
          isCrossAxisMixed
            ? "mixed"
            : typeof mainAxisGap === "number"
              ? String(mainAxisGap)
              : "0"
        }
        step={1}
        min={0}
        onValueCommit={(v) =>
          onValueCommit?.({
            layout_main_axis_gap:
              typeof mainAxisGap === "number" ? mainAxisGap : 0,
            layout_cross_axis_gap: v ?? 0,
          })
        }
      />
    </div>
  );
}

export function GapControl({
  value,
  mode = "single",
  disabled,
  onValueCommit,
}: {
  value: {
    layout_main_axis_gap: TMixed<number>;
    layout_cross_axis_gap?: TMixed<number>;
  };
  mode?: "single" | "multiple";
  disabled?: boolean;
  onValueCommit?: (
    value:
      | number
      | { layout_main_axis_gap: number; layout_cross_axis_gap: number }
  ) => void;
}) {
  const mainAxisGap =
    value.layout_main_axis_gap === grida.mixed
      ? grida.mixed
      : (value.layout_main_axis_gap ?? 0);

  if (mode === "multiple") {
    return (
      <GapControlMultiple
        value={value}
        disabled={disabled}
        onValueCommit={onValueCommit}
      />
    );
  }

  return (
    <GapControlSingle
      value={mainAxisGap}
      disabled={disabled}
      onValueCommit={(v) => onValueCommit?.(v)}
    />
  );
}
