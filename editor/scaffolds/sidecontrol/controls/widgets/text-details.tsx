import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Slider } from "../utils/slider";
import { Separator } from "@/components/ui/separator";
import { PropertyLine, PropertyLineLabel, PropertyEnumToggle } from "../../ui";
import InputPropertyNumber from "../../ui/number";
import { RGBAColorControl } from "../color";
import { WordSpacingControl } from "../word-spacing";
import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  TextAlignJustifyIcon,
  UnderlineIcon,
  LetterCaseCapitalizeIcon,
  LetterCaseLowercaseIcon,
  LetterCaseUppercaseIcon,
  MinusIcon,
  OverlineIcon,
  StrikethroughIcon,
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import type { editor } from "@/grida-canvas";
import { ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Preview,
  type BasicPreview,
  type VariationPreview,
  type FeaturePreview,
  type PropertyKey,
} from "./text-details-preview";
import { FontFeatureSettings } from "./text-details-font-feature-settings";
import { useCurrentFontFace } from "../context/font";
import { FontVariableAxisSlider } from "../font-variable-axis";
import { PropertyLineLabelWithNumberGesture } from "../../ui/label-with-number-gesture";

// Type definitions
type VerticalTrim = "all" | "disable-all";

// Alignment options
const ALIGNMENT_OPTIONS = [
  {
    value: "left" as cg.TextAlign,
    icon: <TextAlignLeftIcon className="size-3" />,
    label: "Left",
  },
  {
    value: "center" as cg.TextAlign,
    icon: <TextAlignCenterIcon className="size-3" />,
    label: "Center",
  },
  {
    value: "right" as cg.TextAlign,
    icon: <TextAlignRightIcon className="size-3" />,
    label: "Right",
  },
  {
    value: "justify" as cg.TextAlign,
    icon: <TextAlignJustifyIcon className="size-3" />,
    label: "Justify",
  },
];

// Decoration options
const DECORATION_OPTIONS = [
  {
    value: "none" as cg.TextDecorationLine,
    icon: <MinusIcon className="size-3" />,
    label: "None",
  },
  {
    value: "underline" as cg.TextDecorationLine,
    icon: <UnderlineIcon className="size-3" />,
    label: "Underline",
  },
  {
    value: "overline" as cg.TextDecorationLine,
    icon: <OverlineIcon className="size-3" />,
    label: "Overline",
  },
  {
    value: "line-through" as cg.TextDecorationLine,
    icon: <StrikethroughIcon className="size-3" />,
    label: "Line-through",
  },
];

// Case options
const CASE_OPTIONS = [
  {
    value: "none" as cg.TextTransform,
    icon: <MinusIcon className="size-3" />,
    label: "None",
  },
  {
    value: "uppercase" as cg.TextTransform,
    icon: <LetterCaseUppercaseIcon className="size-3" />,
    label: "Uppercase",
  },
  {
    value: "lowercase" as cg.TextTransform,
    icon: <LetterCaseLowercaseIcon className="size-3" />,
    label: "Lowercase",
  },
  {
    value: "capitalize" as cg.TextTransform,
    icon: <LetterCaseCapitalizeIcon className="size-3" />,
    label: "Capitalize",
  },
];

// Vertical trim options
const VERTICAL_TRIM_OPTIONS = [
  {
    value: "all" as VerticalTrim,
    icon: (
      <span
        className="text-xs"
        style={{
          textDecorationLine: "overline underline",
          textDecorationSkipInk: "none",
        }}
      >
        Ag
      </span>
    ),
    label: "All",
  },
  {
    value: "disable-all" as VerticalTrim,
    icon: (
      <span
        className="text-xs"
        style={{
          textDecorationLine: "overline underline",
          textDecorationSkipInk: "auto",
        }}
      >
        Ag
      </span>
    ),
    label: "Disable All",
  },
];

// Truncate text options
const TRUNCATE_OPTIONS = [
  { value: "off", icon: <MinusIcon className="size-3" />, label: "Off" },
  { value: "on", icon: <span className="text-xs">A...</span>, label: "On" },
];

