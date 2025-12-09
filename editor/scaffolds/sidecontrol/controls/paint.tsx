import { WorkbenchUI } from "@/components/workbench";
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
import { ColorPicker32FWithOptions } from "./color-picker";
import { Button } from "@/components/ui-editor/button";
import { useSchema } from "../schema";
import { factory, tokens } from "@grida/tokens";
import { useComputed } from "@/grida-canvas-react-renderer-dom/nodes/use-computed";
import { useNumberInput } from "@grida/number-input/react";
import { Separator } from "@/components/ui/separator";
import grida from "@grida/schema";
import cg from "@grida/cg";
import cmath from "@grida/cmath";
import kolor from "@grida/color";

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
  blend_mode: cg.def.BLENDMODE,
  opacity: 1,
  active: true,
};

function getNextPaintForType(
  current: cg.Paint | undefined,
  next: cg.Paint["type"] | "image"
): cg.Paint | null {
  const to = next;

  const blend_mode =
    (current && "blend_mode" in current ? current.blend_mode : undefined) ??
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
            active: current.active,
            type: to,
            transform,
            stops: [
              { offset: 0, color: current.color },
              {
                offset: 1,
                // TODO: darken second color based on the first color
                color: kolor.colorformats.RGBA32F.WHITE,
              },
            ],
            blend_mode,
            opacity: opacity,
          } as cg.Paint;
        }
        case "solid": {
          return current; // noop
        }
        case "image": {
          return {
            ...DEFAULT_IMAGE_PAINT,
            blend_mode,
            opacity: opacity,
          } satisfies cg.Paint;
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
          const stopColor = current.stops[0].color;
          return {
            type: "solid",
            color: kolor.colorformats.newRGBA32F(
              stopColor.r,
              stopColor.g,
              stopColor.b,
              opacity
            ),
            blend_mode,
            active: true,
          } satisfies cg.Paint;
        }
        case "linear_gradient":
        case "radial_gradient":
        case "sweep_gradient":
        case "diamond_gradient": {
          return {
            type: to,
            stops: current.stops,
            transform,
            blend_mode,
            opacity: current.opacity || 1,
          } as cg.Paint;
        }
        case "image": {
          return {
            ...DEFAULT_IMAGE_PAINT,
            blend_mode,
            opacity: opacity,
          } satisfies cg.Paint;
        }
      }
      break;
    }
    case "image": {
      switch (to) {
        case "solid": {
          return {
            type: "solid",
            color: kolor.colorformats.newRGBA32F(
              kolor.colorformats.RGBA32F.GRAY.r,
              kolor.colorformats.RGBA32F.GRAY.g,
              kolor.colorformats.RGBA32F.GRAY.b,
              opacity
            ),
            blend_mode,
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
              {
                offset: 0,
                color: kolor.colorformats.RGBA32F.GRAY,
              },
              {
                offset: 1,
                color: kolor.colorformats.RGBA32F.WHITE,
              },
            ],
            blend_mode,
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
      color: kolor.colorformats.RGBA32F.BLACK,
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
      return def.type === "rgbaf";
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
    <PopoverTrigger className="w-full" data-testid="trigger-paint-new">
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
      <PopoverTrigger
        className="flex-shrink-0"
        data-testid="trigger-paint-solid"
      >
        <PaintChip paint={value} className="rounded-sm" />
      </PopoverTrigger>
      <RGBHexInput
        className="flex-1 px-1.5"
        unit="f32"
        value={{
          r: value.color.r,
          g: value.color.g,
          b: value.color.b,
        }}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onValueCommit={(color, opacity) => {
          onValueChange?.({
            ...value,
            type: "solid",
            color: kolor.colorformats.newRGBA32F(
              color.r,
              color.g,
              color.b,
              opacity ?? value.color.a
            ),
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
            color: kolor.colorformats.newRGBA32F(
              value.color.r,
              value.color.g,
              value.color.b,
              opacity
            ),
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
      <PopoverTrigger
        className="flex flex-1 items-center"
        data-testid="trigger-paint-gradient"
      >
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
      <PopoverTrigger
        className="flex flex-1 items-center"
        data-testid="trigger-paint-image"
      >
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
      collisionPadding={8}
      className="p-0"
      onPointerDown={(e) =>
        // prevent popover content from causing dnd
        e.stopPropagation()
      }
      data-testid="popover-paint-editor"
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
    <div
      className="flex items-center justify-between m-2"
      data-testid="paint-editor-tabs-header"
    >
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
          value={value?.blend_mode ?? cg.def.BLENDMODE}
          onValueChange={(blend_mode) => {
            if (value) {
              onValueChange?.({
                ...value,
                blend_mode,
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
      <div data-testid="view-paint-solid">
        <ColorPicker32FWithOptions
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
      <div className="p-2 space-y-4" data-testid="view-paint-gradient">
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
      <div className="p-2" data-testid="view-paint-image">
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
