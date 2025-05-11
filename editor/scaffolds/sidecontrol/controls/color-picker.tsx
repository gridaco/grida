import React from "react";
import HexValueInput from "./utils/hex";
import { RgbaColorPicker } from "react-colorful";
import { grida } from "@/grida";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { PipetteIcon } from "lucide-react";
import { Button } from "@/components/ui-editor/button";
import { useEyeDropper } from "./utils/eyedropper";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cmath } from "@grida/cmath";
import "./color-picker.css";

interface IDColor {
  id: string;
  color: grida.program.cg.RGBA8888;
}

export function ColorPicker({
  color,
  onColorChange,
  options,
}: {
  color: grida.program.cg.RGBA8888;
  onColorChange?: (color: grida.program.cg.RGBA8888) => void;
  options?: IDColor[];
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
                const rgba = cmath.color.hex_to_rgba8888(result.sRGBHex);
                onColorChange?.(rgba);
              });
            }}
          >
            <PipetteIcon className="size-4" />
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
        {options && (
          <div className="mt-4 flex flex-wrap gap-2">
            {options?.map((option) => (
              <Tooltip key={option.id}>
                <TooltipTrigger>
                  <div
                    className="size-4"
                    onClick={() => onColorChange?.(option.color)}
                  >
                    <div
                      className="w-5 h-5 rounded-xs border"
                      style={{
                        background: `rgba(${option.color.r}, ${option.color.g}, ${option.color.b}, ${option.color.a})`,
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>{option.id}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