// Decoration Style options
const DECORATION_STYLE_OPTIONS = [
  {
    value: "solid" as cg.TextDecorationStyle,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationStyle: "solid" }}
      >
        A
      </span>
    ),
    label: "Solid",
  },
  {
    value: "double" as cg.TextDecorationStyle,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationStyle: "double" }}
      >
        A
      </span>
    ),
    label: "Double",
  },
  {
    value: "dotted" as cg.TextDecorationStyle,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationStyle: "dotted" }}
      >
        A
      </span>
    ),
    label: "Dotted",
  },
  {
    value: "dashed" as cg.TextDecorationStyle,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationStyle: "dashed" }}
      >
        A
      </span>
    ),
    label: "Dashed",
  },
  {
    value: "wavy" as cg.TextDecorationStyle,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationStyle: "wavy" }}
      >
        A
      </span>
    ),
    label: "Wavy",
  },
];

// Skip Ink options
const SKIP_INK_OPTIONS = [
  {
    value: "auto" as cg.TextDecorationSkipInk,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationSkipInk: "auto" }}
      >
        Ag
      </span>
    ),
    label: "Auto",
  },
  {
    value: "none" as cg.TextDecorationSkipInk,
    icon: (
      <span
        className="text-xs underline"
        style={{ textDecorationSkipInk: "none" }}
      >
        Ag
      </span>
    ),
    label: "None",
  },
];

interface DecorationDetailsProps {
  // Properties
  textDecorationLine?: cg.TextDecorationLine;
  textDecorationStyle?: cg.TextDecorationStyle;
  textDecorationThickness?: cg.TextDecorationThicknessPercentage;
  textDecorationColor?: cg.TextDecorationColorValue;
  textDecorationSkipInk?: cg.TextDecorationSkipInkFlag;

  // Change handlers
  onTextDecorationStyleChange?: (value: cg.TextDecorationStyle) => void;
  onTextDecorationThicknessChange?: (
    value: cg.TextDecorationThicknessPercentage
  ) => void;
  onTextDecorationColorChange?: (value: cg.TextDecorationColorValue) => void;
  onTextDecorationSkipInkChange?: (value: cg.TextDecorationSkipInkFlag) => void;

  // Hover handlers
  onHover?: (
    key: PropertyKey,
    value:
      | cg.TextAlign
      | cg.TextDecorationLine
      | cg.TextTransform
      | cg.TextDecorationStyle
      | cg.TextDecorationSkipInkFlag
  ) => void;
  onHoverLeave?: () => void;
}

function DecorationDetails(props: DecorationDetailsProps = {}) {
  const {
    // Properties
    textDecorationLine = "none",
    textDecorationStyle = "solid",
    textDecorationThickness = "auto",
    textDecorationColor,
    textDecorationSkipInk = true,

    // Change handlers
    onTextDecorationStyleChange,
    onTextDecorationThicknessChange,
    onTextDecorationColorChange,
    onTextDecorationSkipInkChange,

    // Hover handlers
    onHover,
    onHoverLeave,
  } = props;

  const handleSkipInkToggleChange = (value: string) => {
    const isEnabled = value === "auto";
    onTextDecorationSkipInkChange?.(isEnabled);
  };

  const isUnderline = textDecorationLine === "underline";
  const isDecorationActive = textDecorationLine !== "none";

  return (
    <div className="space-y-3">
      {/* Style */}
      <PropertyLine>
        <PropertyLineLabel>Style</PropertyLineLabel>
        <PropertyEnumToggle
          enum={DECORATION_STYLE_OPTIONS}
          value={textDecorationStyle}
          className="w-full"
          size="sm"
          disabled={!isDecorationActive}
          onValueChange={onTextDecorationStyleChange}
          onValueSeeked={(value) =>
            value
              ? onHover?.(
                  "textDecorationStyle",
                  value as cg.TextDecorationStyle
                )
              : onHoverLeave?.()
          }
        />
      </PropertyLine>

      {/* Skip Ink */}
      <PropertyLine>
        <PropertyLineLabel>Skip Ink</PropertyLineLabel>
        <PropertyEnumToggle
          enum={SKIP_INK_OPTIONS}
          value={textDecorationSkipInk ? "auto" : "none"}
          className="w-full"
          size="sm"
          disabled={!isUnderline}
          onValueChange={handleSkipInkToggleChange}
          onValueSeeked={(value) =>
            value
              ? onHover?.("textDecorationSkipInk", value === "auto")
              : onHoverLeave?.()
          }
        />
      </PropertyLine>

      {/* Thickness */}
      <PropertyLine className="flex-col items-start space-y-2">
        <div className="flex items-center justify-between w-full">
          <PropertyLineLabel>Thickness</PropertyLineLabel>
          <InputPropertyNumber
            mode="fixed"
            value={
              typeof textDecorationThickness === "number"
                ? textDecorationThickness
                : undefined
            }
            onValueCommit={onTextDecorationThicknessChange}
            min={0.1}
            max={5}
            step={0.1}
            placeholder="auto"
            className="w-16"
            disabled={!isDecorationActive}
          />
        </div>
        <div className="w-full">
          <Slider
            value={[
              typeof textDecorationThickness === "number"
                ? textDecorationThickness
                : 1,
            ]}
            max={5}
            min={0.1}
            step={0.1}
            className="w-full"
            disabled={!isDecorationActive}
            onValueChange={(values) =>
              onTextDecorationThicknessChange?.(values[0])
            }
          />
        </div>
      </PropertyLine>

      {/* Color */}
      <PropertyLine>
        <PropertyLineLabel>Color</PropertyLineLabel>
        <RGBAColorControl
          value={textDecorationColor}
          onValueChange={onTextDecorationColorChange}
          disabled={!isDecorationActive}
        />
      </PropertyLine>
    </div>
  );
}

