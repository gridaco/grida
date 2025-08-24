import React, { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "../utils/slider";
import { Separator } from "@/components/ui/separator";
import { PropertyLine, PropertyLineLabel, PropertyEnumToggle } from "../../ui";
import InputPropertyNumber from "../../ui/number";
import { RGBAColorControl } from "../color";
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
  DotFilledIcon,
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";

const PANGRAM_EN = "The Quick Brown Fox Jumps Over The Lazy Dog";

// Type definitions

type VerticalTrim = "all" | "disable-all";

type PropertyKey = "alignment" | "decoration" | "case" | "decorationStyle";

type HoverPreview = {
  key: PropertyKey;
  value:
    | cg.TextAlign
    | cg.TextDecoration
    | cg.TextTransform
    | cg.TextDecorationStyle;
} | null;

interface ParagraphPreviewProps {
  hoverPreview: HoverPreview;
}

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
    value: "none" as cg.TextDecoration,
    icon: <MinusIcon className="size-3" />,
    label: "None",
  },
  {
    value: "underline" as cg.TextDecoration,
    icon: <UnderlineIcon className="size-3" />,
    label: "Underline",
  },
  {
    value: "overline" as cg.TextDecoration,
    icon: <OverlineIcon className="size-3" />,
    label: "Overline",
  },
  {
    value: "line-through" as cg.TextDecoration,
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
  { value: "all" as VerticalTrim, label: "All" },
  { value: "disable-all" as VerticalTrim, label: "Disable All" },
];

// Truncate text options
const TRUNCATE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

// Decoration Style options
const DECORATION_STYLE_OPTIONS = [
  {
    value: "solid" as cg.TextDecorationStyle,
    icon: <MinusIcon className="size-3" />,
    label: "Solid",
  },
  {
    value: "double" as cg.TextDecorationStyle,
    icon: (
      <div className="flex flex-col gap-0.5">
        <MinusIcon className="size-3" />
        <MinusIcon className="size-3" />
      </div>
    ),
    label: "Double",
  },
  {
    value: "dotted" as cg.TextDecorationStyle,
    icon: (
      <div className="flex gap-0.5">
        <DotFilledIcon className="size-2" />
        <DotFilledIcon className="size-2" />
        <DotFilledIcon className="size-2" />
      </div>
    ),
    label: "Dotted",
  },
  {
    value: "dashed" as cg.TextDecorationStyle,
    icon: (
      <div className="flex gap-0.5">
        <MinusIcon className="size-2" />
        <MinusIcon className="size-2" />
        <MinusIcon className="size-2" />
      </div>
    ),
    label: "Dashed",
  },
  {
    value: "wavy" as cg.TextDecorationStyle,
    icon: (
      <div className="flex items-center">
        <svg className="size-3" viewBox="0 0 12 12" fill="currentColor">
          <path
            d="M1 6C1.5 5 2.5 5 3 6C3.5 7 4.5 7 5 6C5.5 5 6.5 5 7 6C7.5 7 8.5 7 9 6C9.5 5 10.5 5 11 6"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </div>
    ),
    label: "Wavy",
  },
];

// Skip Ink options
const SKIP_INK_OPTIONS = [
  { value: "auto" as cg.TextDecorationSkipInk, label: "Auto" },
  { value: "none" as cg.TextDecorationSkipInk, label: "None" },
];

interface DecorationDetailsProps {
  // Properties
  textDecoration?: cg.TextDecoration;
  textDecorationStyle?: cg.TextDecorationStyle;
  textDecorationThickness?: cg.TextDecorationThicknessPercentage;
  textDecorationColor?: cg.TextDecorationColorValue;
  textDecorationSkipInk?: cg.TextDecorationSkipInkFlag;

  // Change handlers
  onTextDecorationChange?: (value: cg.TextDecoration) => void;
  onTextDecorationStyleChange?: (value: cg.TextDecorationStyle) => void;
  onTextDecorationThicknessChange?: (
    value: cg.TextDecorationThicknessPercentage
  ) => void;
  onTextDecorationColorChange?: (value: cg.TextDecorationColorValue) => void;
  onTextDecorationSkipInkChange?: (value: cg.TextDecorationSkipInkFlag) => void;
}

