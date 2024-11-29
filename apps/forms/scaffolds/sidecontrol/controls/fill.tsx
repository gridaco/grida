import { WorkbenchUI } from "@/components/workbench";
import { RGBAColorControl } from "./color";
import { grida } from "@/grida";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GradientControl } from "./gradient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import {
  LinearGradientPaintIcon,
  RadialGradientPaintIcon,
  SolidPaintIcon,
} from "./icons/paint-icon";
import { PaintChip, RGBAChip } from "./utils/paint-chip";
import { useCallback } from "react";

const transparent_paint: grida.program.cg.Paint = {
  type: "solid",
  color: { r: 0, g: 0, b: 0, a: 0 },
};

export function FillControl({
  value,
  onValueChange,
}: {
  value?: grida.program.cg.Paint;
  onValueChange: (value: grida.program.cg.PaintWithoutID) => void;
}) {
  const onTabChange = useCallback(
    (type: grida.program.cg.Paint["type"]) => {
      const to = type;

      switch (value?.type) {
        case "solid": {
          switch (to) {
            case "linear_gradient":
            case "radial_gradient": {
              onValueChange({
                type: to,
                stops: [
                  { offset: 0, color: value.color },
                  { offset: 1, color: value.color },
                ],
              });
              break;
            }
            case "solid": {
              // noop
              break;
            }
          }
          break;
        }
        case "linear_gradient":
        case "radial_gradient": {
          switch (to) {
            case "solid": {
              onValueChange({
                type: "solid",
                color: value.stops[0].color,
              });
              break;
            }
            case "linear_gradient":
            case "radial_gradient": {
              onValueChange({
                type: to,
                stops: value.stops,
              });
              break;
            }
          }
          break;
        }
      }
    },
    [value]
  );

  const onAddFill = () => {
    onValueChange?.({
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
    });
  };

  return (
    <Popover>
      <PopoverTrigger className="w-full">
        {value ? (
          <>
            <div
              className={cn(
                "flex items-center border cursor-default",
                WorkbenchUI.inputVariants({ size: "sm" })
              )}
            >
              <PaintChip paint={value} />
              {value.type === "solid" && (
                <span className="ms-2 text-xs">
                  {grida.program.css.rgbaToHex(value.color)}
                </span>
              )}
              {value.type === "linear_gradient" && (
                <span className="ms-2 text-xs">Linear</span>
              )}
              {value.type === "radial_gradient" && (
                <span className="ms-2 text-xs">Radial</span>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "flex items-center border cursor-default",
                WorkbenchUI.inputVariants({ size: "sm" })
              )}
              onClick={onAddFill}
            >
              <PaintChip paint={transparent_paint} />
              <span className="ms-2 text-xs">Add</span>
            </div>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <Tabs value={value?.type} onValueChange={onTabChange as any}>
          <TabsList>
            <TabsTrigger value="solid">
              <SolidPaintIcon active={value?.type === "solid"} />
            </TabsTrigger>
            <TabsTrigger value="linear_gradient">
              <LinearGradientPaintIcon
                active={value?.type === "linear_gradient"}
              />
            </TabsTrigger>
            <TabsTrigger value="radial_gradient">
              <RadialGradientPaintIcon
                active={value?.type === "radial_gradient"}
              />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="solid">
            {value?.type === "solid" && (
              <RGBAColorControl
                value={value.color}
                onValueChange={(color) => {
                  onValueChange({ type: "solid", color: color });
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="linear_gradient">
            {value?.type === "linear_gradient" && (
              <GradientControl value={value} onValueChange={onValueChange} />
            )}
          </TabsContent>
          <TabsContent value="radial_gradient">
            {value?.type === "radial_gradient" && (
              <GradientControl value={value} onValueChange={onValueChange} />
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
