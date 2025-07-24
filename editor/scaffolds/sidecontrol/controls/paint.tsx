import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import cg from "@grida/cg";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GradientControl } from "./gradient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/lib/utils";
import {
  LinearGradientPaintIcon,
  RadialGradientPaintIcon,
  SweepGradientPaintIcon,
  SolidPaintIcon,
} from "./icons/paint-icon";
import { PaintChip } from "./utils/paint-chip";
import React, { useCallback } from "react";
import HexValueInput from "./utils/hex";
import { Cross2Icon } from "@radix-ui/react-icons";
import { ColorPicker } from "./color-picker";
import cmath from "@grida/cmath";
import { Button } from "@/components/ui-editor/button";
import { useSchema } from "../schema";
import { factory, tokens } from "@grida/tokens";
import { useComputed } from "@/grida-canvas-react-renderer-dom/nodes/use-computed";
import { PopoverContentProps } from "@radix-ui/react-popover";

const popover_content_on_pointer_down_outside: PopoverContentProps["onPointerDownOutside"] =
  (e) => {
    // if the target contains 'data-popover-no-close', ignore the event
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("[data-popover-no-close]")
    ) {
      e.preventDefault();
    }
  };

export function PaintControl({
  value,
  onValueChange,
  removable,
  onOpenChange,
}: {
  value?: grida.program.nodes.i.props.PropsPaintValue;
  onValueChange?: (value: ComputedPaint | TokenizedPaint | null) => void;
  onOpenChange?: (open: boolean) => void;
  removable?: boolean;
}) {
  if (tokens.is.tokenized(value)) {
    return (
      <TokenizedPaintControl
        value={value as TokenizedPaint}
        onValueChange={onValueChange}
      />
    );
  } else {
    return (
      <ComputedPaintControl
        value={value as ComputedPaint}
        onValueChange={onValueChange}
        onOpenChange={onOpenChange}
      />
    );
  }
}

type ComputedPaint = cg.Paint;
type TokenizedPaint = grida.program.nodes.i.props.SolidPaintToken;