function DecorationDetails(props: DecorationDetailsProps = {}) {
  const {
    // Properties
    textDecoration = "none",
    textDecorationStyle = "solid",
    textDecorationThickness = "auto",
    textDecorationColor = { r: 0, g: 0, b: 0, a: 1 },
    textDecorationSkipInk = true,

    // Change handlers
    onTextDecorationChange,
    onTextDecorationStyleChange,
    onTextDecorationThicknessChange,
    onTextDecorationColorChange,
    onTextDecorationSkipInkChange,
  } = props;

  const handleSkipInkToggleChange = (value: string) => {
    const isEnabled = value === "auto";
    onTextDecorationSkipInkChange?.(isEnabled);
  };

  const isUnderline = textDecoration === "underline";
  const isDecorationActive = textDecoration !== "none";

  return (
    <div className="space-y-3">
      {/* Decoration Type */}
      <div className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Decoration</PropertyLineLabel>
          <PropertyEnumToggle
            enum={DECORATION_OPTIONS}
            value={textDecoration}
            className="w-full"
            size="sm"
            onValueChange={onTextDecorationChange}
          />
        </PropertyLine>
      </div>

      {/* Style */}
      <div className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Style</PropertyLineLabel>
          <PropertyEnumToggle
            enum={DECORATION_STYLE_OPTIONS}
            value={textDecorationStyle}
            className="w-full"
            size="sm"
            disabled={!isDecorationActive}
            onValueChange={onTextDecorationStyleChange}
          />
        </PropertyLine>
      </div>

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
            disabled={!isUnderline}
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
            disabled={!isUnderline}
            onValueChange={(values) =>
              onTextDecorationThicknessChange?.(values[0])
            }
          />
        </div>
      </PropertyLine>

      {/* Skip Ink */}
      <div className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Skip Ink</PropertyLineLabel>
          <PropertyEnumToggle
            enum={SKIP_INK_OPTIONS}
            value={textDecorationSkipInk ? "auto" : "none"}
            className="w-full"
            size="sm"
            disabled={!isUnderline}
            onValueChange={handleSkipInkToggleChange}
          />
        </PropertyLine>
      </div>

      {/* Color */}
      <div className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Color</PropertyLineLabel>
          <RGBAColorControl
            value={textDecorationColor}
            onValueChange={onTextDecorationColorChange}
          />
        </PropertyLine>
      </div>
    </div>
  );
}

interface TextDetailsProps {
  // Properties
  textAlign?: cg.TextAlign;
  textDecoration?: cg.TextDecoration;
  textDecorationStyle?: cg.TextDecorationStyle;
  textDecorationThickness?: cg.TextDecorationThicknessPercentage;
  textDecorationColor?: cg.TextDecorationColorValue;
  textDecorationSkipInk?: cg.TextDecorationSkipInkFlag;
  textTransform?: cg.TextTransform;
  maxLines?: number | null;
  verticalTrim?: VerticalTrim;
  truncate?: boolean;
  slant?: number;
  fontWeight?: number;

  // Change handlers
  onTextAlignChange?: (value: cg.TextAlign) => void;
  onTextDecorationChange?: (value: cg.TextDecoration) => void;
  onTextDecorationStyleChange?: (value: cg.TextDecorationStyle) => void;
  onTextDecorationThicknessChange?: (
    value: cg.TextDecorationThicknessPercentage
  ) => void;
  onTextDecorationColorChange?: (value: cg.TextDecorationColorValue) => void;
  onTextDecorationSkipInkChange?: (value: cg.TextDecorationSkipInkFlag) => void;
  onTextTransformChange?: (value: cg.TextTransform) => void;
  onMaxLinesChange?: (value: number) => void;
  onVerticalTrimChange?: (value: VerticalTrim) => void;
  onTruncateChange?: (value: boolean) => void;
  onSlantChange?: (value: number) => void;
  onFontWeightChange?: (value: number) => void;
}

const getTextStyle = (
  hoverPreview: HoverPreview
): React.CSSProperties | null => {
  if (!hoverPreview) return null;

  const style: React.CSSProperties = {};

  switch (hoverPreview.key) {
    case "alignment":
      style.textAlign = hoverPreview.value as cg.TextAlign;
      break;
    case "decoration":
      switch (hoverPreview.value as cg.TextDecoration) {
        case "underline":
          style.textDecoration = "underline";
          break;
        case "none":
          style.textDecoration = "none";
          break;
      }
      break;
    case "decorationStyle":
      // For decoration style preview, we need to combine with existing decoration
      style.textDecorationStyle = hoverPreview.value as cg.TextDecorationStyle;
      break;
    case "case":
      switch (hoverPreview.value as cg.TextTransform) {
        case "uppercase":
          style.textTransform = "uppercase";
          break;
        case "lowercase":
          style.textTransform = "lowercase";
          break;
        case "capitalize":
          style.textTransform = "capitalize";
          break;
        case "none":
          style.textTransform = "none";
          break;
      }
      break;
  }

  return style;
};

function ParagraphPreview({ hoverPreview }: ParagraphPreviewProps) {
  const style = useMemo(() => getTextStyle(hoverPreview), [hoverPreview]);
  return (
    <div className="p-3 border rounded-md bg-muted/30 h-32">
      {style ? (
        <div className="text-sm leading-relaxed" style={style}>
          {PANGRAM_EN}
        </div>
      ) : (
        <>
          <span className="text-muted-foreground text-xs">Preview</span>
        </>
      )}
    </div>
  );
}

