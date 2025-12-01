import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import cg from "@grida/cg";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GradientControl } from "./paint-gradient";
import { ImagePaintControl } from "./paint-image";
import { BlendModeDropdown } from "./blend-mode";
import { PropertyEnum } from "../ui";
import { ArrowRightLeftIcon, RotateCwIcon } from "lucide-react";
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
  ImagePaintIcon,
} from "./icons/paint-icon";
import { PaintChip } from "./utils/paint-chip";
import React, { useCallback } from "react";
import RGBHexInput from "./utils/hex";
import { ColorPicker } from "./color-picker";
import cmath from "@grida/cmath";
import { Button } from "@/components/ui-editor/button";
import { useSchema } from "../schema";
import { factory, tokens } from "@grida/tokens";
import { useComputed } from "@/grida-canvas-react-renderer-dom/nodes/use-computed";
import { useNumberInput } from "@grida/number-input/react";
import { Separator } from "@/components/ui/separator";

const paint_label = {
  solid: "solid",
  linear_gradient: "linear",
  radial_gradient: "radial",
  sweep_gradient: "sweep",
  diamond_gradient: "diamond",
  image: "image",
} as const;

const DEFAULT_GRADIENT_TYPE = "linear_gradient" as const;

const gradient_types = [
  { value: "linear_gradient" as const, label: "Linear" },
  { value: "radial_gradient" as const, label: "Radial" },
  { value: "sweep_gradient" as const, label: "Sweep" },
  { value: "diamond_gradient" as const, label: "Diamond" },
];

const DEFAULT_IMAGE_PAINT: cg.ImagePaint = {
  type: "image",
  src: "system://images/checker-16-strip-L98L92.png",
  fit: "cover",
  transform: cmath.transform.identity,
  filters: cg.def.IMAGE_FILTERS,
  blendMode: cg.def.BLENDMODE,
  opacity: 1,
  active: true,
};

function getNextPaintForType(
  current: cg.Paint | undefined,
  next: cg.Paint["type"] | "image"
): cg.Paint | null {
  const to = next;

  const blendMode =
    (current && "blendMode" in current ? current.blendMode : undefined) ??
    cg.def.BLENDMODE;

  const transform =
    (current && "transform" in current ? current.transform : undefined) ??
    cmath.transform.identity;

  // Extract current opacity value
  const opacity = current
    ? current.type === "solid"
      ? current.color.a
      : (current as any).opacity || 1
    : 1;

  switch (current?.type) {
    case "solid": {
      switch (to) {
        case "linear_gradient":
        case "radial_gradient":
        case "sweep_gradient":
        case "diamond_gradient": {
          return {
            type: to,
            transform,
            stops: [
              { offset: 0, color: current.color },
              {
                offset: 1,
                // TODO: darken second color based on the first color
                color: { r: 255, g: 255, b: 255, a: 1 },
              },
            ],
            blendMode: blendMode,
            opacity: opacity,
          } as cg.Paint;
        }
        case "solid": {
          return current; // noop
        }
        case "image": {
          return {
            ...DEFAULT_IMAGE_PAINT,
            blendMode,
            opacity: opacity,
          };
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
          return {
            type: "solid",
            color: {
              ...current.stops[0].color,
              a: opacity,
            },
            blendMode,
            active: true,
          };
        }
        case "linear_gradient":
        case "radial_gradient":
        case "sweep_gradient":
        case "diamond_gradient": {
          return {
            type: to,
            stops: current.stops,
            transform,
            blendMode,
            opacity: current.opacity || 1,
          } as cg.Paint;
        }
        case "image": {
          return {
            ...DEFAULT_IMAGE_PAINT,
            blendMode,
            opacity: opacity,
          };
        }
      }
      break;
    }
    case "image": {
      switch (to) {
        case "solid": {
          return {
            type: "solid",
            color: { r: 128, g: 128, b: 128, a: opacity }, // Default gray with preserved opacity
            blendMode,
            active: true,
          };
        }
        case "linear_gradient":
        case "radial_gradient":
        case "sweep_gradient":
        case "diamond_gradient": {
          return {
            type: to,
            transform,
            stops: [
              { offset: 0, color: { r: 128, g: 128, b: 128, a: 1 } },
              { offset: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
            ],
            blendMode,
            opacity: opacity,
          } as cg.Paint;
        }
        case "image": {
          return current; // noop
        }
      }
      break;
    }
  }

  return null;
}

export interface PaintControlProps {
  value?: grida.program.nodes.i.props.PropsPaintValue;
  onValueChange?: (value: ComputedPaint | TokenizedPaint | null) => void;
  /**
   * called when user explicitly adds a new paint via the UI
   */
  onValueAdd?: (value: ComputedPaint | TokenizedPaint) => void;
  onOpenChange?: (open: boolean) => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
  open?: boolean;
}

export function PaintControl({
  value,
  onValueChange,
  onValueAdd,
  selectedGradientStop,
  onOpenChange,
  onSelectedGradientStopChange,
  open,
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
        onOpenChange={onOpenChange}
        selectedGradientStop={selectedGradientStop}
        onSelectedGradientStopChange={onSelectedGradientStopChange}
        open={open}
      />
    );
  }
}

