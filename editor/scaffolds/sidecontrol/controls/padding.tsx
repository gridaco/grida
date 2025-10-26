import React, { useState, useMemo } from "react";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { AllSidesIcon } from "@radix-ui/react-icons";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";

type Padding = grida.program.nodes.i.IPadding["padding"];

export function PaddingControl({
  value = 0,
  onValueCommit,
}: {
  value: Padding;
  onValueCommit?: (value: Padding) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(false);

  // Determine if current value is uniform or individual
  const isUniform = typeof value === "number";

  // Get individual padding values
  const paddingValues = useMemo(() => {
    if (typeof value === "number") {
      return {
        top: value,
        right: value,
        bottom: value,
        left: value,
      };
    }
    return {
      top: value.paddingTop ?? 0,
      right: value.paddingRight ?? 0,
      bottom: value.paddingBottom ?? 0,
      left: value.paddingLeft ?? 0,
    };
  }, [value]);

  // Get uniform value (if all sides are equal)
  const uniformValue = useMemo(() => {
    if (isUniform) return value as number;
    const { top, right, bottom, left } = paddingValues;
    if (top === right && right === bottom && bottom === left) {
      return top;
    }
    return undefined;
  }, [isUniform, value, paddingValues]);

  const placeholder = useMemo(() => {
    if (isUniform) return String(uniformValue ?? 0);
    return [
      paddingValues.left ?? 0,
      paddingValues.top ?? 0,
      paddingValues.right ?? 0,
      paddingValues.bottom ?? 0,
    ].join(", ");
  }, [isUniform, uniformValue, paddingValues]);

  const handleUniformChange = (newValue: number | undefined) => {
    if (newValue === undefined) return;
    onValueCommit?.(newValue);
  };

  const handleIndividualChange = (
    side: "top" | "right" | "bottom" | "left",
    newValue: number | undefined
  ) => {
    if (newValue === undefined) return;
    onValueCommit?.({
      paddingTop: side === "top" ? newValue : paddingValues.top,
      paddingRight: side === "right" ? newValue : paddingValues.right,
      paddingBottom: side === "bottom" ? newValue : paddingValues.bottom,
      paddingLeft: side === "left" ? newValue : paddingValues.left,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* First Row: Uniform Input + Toggle Buttons */}
      <div className="flex items-center gap-2">
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={uniformValue}
          placeholder={placeholder}
          min={0}
          step={1}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "flex-1")}
          onValueCommit={handleUniformChange}
        />
        <div className="flex gap-1">
          <Toggle
            size="sm"
            variant="outline"
            pressed={showIndividual}
            onPressedChange={setShowIndividual}
            className="bg-transparent border-none shadow-none size-6 min-w-6 px-0 data-[state=on]:*:[svg]:text-workbench-accent-sky"
          >
            <AllSidesIcon className="size-3.5 text-muted-foreground" />
          </Toggle>
        </div>
      </div>

      {/* Second Row: Individual Padding Controls */}
      {showIndividual && (
        <div className="flex items-center">
          {/* Left */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={paddingValues.left}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none rounded-l-md border-r-0"
              onValueCommit={(v) => handleIndividualChange("left", v)}
            />
            <span className="text-[8px] text-muted-foreground pt-0.5">L</span>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Top */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={paddingValues.top}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("top", v)}
            />
            <span className="text-[8px] text-muted-foreground pt-0.5">T</span>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Right */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={paddingValues.right}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("right", v)}
            />
            <span className="text-[8px] text-muted-foreground pt-0.5">R</span>
          </div>
          {/* Separator */}
          <hr className="w-px h-10" />
          {/* Bottom */}
          <div className="flex flex-col items-center flex-1">
            <InputPropertyNumber
              mode="fixed"
              type="number"
              value={paddingValues.bottom}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none rounded-r-md border-l-0"
              onValueCommit={(v) => handleIndividualChange("bottom", v)}
            />
            <span className="text-[8px] text-muted-foreground pt-0.5">B</span>
          </div>
        </div>
      )}
    </div>
  );
}
