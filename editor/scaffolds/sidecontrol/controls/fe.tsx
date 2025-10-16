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

/**
 * Constraints for filter effect types that control which effect types can be selected.
 *
 * This is needed because certain effect types can only exist once per node:
 * - `filter-blur` (Layer Blur): Only one allowed per node
 * - `backdrop-filter-blur` (Backdrop Blur): Only one allowed per node
 * - `shadow`: Multiple allowed per node
 *
 * By setting a property to `false`, that effect type option will be disabled in the UI,
 * preventing users from adding duplicate blur effects. This constraint is enforced at the
 * model level in `changeNodeFilterEffects` (using `.find()` for blur effects), but this
 * interface allows the UI to reflect and prevent invalid states proactively.
 *
 * @example
 * ```tsx
 * // Disable Layer Blur if it already exists on the node
 * <FeControl
 *   value={effect}
 *   constraints={{
 *     "filter-blur": !node.feBlur || effect.type === "filter-blur",
 *     "backdrop-filter-blur": !node.feBackdropBlur || effect.type === "backdrop-filter-blur",
 *     shadow: true, // Always allow (multiple shadows supported)
 *   }}
 * />
 * ```
 */
export interface FeTypeConstraints {
  /** Whether Layer Blur can be selected. Set to `false` to disable. */
  "filter-blur"?: boolean;
  /** Whether Backdrop Blur can be selected. Set to `false` to disable. */
  "backdrop-filter-blur"?: boolean;
  /** Whether Shadow can be selected. Set to `false` to disable. */
  shadow?: boolean;
  /** Whether Liquid Glass can be selected. Set to `false` to disable. */
  glass?: boolean;
}

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
    case "glass": {
      return BoxIcon;
    }
  }
}

function FeTypeSelect({
  value,
  onValueChange,
  constraints,
}: {
  value: cg.FilterEffect["type"];
  onValueChange: (type: cg.FilterEffect["type"]) => void;
  constraints?: FeTypeConstraints;
}) {
  return (
    <PropertyEnum<cg.FilterEffect["type"]>
      enum={[
        {
          label: "Layer Blur",
          value: "filter-blur",
          disabled: constraints?.["filter-blur"] === false,
        },
        {
          label: "Backdrop Blur",
          value: "backdrop-filter-blur",
          disabled: constraints?.["backdrop-filter-blur"] === false,
        },
        {
          label: "Shadow",
          value: "shadow",
          disabled: constraints?.["shadow"] === false,
        },
        {
          label: "Liquid Glass",
          value: "glass",
          disabled: constraints?.["glass"] === false,
        },
      ]}
      value={value}
      onValueChange={(type) => {
        switch (type) {
          case "shadow": {
            onValueChange(type);
            break;
          }
          case "filter-blur":
          case "backdrop-filter-blur": {
            onValueChange(type);
            break;
          }
          case "glass": {
            onValueChange(type);
            break;
          }
        }
      }}
    />
  );
}

export function FeControl({
  value,
  onValueChange,
  onRemove,
  constraints,
}: {
  value: cg.FilterEffect;
  onValueChange?: (value: cg.FilterEffect) => void;
  onRemove?: () => void;
  constraints?: FeTypeConstraints;
}) {
  const Icon = getIcon(value);
  return (
    <Popover modal={false}>
      <div className="flex items-center w-full gap-2">
        <PopoverTrigger>
          <Icon />
        </PopoverTrigger>
        <div className="flex items-center flex-1/2">
          <FeTypeSelect
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
                case "glass": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_LIQUID_GLASS,
                    type,
                  });
                  break;
                }
              }
            }}
            constraints={constraints}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="ms-2 cursor-pointer"
            tabIndex={-1}
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
    case "glass": {
      return (
        <FeLiquidGlassProperties value={value} onValueChange={onValueChange} />
      );
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

function FeLiquidGlassProperties({
  value,
  onValueChange,
}: {
  value: cg.FeLiquidGlass;
  onValueChange?: (value: Omit<cg.FeLiquidGlass, "type">) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <PropertyLine>
        <PropertyLineLabel>Light Intensity</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.lightIntensity}
          min={0}
          max={1}
          step={0.1}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              lightIntensity: v ?? 0.9,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Light Angle</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.lightAngle}
          min={0}
          max={360}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              lightAngle: v ?? 45.0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Refraction</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.refraction}
          min={0.0}
          max={1.0}
          step={0.01}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              refraction: v ?? 0.5,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Depth</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.depth}
          min={1.0}
          max={editor.config.DEFAULT_MAX_LIQUID_GLASS_DEPTH}
          step={1.0}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              depth: v ?? 50.0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Dispersion</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.dispersion}
          min={0}
          max={1}
          step={0.01}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              dispersion: v ?? 0.03,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>Frost Blur</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value.blurRadius}
          max={editor.config.DEFAULT_MAX_LIQUID_GLASS_BLUR_RADIUS}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              blurRadius: v ?? 8.0,
            })
          }
        />
      </PropertyLine>
    </div>
  );
}
