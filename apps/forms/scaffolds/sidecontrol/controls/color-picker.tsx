import React, { useCallback, useEffect, useRef, useState } from "react";
import HexValueInput from "./utils/hex";
import { RgbaColorPicker } from "react-colorful";
import { grida } from "@/grida";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { PipetteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEyeDropper } from "./utils/eyedropper";
import "./color-picker.css";

export function ColorPicker({
  color,
  onColorChange,
}: {
  color: grida.program.cg.RGBA8888;
  onColorChange?: (color: grida.program.cg.RGBA8888) => void;
}) {
  const { isSupported, open } = useEyeDropper();
  return (
    <div>
      <div className="cusom">
        <RgbaColorPicker
          color={color}
          className="!w-full"
          onChange={onColorChange}
        />
      </div>

      <div className="p-2">
        <div className="flex items-center gap-2">
          <Button
            title={isSupported ? "eye dropper" : "eye dropper not supported"}
            disabled={!isSupported}
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => {
              open()?.then((result) => {
                const rgba = grida.program.cg.hex_to_rgba8888(result.sRGBHex);
                onColorChange?.(rgba);
              });
            }}
          >
            <PipetteIcon className="w-4 h-4" />
          </Button>
          <div
            className={cn(
              "border cursor-default",
              WorkbenchUI.inputVariants({
                size: "xs",
                variant: "paint-container",
              })
            )}
          >
            <HexValueInput
              className="border-none outline-none w-full h-full ps-2 text-xs"
              value={{
                r: color.r,
                g: color.g,
                b: color.b,
                // ommit the alpha
              }}
              onValueChange={(newcolor) => {
                onColorChange?.({ ...newcolor, a: color.a });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
