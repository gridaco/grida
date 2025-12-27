import React, { useState } from "react";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { AllSidesIcon } from "@radix-ui/react-icons";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/components/lib/utils";
import grida from "@grida/schema";
import type { TMixed } from "./utils/types";

type Padding = grida.program.nodes.i.IPadding;

type MixedPadding = {
  padding_top?: TMixed<number>;
  padding_right?: TMixed<number>;
  padding_bottom?: TMixed<number>;
  padding_left?: TMixed<number>;
};

export function PaddingControl({
  value,
  onValueCommit,
}: {
  value?: Padding | MixedPadding;
  onValueCommit?: (value: Padding) => void;
}) {
  const [showIndividual, setShowIndividual] = useState(false);

  const getPaddingValue = (
    prop: "padding_top" | "padding_right" | "padding_bottom" | "padding_left",
    defaultValue: number = 0
  ): TMixed<number> => {
    if (!value) return defaultValue;
    const val = value[prop];
    if (val === grida.mixed) return grida.mixed;
    if (val === undefined) return defaultValue;
    return val;
  };

  const paddingValues = {
    top: getPaddingValue("padding_top"),
    right: getPaddingValue("padding_right"),
    bottom: getPaddingValue("padding_bottom"),
    left: getPaddingValue("padding_left"),
  };

  const { top, right, bottom, left } = paddingValues;
  const isAnyMixed =
    top === grida.mixed ||
    right === grida.mixed ||
    bottom === grida.mixed ||
    left === grida.mixed;

  const uniformValue =
    !isAnyMixed && top === right && right === bottom && bottom === left
      ? typeof top === "number"
        ? top
        : undefined
      : undefined;

  const placeholder =
    uniformValue !== undefined
      ? String(uniformValue)
      : isAnyMixed
        ? "mixed"
        : [
            typeof left === "number" ? left : 0,
            typeof top === "number" ? top : 0,
            typeof right === "number" ? right : 0,
            typeof bottom === "number" ? bottom : 0,
          ].join(", ");

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
    const currentTop =
      side === "top"
        ? newValue
        : typeof paddingValues.top === "number"
          ? paddingValues.top
          : 0;
    const currentRight =
      side === "right"
        ? newValue
        : typeof paddingValues.right === "number"
          ? paddingValues.right
          : 0;
    const currentBottom =
      side === "bottom"
        ? newValue
        : typeof paddingValues.bottom === "number"
          ? paddingValues.bottom
          : 0;
    const currentLeft =
      side === "left"
        ? newValue
        : typeof paddingValues.left === "number"
          ? paddingValues.left
          : 0;
    onValueCommit?.({
      padding_top: currentTop,
      padding_right: currentRight,
      padding_bottom: currentBottom,
      padding_left: currentLeft,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* First Row: Uniform Input + Toggle Buttons */}
      <div className="flex items-center gap-2">
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={isAnyMixed ? undefined : uniformValue}
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
              value={
                paddingValues.left === grida.mixed
                  ? undefined
                  : typeof paddingValues.left === "number"
                    ? paddingValues.left
                    : 0
              }
              placeholder={paddingValues.left === grida.mixed ? "mixed" : "0"}
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
              value={
                paddingValues.top === grida.mixed
                  ? undefined
                  : typeof paddingValues.top === "number"
                    ? paddingValues.top
                    : 0
              }
              placeholder={paddingValues.top === grida.mixed ? "mixed" : "0"}
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
              value={
                paddingValues.right === grida.mixed
                  ? undefined
                  : typeof paddingValues.right === "number"
                    ? paddingValues.right
                    : 0
              }
              placeholder={paddingValues.right === grida.mixed ? "mixed" : "0"}
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
              value={
                paddingValues.bottom === grida.mixed
                  ? undefined
                  : typeof paddingValues.bottom === "number"
                    ? paddingValues.bottom
                    : 0
              }
              placeholder={paddingValues.bottom === grida.mixed ? "mixed" : "0"}
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