interface TextDetailsProps {
  // Properties
  textAlign?: cg.TextAlign;
  textDecorationLine?: cg.TextDecorationLine;
  textDecorationStyle?: cg.TextDecorationStyle;
  textDecorationThickness?: cg.TextDecorationThicknessPercentage;
  textDecorationColor?: cg.TextDecorationColorValue;
  textDecorationSkipInk?: cg.TextDecorationSkipInkFlag;
  textTransform?: cg.TextTransform;
  maxLines?: number | null;
  maxLength?: number | null;
  verticalTrim?: VerticalTrim;
  fontVariations?: Record<string, number>;
  fontOpticalSizing?: cg.OpticalSizing;
  fontWeight?: number;
  fontFamily?: string;
  wordSpacing?: number;
  fontFeatures?: Partial<Record<cg.OpenTypeFeature, boolean>>;
  fontKerning?: boolean;
  fontWidth?: number;
  /**
   * required for opsz display
   */
  fontSize: number;

  // Change handlers
  onTextAlignChange?: (value: cg.TextAlign) => void;
  onTextDecorationLineChange?: (value: cg.TextDecorationLine) => void;
  onTextDecorationStyleChange?: (value: cg.TextDecorationStyle) => void;
  onTextDecorationThicknessChange?: (
    value: cg.TextDecorationThicknessPercentage
  ) => void;
  onTextDecorationColorChange?: (value: cg.TextDecorationColorValue) => void;
  onTextDecorationSkipInkChange?: (value: cg.TextDecorationSkipInkFlag) => void;
  onTextTransformChange?: (value: cg.TextTransform) => void;
  onMaxLinesChange?: (value: number) => void;
  onMaxLengthChange?: (value: number) => void;
  onVerticalTrimChange?: (value: VerticalTrim) => void;
  onFontVariationChange?: (key: string, value: number) => void;
  onFontOpticalSizingChange?: (value: cg.OpticalSizing) => void;
  onFontWeightChange?: (value: number) => void;
  onFontKerningChange?: (value: boolean) => void;
  onFontWidthChange?: (value: number) => void;
  onFontFeatureChange?: (key: cg.OpenTypeFeature, value: boolean) => void;
  onWordSpacingChange?: (change: editor.api.NumberChange) => void;
}

