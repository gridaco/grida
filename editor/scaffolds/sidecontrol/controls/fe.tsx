import cg from "@grida/cg";
import kolor from "@grida/color";
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
import { PropertyLineLabelWithNumberGesture } from "../ui/label-with-number-gesture";
import InputPropertyNumber from "../ui/number";
import InputPropertyPercentage from "../ui/percentage";
import {
  MinusIcon,
  ShadowOuterIcon,
  ShadowInnerIcon,
} from "@radix-ui/react-icons";
import { RGBA32FColorControl } from "./color";
import { editor } from "@/grida-canvas";
import { Button } from "@/components/ui-editor/button";
import { Checkbox } from "@/components/ui-editor/checkbox";
import { mergeDefinedProperties } from "./utils/merge";
import {
  FeNoiseIcon,
  FeLayerBlurIcon,
  FeBackdropBlurIcon,
  FeGlassIcon,
} from "./icons/fe-icons";
import { BlendModeDropdown } from "./blend-mode";

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
  /** Whether Noise effects can be added. Set to `false` to disable. */
  noise?: boolean;
}

function getIcon(fe: cg.FilterEffect) {
  switch (fe.type) {
    case "filter-blur": {
      return FeLayerBlurIcon;
    }
    case "backdrop-filter-blur": {
      return FeBackdropBlurIcon;
    }
    case "shadow": {
      if (fe.inset) {
        return ShadowInnerIcon;
      }
      return ShadowOuterIcon;
    }
    case "glass": {
      return FeGlassIcon;
    }
    case "noise": {
      return FeNoiseIcon;
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
        {
          label: "Noise",
          value: "noise",
          disabled: constraints?.["noise"] === false,
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
          case "noise": {
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
  const isActive = value.active ?? true;

  const handleToggleActive = (checked: boolean) => {
    onValueChange?.({ ...value, active: checked });
  };

  return (
    <Popover modal={false}>
      <div className="flex items-center w-full gap-2">
        <Checkbox
          checked={isActive}
          onCheckedChange={(checked) => {
            handleToggleActive(Boolean(checked));
          }}
        />
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Icon />
          </Button>
        </PopoverTrigger>
        <div className="flex items-center flex-1/2">
          <FeTypeSelect
            value={value.type}
            onValueChange={(type) => {
              switch (type) {
                case "shadow": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_SHADOW,
                    active: true,
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
                    active: true,
                  });
                  break;
                }
                case "glass": {
                  onValueChange?.({
                    ...editor.config.DEFAULT_FE_LIQUID_GLASS,
                    type,
                    active: true,
                  });
                  break;
                }
                case "noise": {
                  onValueChange?.({
                    type: "noise",
                    ...editor.config.DEFAULT_FE_NOISE,
                    active: true,
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
            onValueChange?.({
              ...value,
              blur: b,
            } as Omit<cg.FeLayerBlur | cg.FeBackdropBlur, "type">);
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
    case "noise": {
      return <FeNoiseProperties value={value} onValueChange={onValueChange} />;
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
          { label: "Progressive", value: "progressive-blur" },
        ]}
        value={value.type}
        onValueChange={(type) => {
          switch (type) {
            case "blur": {
              onValueChange?.({
                ...value,
                type,
              } as cg.FeGaussianBlur);
              break;
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
              break;
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
          min={0}
          max={editor.config.DEFAULT_MAX_BLUR_RADIUS}
          onValueCommit={(v) => onValueChange?.({ ...value, radius: v || 0 })}
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabel>End</PropertyLineLabel>
        <InputPropertyNumber
          mode="fixed"
          value={value?.radius2}
          min={0}
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
        <PropertyEnum
          placeholder="Preset"
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
          enum={Object.keys(tw.boxshadow).map((key) => {
            const shadow = tw.boxshadow[key as keyof typeof tw.boxshadow];
            return {
              label: shadow.label,
              value: shadow.class,
            };
          })}
        />
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
        <RGBA32FColorControl
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
        <PropertyLineLabelWithNumberGesture
          step={1}
          min={0}
          max={100}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              refraction: Math.max(
                0,
                Math.min(1, value.refraction + (c.value ?? 0) / 100)
              ),
            })
          }
        >
          Refraction
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyPercentage
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
        <PropertyLineLabelWithNumberGesture
          step={1}
          min={1}
          max={100}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              depth: Math.max(1, Math.min(100, value.depth + (c.value ?? 0))),
            })
          }
        >
          Depth
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyPercentage
          mode="fixed"
          value={value.depth / 100}
          min={0.01}
          max={1.0}
          step={0.01}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              depth: (v ?? 0.5) * 100,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabelWithNumberGesture
          step={1}
          min={0}
          max={100}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              dispersion: Math.max(
                0,
                Math.min(1, value.dispersion + (c.value ?? 0) / 100)
              ),
            })
          }
        >
          Dispersion
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyPercentage
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
        <PropertyLineLabelWithNumberGesture
          step={1}
          min={0}
          max={editor.config.DEFAULT_MAX_LIQUID_GLASS_BLUR_RADIUS}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              radius: c.value,
            })
          }
        >
          Frost Blur
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyNumber
          mode="fixed"
          value={value.radius}
          max={editor.config.DEFAULT_MAX_LIQUID_GLASS_BLUR_RADIUS}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              radius: v ?? 8.0,
            })
          }
        />
      </PropertyLine>
    </div>
  );
}

