import React from "react";
import HexValueInput from "./utils/hex";
import { RgbaColorPicker as RGB888A32FColorPicker } from "react-colorful";
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
import cmath from "@grida/cmath";
import "./color-picker.css";

type RGB888A32F = cmath.colorformats.RGB888A32F;
type RGBA32F = cmath.colorformats.RGBA32F;

type PickerOption<TColor> = {
  id: string;
  color: TColor;
};

type PickerPanelProps = {
  color: RGB888A32F;
  onColorChange?: (color: RGB888A32F) => void;
  options?: PickerOption<RGB888A32F>[];
  isEyeDropperSupported: boolean;
  onEyeDropperPick: () => void;
};

function ColorPickerBase({
  color,
  onColorChange,
  options,
  isEyeDropperSupported,
  onEyeDropperPick,
}: PickerPanelProps) {
  return (
    <div>
      <div className="cusom">
        <RGB888A32FColorPicker
          color={color}
          className="!w-full"
          onChange={onColorChange}
        />
      </div>

      <div className="p-2">
        <div className="flex items-center gap-2">
          <Button
            title={
              isEyeDropperSupported
                ? "eye dropper"
                : "eye dropper not supported"
            }
            disabled={!isEyeDropperSupported}
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={onEyeDropperPick}
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
                // omit the alpha (handled by slider/picker)
              }}
              onValueChange={(newColor) => {
                onColorChange?.({ ...color, ...newColor });
              }}
            />
          </div>
        </div>
        {options && options.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {options.map((option) => (
              <Tooltip key={option.id}>
                <TooltipTrigger>
                  <div
                    className="size-4"
                    onClick={() => onColorChange?.(option.color)}
                  >
                    <div
                      className="size-5 rounded-xs border"
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

/**
 * @deprecated Use {@link ColorPicker32F} instead.
 */
export function ColorPicker({
  color,
  onColorChange,
  options,
}: {
  color: cmath.colorformats.RGB888A32F;
  onColorChange?: (color: cmath.colorformats.RGB888A32F) => void;
  options?: {
    id: string;
    color: cmath.colorformats.RGB888A32F;
  }[];
}) {
  const { isSupported, open } = useEyeDropper();
  return (
    <div>
      <div className="cusom">
        <RGB888A32FColorPicker
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
                      className="size-5 rounded-xs border"
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

export function ColorPicker32F({
  color,
  onColorChange,
  options,
}: {
  color: RGBA32F;
  onColorChange?: (color: RGBA32F) => void;
  options?: PickerOption<RGBA32F>[];
}) {
  const { isSupported, open } = useEyeDropper();
  const normalizedColor = React.useMemo(
    () => cmath.colorformats.RGBA32F.intoRGB888F32A(color),
    [color]
  );

  const normalizedOptions = React.useMemo(() => {
    if (!options?.length) return undefined;
    return (
      options?.map((option) => ({
        id: option.id,
        color: cmath.colorformats.RGBA32F.intoRGB888F32A(option.color),
      })) ?? undefined
    );
  }, [options]);

  const handlePickerChange = React.useCallback(
    (updated: RGB888A32F) => {
      onColorChange?.(cmath.colorformats.RGB888A32F.intoRGBA32F(updated));
    },
    [onColorChange]
  );

  const handleEyeDropperPick = React.useCallback(() => {
    if (!isSupported) return;
    open()?.then((result) => {
      const rgba = cmath.color.hex_to_rgba8888(result.sRGBHex);
      handlePickerChange(rgba);
    });
  }, [isSupported, open, handlePickerChange]);

  return (
    <ColorPickerBase
      color={normalizedColor}
      onColorChange={handlePickerChange}
      options={normalizedOptions}
      isEyeDropperSupported={isSupported}
      onEyeDropperPick={handleEyeDropperPick}
    />
  );
}
