import React, { useState, useMemo } from "react";
import type { TMixed } from "./utils/types";
import { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { AllSidesIcon } from "@radix-ui/react-icons";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";

export type EachSideWidth = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type StrokeWidth = number | EachSideWidth;

export function StrokeWidthControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <InputPropertyNumber
      type="number"
      value={value}
      min={0}
      max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
      step={1}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}

export function StrokeWidth4Control({
  value = 1,
  onValueCommit,
}: {
  value: StrokeWidth;
  onValueCommit?: (value: StrokeWidth) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(false);

  // Determine if current value is uniform or individual
  const isUniform = typeof value === "number";

  // Get individual stroke width values
  const strokeValues = useMemo(() => {
    if (typeof value === "number") {
      return {
        top: value,
        right: value,
        bottom: value,
        left: value,
      };
    }
    return {
      top: value.top ?? 0,
      right: value.right ?? 0,
      bottom: value.bottom ?? 0,
      left: value.left ?? 0,
    };
  }, [value]);

  // Get uniform value (if all sides are equal)
  const uniformValue = useMemo(() => {
    if (isUniform) return value as number;
    const { top, right, bottom, left } = strokeValues;
    if (top === right && right === bottom && bottom === left) {
      return top;
    }
    return undefined;
  }, [isUniform, value, strokeValues]);

  const placeholder = useMemo(() => {
    if (isUniform) return String(uniformValue ?? 0);
    return [
      strokeValues.left ?? 0,
      strokeValues.top ?? 0,
      strokeValues.right ?? 0,
      strokeValues.bottom ?? 0,
    ].join(", ");
  }, [isUniform, uniformValue, strokeValues]);

  const handleUniformChange = (newValue: number | undefined) => {
    if (newValue === undefined) return;
    onValueCommit?.(newValue);
  };

  const handleIndividualChange = (
    side: "top" | "right" | "bottom" | "left",
    newValue: number | undefined
  ) => {
    if (newValue === undefined) return;
    const newStrokeValues: EachSideWidth = {
      top: side === "top" ? newValue : strokeValues.top,
      right: side === "right" ? newValue : strokeValues.right,
      bottom: side === "bottom" ? newValue : strokeValues.bottom,
      left: side === "left" ? newValue : strokeValues.left,
    };

    // If all sides are equal, return as uniform value
    if (
      newStrokeValues.top === newStrokeValues.right &&
      newStrokeValues.right === newStrokeValues.bottom &&
      newStrokeValues.bottom === newStrokeValues.left
    ) {
      onValueCommit?.(newStrokeValues.top);
      return;
    }

    onValueCommit?.(newStrokeValues);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* First Row: Uniform Input + Toggle Button */}
      <div className="flex items-center gap-2">
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={uniformValue}
          placeholder={placeholder}
          min={0}
          max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
          step={1}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "flex-1")}
          onValueCommit={handleUniformChange}
          aria-label="Stroke width all sides"
        />
        <div className="flex gap-1">
          <Toggle
            size="sm"
            variant="outline"
            pressed={showIndividual}
            onPressedChange={setShowIndividual}
            className="bg-transparent border-none shadow-none size-6 min-w-6 px-0 data-[state=on]:*:[svg]:text-workbench-accent-sky"
            aria-label="Toggle individual stroke width controls"
          >
            <AllSidesIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </Toggle>
        </div>
      </div>

      {/* Second Row: Individual Stroke Width Controls */}
      {showIndividual && (
        <div className="flex items-center">
          {/* Left */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={strokeValues.left}
              placeholder="0"
              min={0}
              max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
              step={1}
              className="w-full h-7 rounded-none rounded-l-md border-r-0"
              onValueCommit={(v) => handleIndividualChange("left", v)}
              aria-label="Stroke width left"
            />
            <Label>L</Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Top */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={strokeValues.top}
              placeholder="0"
              min={0}
              max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("top", v)}
              aria-label="Stroke width top"
            />
            <Label>T</Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Right */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={strokeValues.right}
              placeholder="0"
              min={0}
              max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("right", v)}
              aria-label="Stroke width right"
            />
            <Label>R</Label>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Bottom */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={strokeValues.bottom}
              placeholder="0"
              min={0}
              max={editor.config.DEFAULT_MAX_STROKE_WIDTH}
              step={1}
              className="w-full h-7 rounded-none rounded-r-md border-l-0"
              onValueCommit={(v) => handleIndividualChange("bottom", v)}
              aria-label="Stroke width bottom"
            />
            <Label>B</Label>
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
