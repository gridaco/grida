"use client";

import React, { useState } from "react";
import { FlexAlignControl } from "@/scaffolds/sidecontrol/controls/flex-align";
import { ArrowRight, ArrowDown } from "lucide-react";
import type cg from "@grida/cg";

type MainAxisAlignment = cg.MainAxisAlignment;
type CrossAxisAlignment = cg.CrossAxisAlignment;
type Axis = cg.Axis;

interface FlexAlignValue {
  direction: Axis;
  mainAxisAlignment: MainAxisAlignment;
  crossAxisAlignment: CrossAxisAlignment;
}

export default function FlexAlignControlPage() {
  const [flexAlignValue, setFlexAlignValue] = useState<FlexAlignValue>({
    direction: "horizontal",
    mainAxisAlignment: "start",
    crossAxisAlignment: "start",
  });

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Flex Align Control</h1>
        <p className="text-muted-foreground">
          Interactive 3x3 grid for selecting flex alignment properties
        </p>
      </div>

      <div className="space-y-6">
        {/* Direction Toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Direction</label>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setFlexAlignValue((prev) => ({
                  ...prev,
                  direction: "horizontal",
                }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                flexAlignValue.direction === "horizontal"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              Horizontal
            </button>
            <button
              onClick={() =>
                setFlexAlignValue((prev) => ({
                  ...prev,
                  direction: "vertical",
                }))
              }
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                flexAlignValue.direction === "vertical"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <ArrowDown className="w-4 h-4" />
              Vertical
            </button>
          </div>
        </div>

        {/* Flex Align Control */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Alignment Control</label>
          <div className="w-fit">
            <FlexAlignControl
              direction={flexAlignValue.direction}
              value={{
                mainAxisAlignment: flexAlignValue.mainAxisAlignment,
                crossAxisAlignment: flexAlignValue.crossAxisAlignment,
              }}
              onValueChange={(value) =>
                setFlexAlignValue((prev) => ({
                  ...prev,
                  ...value,
                }))
              }
            />
          </div>
        </div>

        {/* Preview Section */}
        <div className="space-y-4">
          <label className="text-sm font-medium">Preview</label>

          {/* Preview with varying heights */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Children with varying heights
              <span className="ml-2 text-muted-foreground/60">
                • Best for <strong>horizontal (row)</strong> direction
              </span>
            </p>
            <div
              className="border-2 border-dashed border-muted-foreground/20 bg-muted/10 rounded-md p-4 flex gap-3"
              style={{
                width: "300px",
                height: "300px",
                flexDirection:
                  flexAlignValue.direction === "horizontal" ? "row" : "column",
                justifyContent: flexAlignValue.mainAxisAlignment,
                alignItems: flexAlignValue.crossAxisAlignment,
              }}
            >
              <div
                className="bg-blue-500/80 rounded"
                style={{ height: "40px", width: "40px" }}
              />
              <div
                className="bg-green-500/80 rounded"
                style={{ height: "70px", width: "40px" }}
              />
              <div
                className="bg-red-500/80 rounded"
                style={{ height: "25px", width: "40px" }}
              />
            </div>
          </div>

          {/* Preview with varying widths */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Children with varying widths
              <span className="ml-2 text-muted-foreground/60">
                • Best for <strong>vertical (column)</strong> direction
              </span>
            </p>
            <div
              className="border-2 border-dashed border-muted-foreground/20 bg-muted/10 rounded-md p-4 flex gap-3"
              style={{
                width: "300px",
                height: "300px",
                flexDirection:
                  flexAlignValue.direction === "horizontal" ? "row" : "column",
                justifyContent: flexAlignValue.mainAxisAlignment,
                alignItems: flexAlignValue.crossAxisAlignment,
              }}
            >
              <div
                className="bg-blue-500/80 rounded"
                style={{ width: "50px", height: "40px" }}
              />
              <div
                className="bg-green-500/80 rounded"
                style={{ width: "90px", height: "40px" }}
              />
              <div
                className="bg-red-500/80 rounded"
                style={{ width: "30px", height: "40px" }}
              />
            </div>
          </div>
        </div>

        {/* Current Values Display */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Current Values</label>
          <div className="p-4 bg-muted/30 rounded-md space-y-2">
            <div className="text-sm">
              <span className="font-medium">Direction:</span>{" "}
              {flexAlignValue.direction}
            </div>
            <div className="text-sm">
              <span className="font-medium">Main Axis:</span>{" "}
              {flexAlignValue.mainAxisAlignment}
            </div>
            <div className="text-sm">
              <span className="font-medium">Cross Axis:</span>{" "}
              {flexAlignValue.crossAxisAlignment}
            </div>
          </div>
        </div>

        {/* CSS Output */}
        <div className="space-y-2">
          <label className="text-sm font-medium">CSS Output</label>
          <div className="p-4 bg-muted/30 rounded-md">
            <code className="text-sm font-mono">
              {`flex-direction: ${flexAlignValue.direction === "horizontal" ? "row" : "column"};`}
              <br />
              {`justify-content: ${flexAlignValue.mainAxisAlignment};`}
              <br />
              {`align-items: ${flexAlignValue.crossAxisAlignment};`}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
