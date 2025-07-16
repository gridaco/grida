import cg from "@grida/cg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import * as tw from "./k/tailwindcss";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PropertyEnum, PropertyLine, PropertyLineLabel } from "../ui";
import InputPropertyNumber from "../ui/number";
import {
  BoxIcon,
  MinusIcon,
  ShadowOuterIcon,
  ShadowInnerIcon,
} from "@radix-ui/react-icons";
import { RGBAColorControl } from "./color";
import { editor } from "@/grida-canvas";
import { Button } from "@/components/ui-editor/button";

const icons = {
  "layer-blur": BoxIcon,
  "backdrop-blur": BoxIcon,
  "inner-shadow": ShadowInnerIcon,
  "drop-shadow": ShadowOuterIcon,
} as const;

export function FeControl({
  value,
  onValueChange,
  onRemove,
}: {
  value: cg.FilterEffect;
  onValueChange?: (value: cg.FilterEffect) => void;
  onRemove?: () => void;
}) {
  const Icon = icons[value.type];
  return (
    <Popover>
      <div className="flex items-center w-full gap-2">
        <PopoverTrigger>
          <Icon />
        </PopoverTrigger>
        <div className="flex items-center flex-1/2">
          <PropertyEnum
            enum={[
              { label: "Layer Blur", value: "layer-blur" },
              { label: "Backdrop Blur", value: "backdrop-blur" },
              { label: "Inner Shadow", value: "inner-shadow" },
              { label: "Drop Shadow", value: "drop-shadow" },
            ]}
            value={value.type}
            onValueChange={(type) => {
              switch (type) {
                case "backdrop-blur":
                case "layer-blur": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_BLUR,
                    type,
                  });
                  break;
                }
                case "drop-shadow":
                case "inner-shadow": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_SHADOW,
                    type,
                  });
                  break;
                }
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="ms-2 cursor-pointer"
          >
            <MinusIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={10}
      >
        <FeProperties
          value={value}
          onValueChange={(properties) => {
            onValueChange?.({
              ...value,
              ...properties,
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function FeProperties({
  value,
  onValueChange,
}: {
  value: cg.FilterEffect;
  onValueChange?: (value: Omit<cg.FilterEffect, "type">) => void;
}) {
  switch (value?.type) {
    case "layer-blur": {
      return <FeBlurProperties value={value} onValueChange={onValueChange} />;
    }
    case "backdrop-blur": {
      return <FeBlurProperties value={value} onValueChange={onValueChange} />;
    }
    case "inner-shadow": {
      return <FeShadowProperties value={value} onValueChange={onValueChange} />;
    }
    case "drop-shadow": {
      return <FeShadowProperties value={value} onValueChange={onValueChange} />;
    }
  }
}

function FeBlurProperties({
  value,
  onValueChange,
}: {
  value: cg.IFeGaussianBlur;
  onValueChange?: (value: cg.IFeGaussianBlur) => void;
}) {
  return (
    <div className="space-y-2">
      <PropertyLine>
        <PropertyLineLabel>Blur</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value?.radius}
          onValueCommit={(v) => onValueChange?.({ ...value, radius: v || 0 })}
        />
      </PropertyLine>
    </div>
  );
}

function FeShadowProperties({
  value,
  onValueChange,
}: {
  value: cg.IFeShadow;
  onValueChange?: (value: cg.IFeShadow) => void;
}) {
  return (
    <div className="space-y-2">
      <PropertyLine>
        <PropertyLineLabel>Preset</PropertyLineLabel>
        <Select
          value={undefined}
          onValueChange={(key) => {
            const preset = tw.boxshadow[key as keyof typeof tw.boxshadow];

            onValueChange?.({
              dx: preset.value.offset[0],
              dy: preset.value.offset[1],
              blur: preset.value.blur,
              spread: preset.value.spread,
              color: preset.value.color,
            });
          }}
        >
          <SelectTrigger className={WorkbenchUI.inputVariants({ size: "xs" })}>
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(tw.boxshadow).map((key) => {
              const shadow = tw.boxshadow[key as keyof typeof tw.boxshadow];
              return (
                <SelectItem key={key} value={shadow.class}>
                  {shadow.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>X</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.dx}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              dx: v || 0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Y</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.dy}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              dy: v || 0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Blur</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.blur}
          onValueCommit={(v) => onValueChange?.({ ...value, blur: v || 0 })}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Spread</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.spread}
          onValueCommit={(v) => onValueChange?.({ ...value, spread: v || 0 })}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Color</PropertyLineLabel>
        <RGBAColorControl
          value={value.color}
          onValueChange={(v) => onValueChange?.({ ...value, color: v })}
        />
      </PropertyLine>
    </div>
  );
}
