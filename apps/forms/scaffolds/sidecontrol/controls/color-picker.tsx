import React, { useCallback } from "react";
import HexValueInput from "./utils/hex";
import { RgbaColorPicker } from "react-colorful";
import { grida } from "@/grida";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";

export function ColorPicker({
  color,
  onColorChange,
}: {
  color: grida.program.cg.RGBA8888;
  onColorChange?: (color: grida.program.cg.RGBA8888) => void;
}) {
  return (
    <div>
      <RgbaColorPicker
        color={color}
        className="!w-full"
        onChange={onColorChange}
      />
      <div className="p-2">
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
  );
}
