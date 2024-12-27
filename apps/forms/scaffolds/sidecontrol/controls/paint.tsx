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
import { PaintChip } from "./utils/paint-chip";
import React, { useCallback } from "react";
import HexValueInput from "./utils/hex";
import { Cross2Icon } from "@radix-ui/react-icons";

const transparent_paint: grida.program.cg.Paint = {
  type: "solid",
  color: { r: 0, g: 0, b: 0, a: 0 },
};

export function PaintControl({
  value,
  onValueChange,
}: {
  value?: grida.program.cg.Paint;
  onValueChange: (value: grida.program.cg.PaintWithoutID | null) => void;
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

  const onAddPaint = () => {
    onValueChange?.({
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
    });
  };

  const onRemovePaint = () => {
    onValueChange?.(null);
  };

  return (
    <Popover>
      {value ? (
        <>
          {value.type === "solid" && (
            <PaintInputContainer>
              <PopoverTrigger>
                <PaintChip paint={value} />
              </PopoverTrigger>
              <HexValueInput
                className="border-none outline-none w-full h-full ps-2 text-xs"
                value={{
                  r: value.color.r,
                  g: value.color.g,
                  b: value.color.b,
                  // ommit the alpha
                }}
                onValueChange={(color) => {
                  onValueChange({
                    type: "solid",
                    color: { ...color, a: value.color.a },
                  });
                }}
              />
              <button
                onClick={onRemovePaint}
                className="px-1 py-1 text-muted-foreground"
              >
                <Cross2Icon />
              </button>
            </PaintInputContainer>
          )}
          {value.type === "linear_gradient" && (
            <PopoverTrigger className="w-full">
              <PaintInputContainer>
                <PaintChip paint={value} />
                <span className="ms-2 text-xs">Linear</span>
              </PaintInputContainer>
            </PopoverTrigger>
          )}
          {value.type === "radial_gradient" && (
            <PopoverTrigger className="w-full">
              <PaintInputContainer>
                <PaintChip paint={value} />
                <span className="ms-2 text-xs">Radial</span>
              </PaintInputContainer>
            </PopoverTrigger>
          )}
        </>
      ) : (
        <PopoverTrigger className="w-full">
          <div
            className={cn(
              "flex items-center border cursor-default",
              WorkbenchUI.inputVariants({
                size: "xs",
                variant: "paint-container",
              })
            )}
            onClick={onAddPaint}
          >
            <PaintChip paint={transparent_paint} />
            <span className="ms-2 text-xs">Add</span>
          </div>
        </PopoverTrigger>
      )}
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

function PaintInputContainer({ children }: React.PropsWithChildren<{}>) {
  return (
    <div
      className={cn(
        "flex items-center border cursor-default",
        WorkbenchUI.inputVariants({
          size: "xs",
          variant: "paint-container",
        })
      )}
    >
      {children}
    </div>
  );
}
