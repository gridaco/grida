import React from "react";
import RGBHexInput from "./utils/hex";
import { RgbaColorPicker } from "react-colorful";
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
import kolor from "@grida/color";
import "./color-picker.css";

type RGBA32F = kolor.colorformats.RGBA32F;

type PickerOption = {
  id: string;
  color: RGBA32F;
};

export function ColorPicker32F({
  color,
  onColorChange,
  options,
}: {
  color: RGBA32F;
  onColorChange?: (color: RGBA32F) => void;
  options?: PickerOption[];
}) {
  const { isSupported, open } = useEyeDropper();

  // Convert RGBA32F to RGB888A32F for react-colorful (expects 0-255 for RGB, 0-1 for alpha)
  const pickerColor = React.useMemo(() => {
    return kolor.colorformats.RGBA32F.intoRGB888F32A(color);
  }, [color]);

  const handlePickerChange = React.useCallback(
    (newColor: { r: number; g: number; b: number; a: number }) => {
      // Convert back from RGB888A32F to RGBA32F
      const rgb888a32f = kolor.colorformats.newRGB888A32F(
        newColor.r,
        newColor.g,
        newColor.b,
        newColor.a
      );
      onColorChange?.(kolor.colorformats.RGB888A32F.intoRGBA32F(rgb888a32f));
    },
    [onColorChange]
  );

  const handleEyeDropperPick = React.useCallback(() => {
    if (!isSupported) return;
    open()?.then((result) => {
      const rgba32f = kolor.colorformats.RGBA32F.fromHEX(result.sRGBHex);
      onColorChange?.(rgba32f);
    });
  }, [isSupported, open, onColorChange]);

  return (
    <div>
      <div className="cusom">
        <RgbaColorPicker
          color={pickerColor}
          className="!w-full"
          onChange={handlePickerChange}
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
            onClick={handleEyeDropperPick}
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
            <RGBHexInput
              className="border-none outline-none w-full h-full ps-2 text-xs"
              unit="f32"
              value={{
                r: color.r,
                g: color.g,
                b: color.b,
                // omit the alpha (handled by slider/picker)
              }}
              onValueChange={(newColor) => {
                onColorChange?.(
                  kolor.colorformats.newRGBA32F(
                    newColor.r,
                    newColor.g,
                    newColor.b,
                    color.a
                  )
                );
              }}
            />
          </div>
        </div>
        {options && options.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {options.map((option) => {
              // Convert RGBA32F to CSS rgba for display
              const cssColor = kolor.colorformats.RGBA32F.intoCSSRGBA(
                option.color
              );
              return (
                <Tooltip key={option.id}>
                  <TooltipTrigger>
                    <div
                      className="size-4"
                      onClick={() => onColorChange?.(option.color)}
                    >
                      <div
                        className="size-5 rounded-xs border"
                        style={{
                          background: cssColor,
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{option.id}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