export function TextDetails({
  // Properties
  textAlign = "left",
  textDecorationLine = "none",
  textDecorationStyle = "solid",
  textDecorationThickness = "auto",
  textDecorationColor = { r: 0, g: 0, b: 0, a: 1 },
  textDecorationSkipInk = true,
  textTransform = "none",
  verticalTrim = "all",
  maxLines = 0,
  maxLength = null,
  fontVariations = {},
  fontOpticalSizing = "auto",
  fontWeight = 400,
  fontKerning = true,
  fontWidth,
  fontSize,
  fontFamily,
  wordSpacing = 0,
  fontFeatures = {},

  // Change handlers
  onTextAlignChange,
  onTextDecorationLineChange,
  onTextDecorationStyleChange,
  onTextDecorationThicknessChange,
  onTextDecorationColorChange,
  onTextDecorationSkipInkChange,
  onTextTransformChange,
  onVerticalTrimChange,
  onMaxLinesChange,
  onMaxLengthChange,
  onFontVariationChange,
  onFontOpticalSizingChange,
  onFontWeightChange,
  onFontKerningChange,
  onFontWidthChange,
  onFontFeatureChange,
  onWordSpacingChange,
}: TextDetailsProps) {
  const face = useCurrentFontFace();
  const [hoverPreview, setHoverPreview] = useState<
    BasicPreview | VariationPreview | FeaturePreview
  >(null);

  if (face.type === "loading") {
    return null;
  }

  const { faceAxes: axes, faceFeatures: features } = face.state;

  const truncate = !!maxLines && maxLines > 0;

  const handleHover = (
    key: PropertyKey,
    value:
      | cg.TextAlign
      | cg.TextDecorationLine
      | cg.TextTransform
      | cg.TextDecorationStyle
      | cg.TextDecorationSkipInkFlag
  ) => {
    setHoverPreview({ key, value });
  };

  const handleHoverLeave = () => {
    setHoverPreview(null);
  };

  const handleAxisHover = (axis: string) => {
    setHoverPreview({ axis });
  };

  const handleAxisHoverLeave = () => {
    setHoverPreview(null);
  };

  const handleFeatureHover = (
    feature: cg.OpenTypeFeature,
    value?: "0" | "1"
  ) => {
    setHoverPreview({ feature, value });
  };

  const handleFeatureHoverLeave = () => {
    setHoverPreview(null);
  };

  const handleFontFeatureChange = (key: cg.OpenTypeFeature, value: boolean) => {
    if (key === "kern") {
      onFontKerningChange?.(value);
    }
    onFontFeatureChange?.(key, value);
  };

  const handleTruncateToggleChange = (value: string) => {
    const isEnabled = value === "on";
    const next = isEnabled ? (maxLines && maxLines > 0 ? maxLines : 2) : 0;
    onMaxLinesChange?.(next);
  };

  const hasVariableAxes = axes && Object.keys(axes).length > 0;
  const hasFeatures = features && Object.keys(features).length > 0;
  const resolvedFontFeatures = { ...fontFeatures, kern: fontKerning };

  return (
    <div className="w-full h-full flex flex-col">
      <Tabs defaultValue="basics" className="w-full h-full flex flex-col">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-1">
          <TabsList className="w-full h-7 my-1">
            <TabsTrigger value="basics" className="text-xs">
              Basics
            </TabsTrigger>
            <TabsTrigger value="details" className="text-xs">
              Details
            </TabsTrigger>
            <TabsTrigger
              value="variable"
              className="text-xs"
              disabled={!hasVariableAxes}
            >
              Variable
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Fixed Preview */}
        <div className="flex-shrink-0 px-2">
          <Preview
            type={
              hoverPreview && "axis" in hoverPreview
                ? "axes"
                : hoverPreview && "feature" in hoverPreview
                  ? "features"
                  : "basics"
            }
            hoverPreview={hoverPreview}
            axes={axes}
            fontVariations={fontVariations}
            fontWeight={fontWeight}
            fontFamily={fontFamily}
            features={features}
            fontFeatures={fontFeatures}
          />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* Basics Tab */}
          <TabsContent value="basics" className="space-y-3 mt-3 px-2 pb-4">
            {/* Alignment */}
            <div className="space-y-2">
              <PropertyLine>
                <PropertyLineLabel>Alignment</PropertyLineLabel>
                <PropertyEnumToggle
                  enum={ALIGNMENT_OPTIONS}
                  value={textAlign}
                  className="w-full"
                  size="sm"
                  onValueChange={onTextAlignChange}
                  onValueSeeked={(value) =>
                    value
                      ? handleHover("textAlign", value as cg.TextAlign)
                      : handleHoverLeave()
                  }
                />
              </PropertyLine>
            </div>

            <Separator />

            {/* Decoration */}
            <div className="space-y-2">
              <PropertyLine>
                <PropertyLineLabel>Decoration</PropertyLineLabel>
                <PropertyEnumToggle
                  enum={DECORATION_OPTIONS}
                  value={textDecorationLine}
                  className="w-full"
                  size="sm"
                  onValueChange={onTextDecorationLineChange}
                  onValueSeeked={(value) =>
                    value
                      ? handleHover(
                          "textDecorationLine",
                          value as cg.TextDecorationLine
                        )
                      : handleHoverLeave()
                  }
                />
              </PropertyLine>
            </div>

            {/* Decoration Details - Collapsible */}
            <Collapsible className="group/collapsible">
              <CollapsibleTrigger className="w-full flex items-center justify-between">
                <PropertyLineLabel className="text-left w-auto">
                  Decoration Details
                </PropertyLineLabel>
                <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-2">
                <DecorationDetails
                  textDecorationLine={textDecorationLine}
                  textDecorationStyle={textDecorationStyle}
                  textDecorationThickness={textDecorationThickness}
                  textDecorationColor={textDecorationColor}
                  textDecorationSkipInk={textDecorationSkipInk}
                  onTextDecorationStyleChange={onTextDecorationStyleChange}
                  onTextDecorationThicknessChange={
                    onTextDecorationThicknessChange
                  }
                  onTextDecorationColorChange={onTextDecorationColorChange}
                  onTextDecorationSkipInkChange={onTextDecorationSkipInkChange}
                  onHover={handleHover}
                  onHoverLeave={handleHoverLeave}
                />
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Case (Text Transform) */}
            <div className="space-y-2">
              <PropertyLine>
                <PropertyLineLabel>Case</PropertyLineLabel>
                <PropertyEnumToggle
                  enum={CASE_OPTIONS}
                  value={textTransform}
                  className="w-full"
                  size="sm"
                  onValueChange={onTextTransformChange}
                  onValueSeeked={(value) =>
                    value
                      ? handleHover("textTransform", value as cg.TextTransform)
                      : handleHoverLeave()
                  }
                />
              </PropertyLine>
            </div>

            <Separator />

            {/* Vertical Trim */}
            <div className="space-y-2">
              <PropertyLine>
                <PropertyLineLabel>Vertical Trim</PropertyLineLabel>
                <PropertyEnumToggle
                  enum={VERTICAL_TRIM_OPTIONS}
                  value={verticalTrim}
                  className="w-full"
                  size="sm"
                  onValueChange={onVerticalTrimChange}
                />
              </PropertyLine>
            </div>

            <Separator />

            {/* Truncate Text */}
            <PropertyLine>
              <PropertyLineLabel>Truncate text</PropertyLineLabel>
              <PropertyEnumToggle
                enum={TRUNCATE_OPTIONS}
                value={truncate ? "on" : "off"}
                className="w-full"
                size="sm"
                onValueChange={handleTruncateToggleChange}
              />
            </PropertyLine>

            {/* Max Lines - only show when truncate is enabled */}
            {truncate && (
              <PropertyLine>
                <PropertyLineLabel>Max lines</PropertyLineLabel>
                <InputPropertyNumber
                  mode="fixed"
                  value={maxLines ?? undefined}
                  onValueCommit={onMaxLinesChange}
                  min={1}
                  step={1}
                  placeholder="2"
                />
              </PropertyLine>
            )}

            <Separator />

            {/* Word Spacing */}
            <div className="space-y-2">
              <PropertyLine>
                <PropertyLineLabelWithNumberGesture
                  step={0.01}
                  onValueChange={onWordSpacingChange}
                >
                  Word Spacing
                </PropertyLineLabelWithNumberGesture>
                <WordSpacingControl
                  value={wordSpacing}
                  onValueCommit={onWordSpacingChange}
                />
              </PropertyLine>
            </div>

            <Separator />

            {/* Custom Section */}
            <Collapsible className="group/collapsible">
              <CollapsibleTrigger className="w-full flex items-center justify-between">
                <PropertyLineLabel className="text-left w-auto">
                  Custom
                </PropertyLineLabel>
                <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                {/* Max Length */}
                <PropertyLine>
                  <PropertyLineLabel>Max Length</PropertyLineLabel>
                  <InputPropertyNumber
                    mode="fixed"
                    value={maxLength ?? undefined}
                    onValueCommit={onMaxLengthChange}
                    min={1}
                    step={1}
                    placeholder="No limit"
                  />
                </PropertyLine>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-3 px-2 pb-4">
            {hasFeatures && (
              <div className="space-y-4">
                <FontFeatureSettings
                  features={features}
                  fontFeatures={resolvedFontFeatures}
                  onFeatureToggleChange={handleFontFeatureChange}
                  onFeatureHover={handleFeatureHover}
                  onFeatureHoverLeave={handleFeatureHoverLeave}
                />
              </div>
            )}
            {!hasFeatures && (
              <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
                No features available
              </div>
            )}
          </TabsContent>

          {/* Variable Tab */}
          {hasVariableAxes && (
            <TabsContent value="variable" className="mt-3 px-2 pb-4">
              {Object.entries(axes)
                .sort(axes_ux_sort)
                .map(([key, axis]) => {
                  const label = axis.name ?? key;
                  if (key === "opsz") {
                    return (
                      <OpticalSizeAxis
                        key={key}
                        label={label}
                        axis={axis}
                        fontSize={fontSize}
                        fontOpticalSizing={fontOpticalSizing}
                        onFontOpticalSizingChange={onFontOpticalSizingChange}
                        onFontVariationChange={onFontVariationChange}
                        onFontWeightChange={onFontWeightChange}
                        onFontWidthChange={onFontWidthChange}
                        onHover={() => handleAxisHover(key)}
                        onHoverLeave={handleAxisHoverLeave}
                      />
                    );
                  }

                  const value = fvar.get(
                    fontVariations,
                    fontWeight,
                    fontOpticalSizing,
                    fontWidth,
                    key
                  );

                  return (
                    <div
                      className="space-y-3 pb-6 last:mb-0 transition-all duration-200"
                      key={key}
                      onPointerEnter={() => {
                        handleAxisHover(key);
                      }}
                      onPointerLeave={() => {
                        handleAxisHoverLeave();
                      }}
                    >
                      <PropertyLine>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger className="text-left">
                            <PropertyLineLabel className="w-auto">
                              {label}
                            </PropertyLineLabel>
                          </TooltipTrigger>
                          <TooltipContent side="left">{key}</TooltipContent>
                        </Tooltip>
                        <div className="w-16">
                          <InputPropertyNumber
                            mode="fixed"
                            value={value ?? axis.def}
                            onValueCommit={(v) => {
                              fvar.set(
                                key,
                                v,
                                onFontVariationChange,
                                onFontWeightChange,
                                onFontOpticalSizingChange,
                                onFontWidthChange
                              );
                            }}
                            min={axis.min}
                            max={axis.max}
                            step={1}
                          />
                        </div>
                      </PropertyLine>
                      <div>
                        <FontVariableAxisSlider
                          value={value}
                          defaultValue={axis.def}
                          max={axis.max}
                          min={axis.min}
                          step={1}
                          marks={[axis.def]}
                          className="w-full"
                          onValueChange={(value) => {
                            const v = value;
                            fvar.set(
                              key,
                              v,
                              onFontVariationChange,
                              onFontWeightChange,
                              onFontOpticalSizingChange,
                              onFontWidthChange
                            );
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}

interface OpticalSizeAxisProps {
  label: string;
  axis: any;
  fontSize: number;
  fontOpticalSizing: cg.OpticalSizing;
  onFontOpticalSizingChange?: (value: cg.OpticalSizing) => void;
  onFontVariationChange?: (key: string, value: number) => void;
  onFontWeightChange?: (value: number) => void;
  onFontWidthChange?: (value: number) => void;
  onHover: () => void;
  onHoverLeave: () => void;
}

function OpticalSizeAxis({
  label,
  axis,
  fontSize,
  fontOpticalSizing,
  onFontOpticalSizingChange,
  onFontVariationChange,
  onFontWeightChange,
  onFontWidthChange,
  onHover,
  onHoverLeave,
}: OpticalSizeAxisProps) {
  const isAuto = fontOpticalSizing === "auto";
  const autoValue = Math.min(Math.max(fontSize, axis.min), axis.max);
  const current =
    typeof fontOpticalSizing === "number" ? fontOpticalSizing : autoValue;

  return (
    <div
      className="space-y-3 pb-6 last:mb-0 transition-all duration-200"
      onPointerEnter={onHover}
      onPointerLeave={onHoverLeave}
    >
      <PropertyLine>
        <Tooltip delayDuration={200}>
          <TooltipTrigger className="text-left">
            <PropertyLineLabel className="w-auto">{label}</PropertyLineLabel>
          </TooltipTrigger>
          <TooltipContent side="left">opsz</TooltipContent>
        </Tooltip>
        <div className="w-16">
          <InputPropertyNumber
            mode="fixed"
            value={current}
            onValueCommit={(v) => {
              fvar.set(
                "opsz",
                v,
                onFontVariationChange,
                onFontWeightChange,
                onFontOpticalSizingChange,
                onFontWidthChange
              );
            }}
            min={axis.min}
            max={axis.max}
            step={1}
            disabled={isAuto}
          />
        </div>
      </PropertyLine>
      <div>
        <FontVariableAxisSlider
          value={current}
          defaultValue={axis.def}
          max={axis.max}
          min={axis.min}
          step={1}
          marks={[axis.def]}
          className="w-full"
          onValueChange={(value) => {
            fvar.set(
              "opsz",
              value,
              onFontVariationChange,
              onFontWeightChange,
              onFontOpticalSizingChange,
              onFontWidthChange
            );
          }}
        />
      </div>
      <div className="flex items-center gap-1 pt-1">
        <Checkbox
          id="opsz-auto"
          checked={isAuto}
          onCheckedChange={(checked) => {
            onFontOpticalSizingChange?.(checked ? "auto" : autoValue);
          }}
        />
        <label htmlFor="opsz-auto" className="text-xs">
          Set optical size automatically
        </label>
      </div>
    </div>
  );
}

/**
 * Sorts font variation axes for optimal UX display order.
 * Places "opsz" (optical sizing) last since it has additional controls.
 * Other axes are sorted alphabetically.
 */
const axes_ux_sort = ([a]: [string, any], [b]: [string, any]): number => {
  // Sort "opsz" to come last
  if (a === "opsz") return 1;
  if (b === "opsz") return -1;
  return a.localeCompare(b);
};

/**
 * Wrapper object to handle fontVariations with special "wght" and "opsz" axis handling
 */
const fvar = {
  get: (
    fontVariations: Record<string, number> = {},
    fontWeight: number | undefined,
    fontOpticalSizing: cg.OpticalSizing | undefined,
    fontWidth: number | undefined,
    key: string
  ): number | undefined => {
    if (key === "wght") {
      return fontWeight ?? fontVariations["wght"];
    }
    if (key === "opsz") {
      return typeof fontOpticalSizing === "number"
        ? fontOpticalSizing
        : fontVariations["opsz"];
    }
    if (key === "wdth") {
      return fontWidth ?? fontVariations["wdth"];
    }
    return fontVariations[key];
  },
  set: (
    key: string,
    value: number,
    onFontVariationChange?: (key: string, value: number) => void,
    onFontWeightChange?: (value: number) => void,
    onFontOpticalSizingChange?: (value: cg.OpticalSizing) => void,
    onFontWidthChange?: (value: number) => void
  ): void => {
    if (key === "wght") {
      onFontWeightChange?.(value);
    } else if (key === "opsz") {
      onFontOpticalSizingChange?.(value);
    } else if (key === "wdth") {
      onFontWidthChange?.(value);
    } else {
      onFontVariationChange?.(key, value);
    }
  },
};