export function TextDetails({
  // Properties
  textAlign = "left",
  textDecoration = "none",
  textDecorationStyle = "solid",
  textDecorationThickness = "auto",
  textDecorationColor = { r: 0, g: 0, b: 0, a: 1 },
  textDecorationSkipInk = true,
  textTransform = "none",
  verticalTrim = "all",
  truncate = false,
  maxLines = 1,
  slant = 0,
  fontWeight = 400,

  // Change handlers
  onTextAlignChange,
  onTextDecorationChange,
  onTextDecorationStyleChange,
  onTextDecorationThicknessChange,
  onTextDecorationColorChange,
  onTextDecorationSkipInkChange,
  onTextTransformChange,
  onVerticalTrimChange,
  onTruncateChange,
  onMaxLinesChange,
  onSlantChange,
  onFontWeightChange,
}: TextDetailsProps) {
  const [hoverPreview, setHoverPreview] = useState<HoverPreview>(null);

  const handleHover = (
    key: PropertyKey,
    value:
      | cg.TextAlign
      | cg.TextDecoration
      | cg.TextTransform
      | cg.TextDecorationStyle
  ) => {
    setHoverPreview({ key, value });
  };

  const handleHoverLeave = () => {
    setHoverPreview(null);
  };

  const handleTruncateToggleChange = (value: string) => {
    const isEnabled = value === "on";
    onTruncateChange?.(isEnabled);
  };

  return (
    <div className="w-full">
      <Tabs defaultValue="basics" className="w-full">
        <TabsList className="w-full h-7 my-1">
          <TabsTrigger value="basics" className="text-xs">
            Basics
          </TabsTrigger>
          <TabsTrigger value="decoration" className="text-xs">
            Decoration
          </TabsTrigger>
          <TabsTrigger value="details" className="text-xs" disabled>
            Details
          </TabsTrigger>
          <TabsTrigger value="variable" className="text-xs">
            Variable
          </TabsTrigger>
        </TabsList>

        {/* Basics Tab */}
        <TabsContent value="basics" className="space-y-3 mt-3 px-2">
          {/* Preview */}
          <ParagraphPreview hoverPreview={hoverPreview} />

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
                    ? handleHover("alignment", value as cg.TextAlign)
                    : handleHoverLeave()
                }
              />
            </PropertyLine>
          </div>

          {/* Decoration */}
          <div className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Decoration</PropertyLineLabel>
              <PropertyEnumToggle
                enum={DECORATION_OPTIONS}
                value={textDecoration}
                className="w-full"
                size="sm"
                onValueChange={onTextDecorationChange}
                onValueSeeked={(value) =>
                  value
                    ? handleHover("decoration", value as cg.TextDecoration)
                    : handleHoverLeave()
                }
              />
            </PropertyLine>
          </div>

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
                    ? handleHover("case", value as cg.TextTransform)
                    : handleHoverLeave()
                }
              />
            </PropertyLine>
          </div>

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
                placeholder="1"
              />
            </PropertyLine>
          )}
        </TabsContent>

        {/* Decoration Tab */}
        <TabsContent value="decoration" className="mt-3 px-2">
          <DecorationDetails
            textDecoration={textDecoration}
            textDecorationStyle={textDecorationStyle}
            textDecorationThickness={textDecorationThickness}
            textDecorationColor={textDecorationColor}
            textDecorationSkipInk={textDecorationSkipInk}
            onTextDecorationChange={onTextDecorationChange}
            onTextDecorationStyleChange={onTextDecorationStyleChange}
            onTextDecorationThicknessChange={onTextDecorationThicknessChange}
            onTextDecorationColorChange={onTextDecorationColorChange}
            onTextDecorationSkipInkChange={onTextDecorationSkipInkChange}
          />
        </TabsContent>

        {/* Details Tab - Disabled for now */}
        <TabsContent value="details" className="mt-3 px-2">
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            Details tab is disabled for now
          </div>
        </TabsContent>

        {/* Variable Tab */}
        <TabsContent value="variable" className="space-y-4 mt-3 px-2">
          {/* Slant Slider */}
          <div className="space-y-2">
            <PropertyLine className="items-center" disabled>
              <PropertyLineLabel>Slant</PropertyLineLabel>
              <div className="flex-1">
                <Slider
                  value={[slant]}
                  max={30}
                  min={-30}
                  step={1}
                  className="w-full"
                  onValueChange={(values) => onSlantChange?.(values[0])}
                />
              </div>
            </PropertyLine>
          </div>

          {/* Weight Slider */}
          <div className="space-y-2">
            <PropertyLine className="items-center">
              <PropertyLineLabel>Weight</PropertyLineLabel>
              <div className="flex-1">
                <Slider
                  value={[fontWeight]}
                  max={900}
                  min={100}
                  step={1}
                  className="w-full"
                  onValueChange={(values) => onFontWeightChange?.(values[0])}
                />
              </div>
            </PropertyLine>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