type ComputedPaint = cg.Paint | cg.ImagePaint;
type TokenizedPaint = grida.program.nodes.i.props.SolidPaintToken;

function ComputedPaintControl({
  value,
  onValueChange,
  onValueAdd,
  onOpenChange,
  selectedGradientStop,
  onSelectedGradientStopChange,
  open,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  onValueAdd?: (value: ComputedPaint) => void;
  onOpenChange?: (open: boolean) => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
  open?: boolean;
}) {
  const onTypeChange = useCallback(
    (type: cg.Paint["type"] | "image" | "gradient") => {
      // Convert UI abstraction "gradient" to actual gradient type
      const actualType = type === "gradient" ? DEFAULT_GRADIENT_TYPE : type;
      const newPaint = getNextPaintForType(value, actualType);
      onValueChange?.(newPaint);
    },
    [value, onValueChange]
  );

  const onAddPaint = () => {
    const paint: ComputedPaint = {
      type: "solid",
      color: { r: 0, g: 0, b: 0, a: 1 },
      active: true,
    };
    if (onValueAdd) {
      onValueAdd(paint);
    } else {
      onValueChange?.(paint);
    }
  };

  return (
    <Popover modal={false} open={open} onOpenChange={onOpenChange}>
      {!value ? (
        <NewPaintTrigger onAddPaint={onAddPaint} />
      ) : (
        <PaintTrigger value={value} onValueChange={onValueChange} />
      )}
      <PaintPopoverContent
        value={value}
        onValueChange={onValueChange}
        onTypeChange={onTypeChange}
        selectedGradientStop={selectedGradientStop}
        onSelectedGradientStopChange={onSelectedGradientStopChange}
      />
    </Popover>
  );
}