function FeNoiseProperties({
  value,
  onValueChange,
}: {
  value: cg.FeNoise;
  onValueChange?: (value: Omit<cg.FeNoise, "type">) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <PropertyEnumTabs<cg.FeNoise["mode"]>
          enum={[
            { label: "Mono", value: "mono" },
            { label: "Duo", value: "duo" },
            { label: "Multi", value: "multi" },
          ]}
          value={value.mode}
          onValueChange={(mode) => {
            // When switching modes, provide appropriate default values
            const base = {
              noise_size: value.noise_size,
              density: value.density,
              blend_mode: value.blend_mode ?? "normal",
              ...(value.num_octaves !== undefined && {
                num_octaves: value.num_octaves,
              }),
              ...(value.seed !== undefined && { seed: value.seed }),
            };

            switch (mode) {
              case "mono":
                onValueChange?.({
                  ...base,
                  mode: "mono",
                  color:
                    value.color ?? kolor.colorformats.newRGBA32F(0, 0, 0, 0.15),
                });
                break;
              case "duo":
                onValueChange?.({
                  ...base,
                  mode: "duo",
                  color1:
                    value.color1 ?? kolor.colorformats.newRGBA32F(1, 0, 0, 1),
                  color2:
                    value.color2 ??
                    kolor.colorformats.newRGBA32F(1, 1, 1, 0.25),
                });
                break;
              case "multi":
                onValueChange?.({
                  ...base,
                  mode: "multi",
                  opacity: value.opacity ?? 1.0,
                });
                break;
            }
          }}
        />
        <BlendModeDropdown
          type="paint"
          value={value.blend_mode ?? "normal"}
          onValueChange={(blend_mode) => {
            onValueChange?.({
              ...value,
              blend_mode: blend_mode as cg.BlendMode,
            });
          }}
        />
      </div>
      <PropertyLine>
        <PropertyLineLabelWithNumberGesture
          step={0.1}
          min={0.001}
          max={100}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              noise_size: Math.max(
                0.001,
                Math.min(100, value.noise_size + (c.value ?? 0))
              ),
            })
          }
        >
          Noise Size
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyNumber
          mode="fixed"
          value={value.noise_size}
          min={0.001}
          max={100}
          step={0.1}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              noise_size: v ?? 2.0,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabelWithNumberGesture
          step={0.01}
          min={0}
          max={1}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              density: Math.max(0, Math.min(1, value.density + (c.value ?? 0))),
            })
          }
        >
          Density
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyPercentage
          mode="fixed"
          value={value.density}
          min={0}
          max={1}
          step={0.01}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              density: v ?? 0.5,
            })
          }
        />
      </PropertyLine>
      <PropertyLine>
        <PropertyLineLabelWithNumberGesture
          step={1}
          min={1}
          max={8}
          onValueChange={(c) =>
            onValueChange?.({
              ...value,
              num_octaves: Math.max(
                1,
                Math.min(8, (value.num_octaves ?? 3) + (c.value ?? 0))
              ),
            })
          }
        >
          Octaves
        </PropertyLineLabelWithNumberGesture>
        <InputPropertyNumber
          mode="fixed"
          value={value.num_octaves ?? 3}
          min={1}
          max={8}
          step={1}
          onValueCommit={(v) =>
            onValueChange?.({
              ...value,
              num_octaves: v ?? 3,
            })
          }
        />
      </PropertyLine>
      {value.mode === "mono" && value.color && (
        <PropertyLine>
          <PropertyLineLabel>Color</PropertyLineLabel>
          <RGBA32FColorControl
            variant="with-opacity"
            value={value.color}
            onValueChange={(v) => onValueChange?.({ ...value, color: v })}
          />
        </PropertyLine>
      )}
      {value.mode === "duo" && (
        <PropertyLine>
          <PropertyLineLabel>Colors</PropertyLineLabel>
          <div className="flex flex-col gap-2 w-full">
            <RGBA32FColorControl
              variant="with-opacity"
              value={value.color1 ?? kolor.colorformats.newRGBA32F(1, 0, 0, 1)}
              onValueChange={(v) => onValueChange?.({ ...value, color1: v })}
            />
            <RGBA32FColorControl
              variant="with-opacity"
              value={
                value.color2 ?? kolor.colorformats.newRGBA32F(1, 1, 1, 0.25)
              }
              onValueChange={(v) => onValueChange?.({ ...value, color2: v })}
            />
          </div>
        </PropertyLine>
      )}
      {value.mode === "multi" && (
        <PropertyLine>
          <PropertyLineLabelWithNumberGesture
            step={0.01}
            min={0}
            max={1}
            onValueChange={(c) =>
              onValueChange?.({
                ...value,
                opacity: Math.max(
                  0,
                  Math.min(1, (value.opacity ?? 1) + (c.value ?? 0))
                ),
              })
            }
          >
            Opacity
          </PropertyLineLabelWithNumberGesture>
          <InputPropertyPercentage
            mode="fixed"
            value={value.opacity ?? 1.0}
            min={0}
            max={1}
            step={0.01}
            onValueCommit={(v) =>
              onValueChange?.({
                ...value,
                opacity: v ?? 1.0,
              })
            }
          />
        </PropertyLine>
      )}
    </div>
  );
}
