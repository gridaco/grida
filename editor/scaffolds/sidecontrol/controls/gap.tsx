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
const twgap = {
  "gap-0": {
    gap: 0,
  },
  "gap-1": {
    gap: 1 * 4, // 4px
  },
  "gap-2": {
    gap: 2 * 4, // 8px
  },
  "gap-3": {
    gap: 3 * 4, // 12px
  },
  "gap-4": {
    gap: 4 * 4, // 16px
  },
  "gap-5": {
    gap: 5 * 4, // 20px
  },
  "gap-6": {
    gap: 6 * 4, // 24px
  },
  "gap-8": {
    gap: 8 * 4, // 32px
  },
  "gap-10": {
    gap: 10 * 4, // 40px
  },
  "gap-12": {
    gap: 12 * 4, // 48px
  },
  "gap-16": {
    gap: 16 * 4, // 64px
  },
  "gap-20": {
    gap: 20 * 4, // 80px
  },
  "gap-24": {
    gap: 24 * 4, // 96px
  },
  "gap-32": {
    gap: 32 * 4, // 128px
  },
  "gap-40": {
    gap: 40 * 4, // 160px
  },
  "gap-48": {
    gap: 48 * 4, // 192px
  },
  "gap-56": {
    gap: 56 * 4, // 224px
  },
  "gap-64": {
    gap: 64 * 4, // 256px
  },
  "gap-72": {
    gap: 72 * 4, // 288px
  },
  "gap-80": {
    gap: 80 * 4, // 320px
  },
  "gap-96": {
    gap: 96 * 4, // 384px
  },
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
  const hasPreset = useMemo(() => {
    if (isMixed) return false;
    return typeof value === "number" && Object.values(twgap).some((preset) => preset.gap === value);
  }, [value, isMixed]);

  const handleChange = (newValue: number | undefined) => {
    if (newValue === undefined) return;
    onValueCommit?.(newValue);
  };

  return (
    <div className="relative flex-1">
      <InputPropertyNumber
        mode="fixed"
        disabled={disabled}
        type="number"
        value={isMixed ? undefined : value}
        placeholder={isMixed ? "mixed" : "0"}
        step={1}
        min={0}
        className={cn(
          WorkbenchUI.inputVariants({ size: "xs" }),
          "overflow-hidden",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
        onValueCommit={handleChange}
        aria-label="Gap"
      />
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
        <Select
          value={!isMixed && hasPreset && typeof value === "number" ? String(value) : undefined}
          onValueChange={(_v) => {
            const value = parseInt(_v);
            handleChange(value);
          }}
        >
          <SelectPrimitive.SelectTrigger asChild>
            <button className="w-full text-muted-foreground flex items-center justify-center size-6 p-1 opacity-50">
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
  value: { main_axis_gap: TMixed<number>; cross_axis_gap?: TMixed<number> };
  disabled?: boolean;
  onValueCommit?: (value: {
    main_axis_gap: number;
    cross_axis_gap: number;
  }) => void;
}) {
  const isMainAxisMixed = value.main_axis_gap === grida.mixed;
  const isCrossAxisMixed = value.cross_axis_gap === grida.mixed;
  const mainAxisGap = isMainAxisMixed ? undefined : (value.main_axis_gap ?? 0);
  const crossAxisGap = isCrossAxisMixed ? undefined : value.cross_axis_gap;

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
            main_axis_gap: v ?? 0,
            cross_axis_gap: typeof crossAxisGap === "number" ? crossAxisGap : v ?? 0,
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
            main_axis_gap: typeof mainAxisGap === "number" ? mainAxisGap : 0,
            cross_axis_gap: v ?? 0,
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
  value: { main_axis_gap: TMixed<number>; cross_axis_gap?: TMixed<number> };
  mode?: "single" | "multiple";
  disabled?: boolean;
  onValueCommit?: (
    value: number | { main_axis_gap: number; cross_axis_gap: number }
  ) => void;
}) {
  const mainAxisGap = value.main_axis_gap === grida.mixed ? grida.mixed : (value.main_axis_gap ?? 0);

  if (mode === "multiple") {
    return (
      <GapControlMultiple
        value={value}
        disabled={disabled}
        onValueCommit={(v) => onValueCommit?.(v)}
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
