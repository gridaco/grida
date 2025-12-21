import React, { useMemo, useState } from "react";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import cg from "@grida/cg";
import {
  CornerTopLeftIcon,
  CornerTopRightIcon,
  CornerBottomRightIcon,
  CornerBottomLeftIcon,
  CornersIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import grida from "@grida/schema";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui-editor/select";
import * as SelectPrimitive from "@radix-ui/react-select";

/**
 * Tailwind CSS border-radius preset values (uniform shorthands only).
 *
 * @see https://tailwindcss.com/docs/border-radius
 */
const twradius = {
  "rounded-none": {
    "border-radius": 0,
    name: "none",
  },
  "rounded-xs": {
    "border-radius": 2,
    name: "xs",
  },
  "rounded-sm": {
    "border-radius": 4,
    name: "sm",
  },
  "rounded-md": {
    "border-radius": 6,
    name: "md",
  },
  "rounded-lg": {
    "border-radius": 8,
    name: "lg",
  },
  "rounded-xl": {
    "border-radius": 12,
    name: "xl",
  },
  "rounded-2xl": {
    "border-radius": 16,
    name: "2xl",
  },
  "rounded-3xl": {
    "border-radius": 24,
    name: "3xl",
  },
  "rounded-4xl": {
    "border-radius": 32,
    name: "4xl",
  },
} as const;

function isUniform(value: grida.program.nodes.i.IRectangularCornerRadius) {
  const _tl = value.rectangular_corner_radius_top_left;
  const is_all_4_uniform =
    _tl === value.rectangular_corner_radius_top_right &&
    _tl === value.rectangular_corner_radius_bottom_right &&
    _tl === value.rectangular_corner_radius_bottom_left;

  return is_all_4_uniform;
}

export function CornerRadiusControl({
  value = 0,
  disabled,
  onValueCommit,
}: {
  value?: number;
  disabled?: boolean;
  onValueCommit?: (value: cg.CornerRadius) => void;
}) {
  return (
    <div
      className={WorkbenchUI.inputVariants({
        variant: "container",
        size: "xs",
      })}
    >
      <InputPropertyNumber
        mode="fixed"
        disabled={disabled}
        type="number"
        value={value}
        placeholder={"0"}
        min={0}
        step={1}
        onValueCommit={onValueCommit}
      />
    </div>
  );
}

export function CornerRadius4Control({
  disabled,
  value,
  onValueCommit,
}: {
  disabled?: boolean;
  value?: grida.program.nodes.i.IRectangularCornerRadius;
  onValueCommit?: (value: cg.CornerRadius) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(false);

  const mode = useMemo(() => {
    if (!value) return "all";
    return isUniform(value) ? "all" : "each";
  }, [value]);

  const uniformValue = useMemo(() => {
    if (!value) return undefined;
    if (!isUniform(value)) return undefined;
    return value.rectangular_corner_radius_top_left; // asserted uniform, use top left
  }, [value]);

  const cornerValues = useMemo(() => {
    return [
      value?.rectangular_corner_radius_top_left ?? 0,
      value?.rectangular_corner_radius_top_right ?? 0,
      value?.rectangular_corner_radius_bottom_right ?? 0,
      value?.rectangular_corner_radius_bottom_left ?? 0,
    ] as cg.CornerRadius4;
  }, [value]);

  const placeholder = useMemo(() => {
    if (mode === "all") return String(uniformValue ?? 0);
    return cornerValues.join(", ");
  }, [mode, uniformValue, cornerValues]);

  const handleUniformChange = (newValue: number | undefined) => {
    if (newValue === undefined) return;
    onValueCommit?.(newValue);
  };

  const handleIndividualChange = (
    index: number,
    newValue: number | undefined
  ) => {
    if (newValue === undefined) return;
    const newCorners = [...cornerValues];
    newCorners[index] = newValue || 0;

    if (cg.cornerRadius4Identical(newCorners as cg.CornerRadius4)) {
      onValueCommit?.(newCorners[0]);
      return;
    }
    onValueCommit?.(newCorners as cg.CornerRadius4);
  };

  const hasPreset = useMemo(() => {
    if (mode !== "all" || uniformValue === undefined) return false;
    return Object.values(twradius).some(
      (preset) => preset["border-radius"] === uniformValue
    );
  }, [mode, uniformValue]);

  return (
    <div className="flex flex-col gap-2">
      {/* First Row: Uniform Input + Toggle Button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <InputPropertyNumber
            mode="fixed"
            disabled={disabled}
            type="number"
            value={mode === "all" ? uniformValue : undefined}
            placeholder={placeholder}
            min={0}
            step={1}
            className={cn(
              WorkbenchUI.inputVariants({ size: "xs" }),
              "overflow-hidden",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            )}
            onValueCommit={handleUniformChange}
            aria-label="Corner radius all corners"
          />
          {mode === "all" && (
            <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
              <Select
                value={hasPreset ? String(uniformValue) : undefined}
                onValueChange={(_v) => {
                  const value = parseInt(_v);
                  handleUniformChange(value);
                }}
              >
                <SelectPrimitive.SelectTrigger asChild>
                  <button className="w-full text-muted-foreground flex items-center justify-center size-6 p-1 opacity-50">
                    <ChevronDownIcon />
                  </button>
                </SelectPrimitive.SelectTrigger>
                <SelectContent align="end">
                  {Object.entries(twradius).map(([key, value]) => (
                    <SelectItem
                      key={key}
                      value={String(value["border-radius"])}
                    >
                      {value["border-radius"]}{" "}
                      <span className="text-muted-foreground text-xs">
                        {value.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Toggle
            size="sm"
            variant="outline"
            disabled={disabled}
            pressed={showIndividual}
            onPressedChange={setShowIndividual}
            className="bg-transparent border-none shadow-none size-6 min-w-6 px-0 data-[state=on]:*:[svg]:text-workbench-accent-sky"
            aria-label="Toggle individual corner radius controls"
          >
            <CornersIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </Toggle>
        </div>
      </div>

      {/* Second Row: Individual Corner Radius Controls */}
      {showIndividual && (
        <div className="flex items-center">
          {/* Top Left */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              disabled={disabled}
              value={cornerValues[0]}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none rounded-l-md border-r-0"
              onValueCommit={(v) => handleIndividualChange(0, v)}
              aria-label="Corner radius top left"
            />
            <Label>
              <CornerTopLeftIcon className="size-3" />
            </Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Top Right */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              disabled={disabled}
              value={cornerValues[1]}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange(1, v)}
              aria-label="Corner radius top right"
            />
            <Label>
              <CornerTopRightIcon className="size-3" />
            </Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Bottom Right */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              disabled={disabled}
              value={cornerValues[2]}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange(2, v)}
              aria-label="Corner radius bottom right"
            />
            <Label>
              <CornerBottomRightIcon className="size-3" />
            </Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Bottom Left */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              disabled={disabled}
              value={cornerValues[3]}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none rounded-r-md border-l-0"
              onValueCommit={(v) => handleIndividualChange(3, v)}
              aria-label="Corner radius bottom left"
            />
            <Label>
              <CornerBottomLeftIcon className="size-3" />
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

const Label = ({ children }: React.PropsWithChildren) => {
  return (
    <span
      className="text-[8px] text-muted-foreground pt-0.5"
      aria-hidden="true"
    >
      {children}
    </span>
  );
};
