import React, { useState } from "react";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { AllSidesIcon } from "@radix-ui/react-icons";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";

type Padding = grida.program.nodes.i.IPadding;

export function PaddingControl({
  value,
  onValueCommit,
}: {
  value?: Padding;
  onValueCommit?: (value: Padding) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(false);

  const paddingValues = {
    top: value?.padding_top ?? 0,
    right: value?.padding_right ?? 0,
    bottom: value?.padding_bottom ?? 0,
    left: value?.padding_left ?? 0,
  };

  const { top, right, bottom, left } = paddingValues;
  const uniformValue =
    top === right && right === bottom && bottom === left ? top : undefined;

  const placeholder =
    uniformValue !== undefined
      ? String(uniformValue)
      : [left, top, right, bottom].join(", ");

  const handleUniformChange = (newValue: number | undefined) => {
    if (newValue === undefined) return;
    onValueCommit?.({
      padding_top: newValue,
      padding_right: newValue,
      padding_bottom: newValue,
      padding_left: newValue,
    });
  };

  const handleIndividualChange = (
    side: "top" | "right" | "bottom" | "left",
    newValue: number | undefined
  ) => {
    if (newValue === undefined) return;
    onValueCommit?.({
      padding_top: side === "top" ? newValue : paddingValues.top,
      padding_right: side === "right" ? newValue : paddingValues.right,
      padding_bottom: side === "bottom" ? newValue : paddingValues.bottom,
      padding_left: side === "left" ? newValue : paddingValues.left,
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
          aria-label="Padding all sides"
        />
        <div className="flex gap-1">
          <Toggle
            size="sm"
            variant="outline"
            pressed={showIndividual}
            onPressedChange={setShowIndividual}
            className="bg-transparent border-none shadow-none size-6 min-w-6 px-0 data-[state=on]:*:[svg]:text-workbench-accent-sky"
            aria-label="Toggle individual padding controls"
          >
            <AllSidesIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
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
              aria-label="Padding left"
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
              value={paddingValues.top}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("top", v)}
              aria-label="Padding top"
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
              value={paddingValues.right}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none border-x-0"
              onValueCommit={(v) => handleIndividualChange("right", v)}
              aria-label="Padding right"
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
              value={paddingValues.bottom}
              placeholder="0"
              min={0}
              step={1}
              className="w-full h-7 rounded-none rounded-r-md border-l-0"
              onValueCommit={(v) => handleIndividualChange("bottom", v)}
              aria-label="Padding bottom"
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