function TokenizedPaintControl({
  value,
  onValueChange,
  onOpenChange,
}: {
  value: TokenizedPaint;
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
    <Popover modal={false} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <PaintInputContainer>
          <PaintChip paint={computed.value as any as ComputedPaint} />
          <span className="text-xs text-muted-foreground ms-2">
            {factory.strfy.stringValueExpression(
              identifier as tokens.PropertyAccessExpression
            )}
          </span>
        </PaintInputContainer>
      </PopoverTrigger>
      <PopoverContent
        onPointerDown={(e) =>
          // prevent popover content from causing dnd
          e.stopPropagation()
        }
      >
        <ContextVariableColors
          onSelect={(token) => {
            onValueChange?.({
              type: "solid",
              color: token,
              active: true,
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
          <PaintChip
            paint={{ type: "solid", color: def.default, active: true }}
          />
          <span className="text-xs">{key}</span>
        </Button>
      ))}
    </div>
  );
}

function NewPaintTrigger({ onAddPaint }: { onAddPaint: () => void }) {
  return (
    <PopoverTrigger className="w-full">
      <PaintInputContainer onClick={onAddPaint}>
        <PaintChip paint={cg.paints.transparent} className="rounded-sm" />
        <span className="ms-2 text-xs">Add</span>
      </PaintInputContainer>
    </PopoverTrigger>
  );
}

function PaintTrigger({
  value,
  onValueChange,
}: {
  value: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
}) {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleInputFocus = React.useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleInputBlur = React.useCallback(() => {
    setIsFocused(false);
  }, []);

  if (value.type === "solid") {
    return (
      <SolidPaintTrigger
        value={value}
        isFocused={isFocused}
        onValueChange={onValueChange}
        onInputFocus={handleInputFocus}
        onInputBlur={handleInputBlur}
      />
    );
  }

  if (isGradientPaint(value)) {
    return (
      <GradientPaintTrigger
        value={value}
        isFocused={isFocused}
        onInputFocus={handleInputFocus}
        onInputBlur={handleInputBlur}
        onValueChange={onValueChange}
      />
    );
  }

  if (value.type === "image") {
    return (
      <ImagePaintTrigger
        value={value}
        isFocused={isFocused}
        onInputFocus={handleInputFocus}
        onInputBlur={handleInputBlur}
        onValueChange={onValueChange}
      />
    );
  }

  return null;
}

function InlineOpacityControl({
  value,
  onValueCommit,
  onFocus,
  onBlur,
}: {
  value?: number;
  onValueCommit?: (value: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const {
    internalValue,
    inputType,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleChange,
    inputRef,
  } = useNumberInput({
    type: "number",
    value,
    step: 0.01,
    autoSelect: true,
    min: 0,
    max: 1,
    mode: "fixed",
    onValueCommit,
    commitOnBlur: true,
    suffix: "%",
    scale: 100,
  });

  return (
    <input
      ref={inputRef}
      type={inputType}
      placeholder="<opacity>"
      value={internalValue}
      onChange={handleChange}
      onFocus={(e) => {
        handleFocus(e, onFocus);
      }}
      onBlur={(e) => {
        handleBlur(e, onBlur);
      }}
      onKeyDown={handleKeyDown}
      className="
        w-12 appearance-none ps-1.5
        placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
        bg-transparent outline-none
      "
    />
  );
}

function SolidPaintTrigger({
  value,
  isFocused,
  onValueChange,
  onInputFocus,
  onInputBlur,
}: {
  value: cg.SolidPaint;
  isFocused: boolean;
  onValueChange?: (value: ComputedPaint | null) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
}) {
  return (
    <PaintInputContainer isFocused={isFocused} tabIndex={-1}>
      <PopoverTrigger className="flex-shrink-0">
        <PaintChip paint={value} className="rounded-sm" />
      </PopoverTrigger>
      <RGBHexInput
        className="flex-1 px-1.5"
        value={{
          r: value.color.r,
          g: value.color.g,
          b: value.color.b,
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onValueChange={(color) => {
          onValueChange?.({
            ...value,
            type: "solid",
            color: { ...color, a: value.color.a },
            active: true,
          });
        }}
      />
      <Separator orientation="vertical" />
      <InlineOpacityControl
        value={value.color.a}
        onValueCommit={(opacity) => {
          onValueChange?.({
            ...value,
            type: "solid",
            color: { ...value.color, a: opacity },
            active: true,
          });
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
      />
    </PaintInputContainer>
  );
}

function GradientPaintTrigger({
  value,
  isFocused,
  onInputFocus,
  onInputBlur,
  onValueChange,
}: {
  value:
    | cg.LinearGradientPaint
    | cg.RadialGradientPaint
    | cg.SweepGradientPaint
    | cg.DiamondGradientPaint;
  isFocused: boolean;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onValueChange?: (value: ComputedPaint | null) => void;
}) {
  return (
    <PaintInputContainer isFocused={isFocused}>
      <PopoverTrigger className="flex flex-1 items-center">
        <PaintChip paint={value} className="rounded-sm" />
        <span className="ms-2 text-start text-xs capitalize">
          {paint_label[value.type]}
        </span>
      </PopoverTrigger>
      <Separator orientation="vertical" />
      <InlineOpacityControl
        value={value.opacity || 1}
        onValueCommit={(opacity) => {
          onValueChange?.({
            ...value,
            opacity: opacity,
          });
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
      />
    </PaintInputContainer>
  );
}

function ImagePaintTrigger({
  value,
  isFocused,
  onInputFocus,
  onInputBlur,
  onValueChange,
}: {
  value: cg.ImagePaint;
  isFocused: boolean;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onValueChange?: (value: ComputedPaint | null) => void;
}) {
  return (
    <PaintInputContainer isFocused={isFocused}>
      <PopoverTrigger className="flex flex-1 items-center">
        <PaintChip paint={value} className="rounded-sm" />
        <span className="ms-2 text-start text-xs capitalize">
          {paint_label[value.type]}
        </span>
      </PopoverTrigger>
      <Separator orientation="vertical" />
      <InlineOpacityControl
        value={value.opacity || 1}
        onValueCommit={(opacity) => {
          onValueChange?.({
            ...value,
            opacity: opacity,
          });
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
      />
    </PaintInputContainer>
  );
}

function PaintPopoverContent({
  value,
  onValueChange,
  onTypeChange,
  selectedGradientStop,
  onSelectedGradientStopChange,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  onTypeChange: (type: cg.Paint["type"] | "image" | "gradient") => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
}) {
  return (
    <PopoverContent
      align="start"
      side="right"
      sideOffset={8}
      className="p-0"
      onPointerDown={(e) =>
        // prevent popover content from causing dnd
        e.stopPropagation()
      }
    >
      <Tabs
        value={
          value?.type === "linear_gradient" ||
          value?.type === "radial_gradient" ||
          value?.type === "sweep_gradient" ||
          value?.type === "diamond_gradient"
            ? "gradient"
            : value?.type
        }
        onValueChange={onTypeChange as any}
      >
        <PaintTabsHeader value={value} onValueChange={onValueChange} />
        <PaintTabsContent
          value={value}
          onValueChange={onValueChange}
          selectedGradientStop={selectedGradientStop}
          onSelectedGradientStopChange={onSelectedGradientStopChange}
        />
      </Tabs>
    </PopoverContent>
  );
}

function PaintTabsHeader({
  value,
  onValueChange,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
}) {
  return (
    <div className="flex items-center justify-between m-2">
      <TabsList>
        <TabsTrigger value="solid">
          <SolidPaintIcon active={value?.type === "solid"} />
        </TabsTrigger>
        <TabsTrigger value="gradient">
          <GradientIcon
            value={value}
            isGradientActive={isGradientPaint(value)}
          />
        </TabsTrigger>
        <TabsTrigger value="image">
          <ImagePaintIcon active={value?.type === "image"} />
        </TabsTrigger>
      </TabsList>
      <div className="flex items-center">
        <BlendModeDropdown
          type="paint"
          value={value?.blendMode || cg.def.BLENDMODE}
          onValueChange={(blendMode) => {
            if (value) {
              onValueChange?.({
                ...value,
                blendMode,
              } as any);
            }
          }}
        />
      </div>
    </div>
  );
}

function GradientIcon({
  value,
  isGradientActive,
}: {
  value?: ComputedPaint;
  isGradientActive: boolean;
}) {
  switch (value?.type) {
    case "radial_gradient":
      return <RadialGradientPaintIcon active={isGradientActive} />;
    case "sweep_gradient":
      return <SweepGradientPaintIcon active={isGradientActive} />;
    case "diamond_gradient":
      return <DiamondGradientPaintIcon active={isGradientActive} />;
    default:
      return <LinearGradientPaintIcon active={isGradientActive} />;
  }
}

function PaintTabsContent({
  value,
  onValueChange,
  selectedGradientStop,
  onSelectedGradientStopChange,
}: {
  value?: ComputedPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
}) {
  if (value?.type === "solid") {
    return (
      <div>
        <ColorPicker
          color={value.color}
          onColorChange={(color) => {
            onValueChange?.({
              ...value,
              type: "solid",
              color,
              active: true,
            });
          }}
        />
        <ContextVariableColors
          onSelect={(token) => {
            onValueChange?.({
              ...value,
              type: "solid",
              // @ts-ignore
              color: token,
              active: true,
            });
          }}
        />
      </div>
    );
  }

  if (isGradientPaint(value)) {
    return (
      <div className="p-2 space-y-4">
        <GradientControls
          value={value}
          onValueChange={onValueChange}
          selectedGradientStop={selectedGradientStop}
          onSelectedGradientStopChange={onSelectedGradientStopChange}
        />
      </div>
    );
  }

  if (value?.type === "image") {
    return (
      <div className="p-2">
        <ImagePaintControl value={value} onValueChange={onValueChange} />
      </div>
    );
  }

  return null;
}

function GradientControls({
  value,
  onValueChange,
  selectedGradientStop,
  onSelectedGradientStopChange,
}: {
  value:
    | cg.LinearGradientPaint
    | cg.RadialGradientPaint
    | cg.SweepGradientPaint
    | cg.DiamondGradientPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
  selectedGradientStop?: number;
  onSelectedGradientStopChange?: (stop: number) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <PropertyEnum<cg.Paint["type"]>
          enum={gradient_types}
          value={value.type}
          onValueChange={(gradientType) => {
            onValueChange?.({
              ...value,
              type: gradientType,
            } as any);
          }}
          className="w-24"
        />
        <GradientActions value={value} onValueChange={onValueChange} />
      </div>
      <GradientControl
        value={value}
        onValueChange={onValueChange}
        selectedStop={selectedGradientStop}
        onSelectedStopChange={onSelectedGradientStopChange}
      />
    </>
  );
}

function GradientActions({
  value,
  onValueChange,
}: {
  value:
    | cg.LinearGradientPaint
    | cg.RadialGradientPaint
    | cg.SweepGradientPaint
    | cg.DiamondGradientPaint;
  onValueChange?: (value: ComputedPaint | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={() => {
          const flippedStops = value.stops
            .map((stop: any, index: number) => ({
              ...stop,
              offset: 1 - stop.offset,
            }))
            .reverse();
          onValueChange?.({ ...value, stops: flippedStops });
        }}
        title="Flip"
        variant="ghost"
        size="icon"
      >
        <ArrowRightLeftIcon className="size-3.5" />
      </Button>
      <Button
        onClick={() => {
          const currentAngle = value.transform
            ? cmath.transform.angle(value.transform)
            : 0;
          const newAngle = currentAngle + 45;
          const t =
            cmath.ui.gradient.computeRelativeLinearGradientTransform(newAngle);
          onValueChange?.({
            ...value,
            transform: t,
          });
        }}
        title="Rotate"
        variant="ghost"
        size="icon"
      >
        <RotateCwIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function isGradientPaint(
  value?: ComputedPaint
): value is
  | cg.LinearGradientPaint
  | cg.RadialGradientPaint
  | cg.SweepGradientPaint
  | cg.DiamondGradientPaint {
  return (
    value?.type === "linear_gradient" ||
    value?.type === "radial_gradient" ||
    value?.type === "sweep_gradient" ||
    value?.type === "diamond_gradient"
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
        "flex items-center border cursor-default w-full",
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