function ComputedPaintControl({
  value,
  onValueChange,
  removable,
  onOpenChange,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  removable?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const onTypeChange = useCallback(
    (type: cg.Paint["type"]) => {
      const to = type;

      switch (value?.type) {
        case "solid": {
          switch (to) {
            case "linear_gradient":
            case "radial_gradient":
            case "sweep_gradient": {
              onValueChange?.({
                type: to,
                transform: cmath.transform.identity,
                stops: [
                  { offset: 0, color: value.color },
                  {
                    offset: 1,
                    // TODO: darken second color based on the first color
                    color: { r: 255, g: 255, b: 255, a: 1 },
                  },
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
        case "radial_gradient":
        case "sweep_gradient": {
          switch (to) {
            case "solid": {
              onValueChange?.({
                type: "solid",
                color: value.stops[0].color,
              });
              break;
            }
            case "linear_gradient":
            case "radial_gradient":
            case "sweep_gradient": {
              onValueChange?.({
                type: to,
                stops: value.stops,
                transform: cmath.transform.identity,
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
    if (!removable) return;
    onValueChange?.(null);
  };

  return (
    <Popover onOpenChange={onOpenChange}>
      {value ? (
        <>
          {value.type === "solid" && (
            <PaintInputContainer>
              <PopoverTrigger>
                <PaintChip paint={value} className="rounded-sm" />
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
                  onValueChange?.({
                    type: "solid",
                    color: { ...color, a: value.color.a },
                  });
                }}
              />
              {removable && (
                <button
                  onClick={onRemovePaint}
                  className="px-1 py-1 me-0.5 text-muted-foreground"
                >
                  <Cross2Icon className="w-3.5 h-3.5" />
                </button>
              )}
            </PaintInputContainer>
          )}
          {value.type === "linear_gradient" && (
            <PopoverTrigger className="w-full">
              <PaintInputContainer>
                <PaintChip paint={value} />
                <span className="ms-2 text-start text-xs flex-1">Linear</span>
                {removable && (
                  <button
                    onClick={onRemovePaint}
                    className="px-1 py-1 me-0.5 text-muted-foreground"
                  >
                    <Cross2Icon className="w-3.5 h-3.5" />
                  </button>
                )}
              </PaintInputContainer>
            </PopoverTrigger>
          )}
          {value.type === "radial_gradient" && (
            <PopoverTrigger className="w-full">
              <PaintInputContainer>
                <PaintChip paint={value} />
                <span className="ms-2 text-start text-xs flex-1">Radial</span>
                {removable && (
                  <button
                    onClick={onRemovePaint}
                    className="px-1 py-1 me-0.5 text-muted-foreground"
                  >
                    <Cross2Icon className="w-3.5 h-3.5" />
                  </button>
                )}
              </PaintInputContainer>
            </PopoverTrigger>
          )}
          {value.type === "sweep_gradient" && (
            <PopoverTrigger className="w-full">
              <PaintInputContainer>
                <PaintChip paint={value} />
                <span className="ms-2 text-start text-xs flex-1">Sweep</span>
                {removable && (
                  <button
                    onClick={onRemovePaint}
                    className="px-1 py-1 me-0.5 text-muted-foreground"
                  >
                    <Cross2Icon className="w-3.5 h-3.5" />
                  </button>
                )}
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
            <PaintChip paint={cg.paints.transparent} />
            <span className="ms-2 text-xs">Add</span>
          </div>
        </PopoverTrigger>
      )}
      <PopoverContent
        onPointerDownOutside={popover_content_on_pointer_down_outside}
        align="start"
        side="right"
        sideOffset={8}
        className="p-0"
      >
        <Tabs value={value?.type} onValueChange={onTypeChange as any}>
          <TabsList className="m-2">
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
            <TabsTrigger value="sweep_gradient">
              <SweepGradientPaintIcon
                active={value?.type === "sweep_gradient"}
              />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="solid" className="p-0 m-0">
            {value?.type === "solid" && (
              <>
                <ColorPicker
                  color={value.color}
                  onColorChange={(color) => {
                    onValueChange?.({
                      type: "solid",
                      color,
                    });
                  }}
                />
                <ContextVariableColors
                  onSelect={(token) => {
                    onValueChange?.({
                      type: "solid",
                      // @ts-ignore
                      color: token,
                    });
                  }}
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="linear_gradient" className="p-2">
            {value?.type === "linear_gradient" && (
              <GradientControl value={value} onValueChange={onValueChange} />
            )}
          </TabsContent>
          <TabsContent value="radial_gradient" className="p-2">
            {value?.type === "radial_gradient" && (
              <GradientControl value={value} onValueChange={onValueChange} />
            )}
          </TabsContent>
          <TabsContent value="sweep_gradient" className="p-2">
            {value?.type === "sweep_gradient" && (
              <GradientControl value={value} onValueChange={onValueChange} />
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function TokenizedPaintControl({
  value,
  removable,
  onValueChange,
  onOpenChange,
}: {
  value: TokenizedPaint;
  removable?: boolean;
  onValueChange?: (value: TokenizedPaint | null) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const computed = useComputed(
    {
      value,
    },
    true
  );

  const identifier = value.color;

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <PaintInputContainer>
          <PaintChip paint={computed.value as any as ComputedPaint} />
          <span className="text-xs text-muted-foreground ms-2">
            {factory.strfy.stringValueExpression(
              identifier as tokens.PropertyAccessExpression
            )}
          </span>
          {/* {removable && (
          <button
            onClick={onRemovePaint}
            className="px-1 py-1 me-0.5 text-muted-foreground"
          >
            <Cross2Icon className="w-3.5 h-3.5" />
          </button>
        )} */}
        </PaintInputContainer>
      </PopoverTrigger>
      <PopoverContent
        onPointerDownOutside={popover_content_on_pointer_down_outside}
      >
        <ContextVariableColors
          onSelect={(token) => {
            onValueChange?.({
              type: "solid",
              color: token,
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ContextVariableColors({
  onSelect,
}: {
  onSelect?: (token: tokens.PropertyAccessExpression) => void;
}) {
  const schema = useSchema();
  const colors = Object.entries(schema?.properties ?? {}).filter(
    ([key, def]) => {
      return def.type === "rgba";
    }
  );

  return (
    <div className="space-y-1">
      {colors.map(([key, def]) => (
        <Button
          key={key}
          variant="ghost"
          size="xs"
          className="flex items-center justify-start gap-1 px-1 py-0.5 w-full"
          onClick={() => {
            const exp = factory.createPropertyAccessExpression(["props", key]);
            onSelect?.(exp);
          }}
        >
          <PaintChip paint={{ type: "solid", color: def.default }} />
          <span className="text-xs">{key}</span>
        </Button>
      ))}
    </div>
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
