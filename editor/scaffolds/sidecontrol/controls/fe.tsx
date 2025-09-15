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
import {
  PropertyEnum,
  PropertyEnumTabs,
  PropertyLine,
  PropertyLineLabel,
} from "../ui";
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
import { mergeDefinedProperties } from "./utils/merge";

function getIcon(fe: cg.FilterEffect) {
  switch (fe.type) {
    case "filter-blur":
    case "backdrop-filter-blur": {
      return BoxIcon;
    }
    case "shadow": {
      if (fe.inset) {
        return ShadowInnerIcon;
      }
      return ShadowOuterIcon;
    }
  }
}

export function FeControl({
  value,
  onValueChange,
  onRemove,
}: {
  value: cg.FilterEffect;
  onValueChange?: (value: cg.FilterEffect) => void;
  onRemove?: () => void;
}) {
  const Icon = getIcon(value);
  return (
    <Popover>
      <div className="flex items-center w-full gap-2">
        <PopoverTrigger>
          <Icon />
        </PopoverTrigger>
        <div className="flex items-center flex-1/2">
          <PropertyEnum<cg.FilterEffect["type"]>
            enum={[
              { label: "Layer Blur", value: "filter-blur" },
              { label: "Backdrop Blur", value: "backdrop-filter-blur" },
              { label: "Shadow", value: "shadow" },
            ]}
            value={value.type}
            onValueChange={(type) => {
              switch (type) {
                case "shadow": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_SHADOW,
                    type,
                  });
                  break;
                }
                case "filter-blur":
                case "backdrop-filter-blur": {
                  onValueChange?.({
                    blur: {
                      type: "blur",
                      ...editor.config.DEFAULT_FE_GAUSSIAN_BLUR,
                    },
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
              ...properties,
              type: value.type,
            } as cg.FilterEffect);
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
    case "filter-blur":
    case "backdrop-filter-blur": {
      return (
        <FeBlurProperties
          value={value.blur}
          onValueChange={(b) => {
            onValueChange?.({ ...value, blur: b });
          }}
        />
      );
    }
    case "shadow": {
      return <FeShadowProperties value={value} onValueChange={onValueChange} />;
    }
  }
}

function FeBlurProperties({
  value,
  onValueChange,
}: {
  value: cg.FeBlur;
  onValueChange?: (value: cg.FeBlur) => void;
}) {
  return (
    <div className="space-y-2">
      <PropertyEnumTabs<cg.FeBlur["type"]>
        enum={[
          { label: "Normal", value: "blur" },
          { label: "Progressive", value: "progressive-blur", disabled: true },
        ]}
        value={value.type}
        onValueChange={(type) => {
          switch (type) {
            case "blur": {
              onValueChange?.({
                ...value,
                type,
              } as cg.FeGaussianBlur);
            }
            case "progressive-blur": {
              const __v = value as Partial<cg.IFeProgressiveBlur>;
              const v = mergeDefinedProperties<cg.FeProgressiveBlur>(
                editor.config.DEFAULT_FE_PROGRESSIVE_BLUR,
                __v as Partial<cg.IFeProgressiveBlur>,
                { type: "progressive-blur" },
                {
                  x1: __v.x1 ?? undefined,
                  y1: __v.y1 ?? undefined,
                  x2: __v.x2 ?? undefined,
                  y2: __v.y2 ?? undefined,
                  radius: __v.radius,
                  radius2: __v.radius2 ?? undefined,
                }
              );

              onValueChange?.(v as cg.FeProgressiveBlur);
            }
          }
        }}
      />
      {value.type === "blur" && (
        <FeGaussianBlurProperties
          value={value}
          onValueChange={(b) => {
            const fe: cg.FeGaussianBlur = {
              type: "blur",
              radius: b.radius,
            };

            onValueChange?.(fe);
          }}
        />
      )}
      {value.type === "progressive-blur" && (
        <FeProgressiveBlurProperties
          value={value}
          onValueChange={(b) => {
            const fe: cg.FeProgressiveBlur = {
              type: "progressive-blur",
              ...b,
            };

            onValueChange?.(fe);
          }}
        />
      )}
    </div>
  );
}

function FeGaussianBlurProperties({
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
            max={editor.config.DEFAULT_MAX_BLUR_RADIUS}
            onValueCommit={(v) => onValueChange?.({ ...value, radius: v || 0 })}
          />
        </PropertyLine>
      </div>
    );
}

function FeProgressiveBlurProperties({
  value,
  onValueChange,
}: {
  value: cg.IFeProgressiveBlur;
  onValueChange?: (value: cg.IFeProgressiveBlur) => void;
}) {
  return (
    <div className="space-y-2">
      <PropertyLine>
        <PropertyLineLabel>Start</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value?.radius}
          max={editor.config.DEFAULT_MAX_BLUR_RADIUS}
          onValueCommit={(v) => onValueChange?.({ ...value, radius: v || 0 })}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>End</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value?.radius}
          max={editor.config.DEFAULT_MAX_BLUR_RADIUS}
          onValueCommit={(v) => onValueChange?.({ ...value, radius2: v || 0 })}
        />
      </PropertyLine>
    </div>
  );
}

function FeShadowProperties({
  value,
  onValueChange,
}: {
  value: Omit<cg.FeShadow, "type">;
  onValueChange?: (value: Omit<cg.FeShadow, "type">) => void;
}) {
  return (
    <div className="space-y-2">
      <PropertyLine>
        <PropertyEnumTabs<"inner-shadow" | "drop-shadow">
          enum={[
            { label: "Drop", value: "drop-shadow" },
            { label: "Inner", value: "inner-shadow" },
          ]}
          value={value.inset ? "inner-shadow" : "drop-shadow"}
          onValueChange={(v) => {
            onValueChange?.({ ...value, inset: v === "inner-shadow" });
          }}
        />
      </PropertyLine>
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
              inset: false,
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
        <PropertyLineLabel>Offset X</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.dx}
          max={editor.config.DEFAULT_MAX_SHADOW_OFFSET}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              dx: v || 0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Offset Y</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.dy}
          max={editor.config.DEFAULT_MAX_SHADOW_OFFSET}
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
          max={editor.config.DEFAULT_MAX_BLUR_RADIUS}
          onValueCommit={(v) => onValueChange?.({ ...value, blur: v || 0 })}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Spread</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.spread}
          max={editor.config.DEFAULT_MAX_SHADOW_SPREAD}
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
