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
} from "@radix-ui/react-icons";
import grida from "@grida/schema";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";

function isUniform(value: grida.program.nodes.i.IRectangularCornerRadius) {
  const _tl = value.cornerRadiusTopLeft;
  const is_all_4_uniform =
    _tl === value.cornerRadiusTopRight &&
    _tl === value.cornerRadiusBottomRight &&
    _tl === value.cornerRadiusBottomLeft;

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
    return value.cornerRadiusTopLeft; // asserted uniform, use top left
  }, [value]);

  const cornerValues = useMemo(() => {
    return [
      value?.cornerRadiusTopLeft ?? 0,
      value?.cornerRadiusTopRight ?? 0,
      value?.cornerRadiusBottomRight ?? 0,
      value?.cornerRadiusBottomLeft ?? 0,
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

  return (
    <div className="flex flex-col gap-2">
      {/* First Row: Uniform Input + Toggle Button */}
      <div className="flex items-center gap-2">
        <InputPropertyNumber
          mode="fixed"
          disabled={disabled}
          type="number"
          value={mode === "all" ? uniformValue : undefined}
          placeholder={placeholder}
          min={0}
          step={1}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "flex-1")}
          onValueCommit={handleUniformChange}
          aria-label="Corner radius all corners"
        />
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
