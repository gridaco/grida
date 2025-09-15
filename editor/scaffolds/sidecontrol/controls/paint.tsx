import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import cg from "@grida/cg";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GradientControl } from "./gradient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui-editor/popover";
import { cn } from "@/components/lib/utils";
import {
  LinearGradientPaintIcon,
  RadialGradientPaintIcon,
  SweepGradientPaintIcon,
  SolidPaintIcon,
  DiamondGradientPaintIcon,
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

const paint_label = {
  linear_gradient: "linear",
  radial_gradient: "radial",
  sweep_gradient: "sweep",
  diamond_gradient: "diamond",
} as const;

export interface PaintControlProps {
  value?: grida.program.nodes.i.props.PropsPaintValue;
  onValueChange?: (value: ComputedPaint | TokenizedPaint | null) => void;
  /**
   * called when user explicitly adds a new paint via the UI
   */
  onValueAdd?: (value: ComputedPaint | TokenizedPaint) => void;
  /**
   * called when user removes the paint via the UI
   */
  onValueRemove?: () => void;
  onOpenChange?: (open: boolean) => void;
  selectedGradientStop?: number;
  removable?: boolean;
  onSelectedGradientStopChange?: (stop: number) => void;
}

export function PaintControl({
  value,
  onValueChange,
  onValueAdd,
  onValueRemove,
  removable,
  selectedGradientStop,
  onOpenChange,
  onSelectedGradientStopChange,
}: PaintControlProps) {
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
        onValueAdd={onValueAdd as any}
        onValueRemove={onValueRemove}
        onOpenChange={onOpenChange}
        selectedGradientStop={selectedGradientStop}
        removable={removable}
        onSelectedGradientStopChange={onSelectedGradientStopChange}
      />
    );
  }
}

type ComputedPaint = cg.Paint;
type TokenizedPaint = grida.program.nodes.i.props.SolidPaintToken;

function ComputedPaintControl({
  value,
  onValueChange,
  onValueAdd,
  onValueRemove,
  removable,
  onOpenChange,
  selectedGradientStop,
  onSelectedGradientStopChange,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  onValueAdd?: (value: ComputedPaint) => void;
  onValueRemove?: () => void;
  removable?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
}) {
  const onTypeChange = useCallback(
    (type: cg.Paint["type"]) => {
      const to = type;

      switch (value?.type) {
        case "solid": {
          switch (to) {
            case "linear_gradient":
            case "radial_gradient":
            case "sweep_gradient":
            case "diamond_gradient": {
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
        case "sweep_gradient":
        case "diamond_gradient": {
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
            case "sweep_gradient":
            case "diamond_gradient": {
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
    const paint: ComputedPaint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
    };
    if (onValueAdd) {
      onValueAdd(paint);
    } else {
      onValueChange?.(paint);
    }
  };

  const onRemovePaint = () => {
    if (!removable) return;
    if (onValueRemove) {
      onValueRemove();
    } else {
      onValueChange?.(null);
    }
  };

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  const handleContainerClick = React.useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleContainerPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        inputRef.current?.focus();
      }
    },
    []
  );

  const handleInputFocus = React.useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleInputBlur = React.useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <Popover onOpenChange={onOpenChange}>
      {value ? (
        <>
          {value.type === "solid" && (
            <PaintInputContainer
              isFocused={isFocused}
              onClick={handleContainerClick}
              onPointerDown={handleContainerPointerDown}
              tabIndex={-1}
              className="gap-2 cursor-text"
            >
              <PopoverTrigger className="flex-shrink-0">
                <PaintChip paint={value} className="rounded-sm" />
              </PopoverTrigger>
              <HexValueInput
                ref={inputRef}
                className="flex-1"
                value={{
                  r: value.color.r,
                  g: value.color.g,
                  b: value.color.b,
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
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
                  className="flex-shrink-0 px-1 py-1 me-0.5 text-muted-foreground"
                >
                  <Cross2Icon className="w-3.5 h-3.5" />
                </button>
              )}
            </PaintInputContainer>
          )}
          {(value.type === "linear_gradient" ||
            value.type === "radial_gradient" ||
            value.type === "sweep_gradient" ||
            value.type === "diamond_gradient") && (
            <>
              <PopoverTrigger className="w-full">
                <PaintInputContainer>
                  <PaintChip paint={value} className="rounded-sm" />
                  <span className="ms-2 text-start text-xs flex-1 capitalize">
                    {paint_label[value.type]}
                  </span>
                  {removable && (
                    <span
                      role="button"
                      onClick={onRemovePaint}
                      className="px-1 py-1 me-0.5 text-muted-foreground"
                    >
                      <Cross2Icon className="w-3.5 h-3.5" />
                    </span>
                  )}
                </PaintInputContainer>
              </PopoverTrigger>
            </>
          )}
        </>
      ) : (
        <PopoverTrigger className="w-full">
          <PaintInputContainer onClick={onAddPaint}>
            <PaintChip paint={cg.paints.transparent} className="rounded-sm" />
            <span className="ms-2 text-xs">Add</span>
          </PaintInputContainer>
        </PopoverTrigger>
      )}
      <PopoverContent align="start" side="right" sideOffset={8} className="p-0">
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
            <TabsTrigger value="diamond_gradient">
              <DiamondGradientPaintIcon
                active={value?.type === "diamond_gradient"}
              />
            </TabsTrigger>
          </TabsList>
          <>
            {value?.type === "solid" && (
              <div>
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
              </div>
            )}
          </>
          <>
            {(value?.type === "linear_gradient" ||
              value?.type === "radial_gradient" ||
              value?.type === "sweep_gradient" ||
              value?.type === "diamond_gradient") && (
              <div className="p-2">
                <GradientControl
                  value={value}
                  onValueChange={onValueChange}
                  selectedStop={selectedGradientStop}
                  onSelectedStopChange={onSelectedGradientStopChange}
                />
              </div>
            )}
          </>
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
      <PopoverContent>
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

function PaintInputContainer({
  children,
  isFocused,
  className,
  ...props
}: React.PropsWithChildren<
  React.HTMLAttributes<HTMLDivElement> & { isFocused?: boolean }
>) {
  return (
    <div
      {...props}
      data-focus={isFocused}
      className={cn(
        "flex items-center border cursor-default",
        WorkbenchUI.inputVariants({
          size: "xs",
          variant: "paint-container",
        }),
        className
      )}
    >
      {children}
    </div>
  );
}
