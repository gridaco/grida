import React, { useMemo, useState } from "react";
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
import { ChevronRight } from "lucide-react";

const PANGRAM_EN = "The Quick Brown Fox Jumps Over The Lazy Dog";

// Type definitions

type VerticalTrim = "all" | "disable-all";

type PropertyKey = "alignment" | "decoration" | "case" | "decorationStyle";

type HoverPreview = {
  key: PropertyKey;
  value:
    | cg.TextAlign
    | cg.TextDecorationLine
    | cg.TextTransform
    | cg.TextDecorationStyle;
} | null;

interface ParagraphPreviewProps {
  hoverPreview: HoverPreview;
}

interface PreviewProps {
  style?: React.CSSProperties;
  showPlaceholder?: boolean;
}

function Preview({ style, showPlaceholder = false }: PreviewProps) {
  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32">
      {style ? (
        <div className="text-base leading-relaxed" style={style}>
          {PANGRAM_EN}
        </div>
      ) : showPlaceholder ? (
        <span className="text-muted-foreground text-sm">Preview</span>
      ) : (
        <div className="text-base leading-relaxed">{PANGRAM_EN}</div>
      )}
    </div>
  );
}

function ParagraphPreview({ hoverPreview }: ParagraphPreviewProps) {
  const style = useMemo(() => getTextStyle(hoverPreview), [hoverPreview]);
  return <Preview style={style || undefined} showPlaceholder={!style} />;
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
              ? onHover?.("decorationStyle", value as cg.TextDecorationStyle)
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
  truncate?: boolean;
  slant?: number;
  fontWeight?: number;

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
      switch (hoverPreview.value as cg.TextDecorationLine) {
        case "underline":
          style.textDecorationLine = "underline";
          break;
        case "overline":
          style.textDecorationLine = "overline";
          break;
        case "line-through":
          style.textDecorationLine = "line-through";
          break;
        case "none":
          style.textDecorationLine = "none";
          break;
      }
      break;
    case "decorationStyle":
      // For decoration style preview, we need to combine with existing decoration
      style.textDecorationLine = "underline";
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
  truncate = false,
  maxLines = 1,
  maxLength = null,
  slant = 0,
  fontWeight = 400,

  // Change handlers
  onTextAlignChange,
  onTextDecorationLineChange,
  onTextDecorationStyleChange,
  onTextDecorationThicknessChange,
  onTextDecorationColorChange,
  onTextDecorationSkipInkChange,
  onTextTransformChange,
  onVerticalTrimChange,
  onTruncateChange,
  onMaxLinesChange,
  onMaxLengthChange,
  onSlantChange,
  onFontWeightChange,
}: TextDetailsProps) {
  const [hoverPreview, setHoverPreview] = useState<HoverPreview>(null);

  const handleHover = (
    key: PropertyKey,
    value:
      | cg.TextAlign
      | cg.TextDecorationLine
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
    <div className="w-full h-full flex flex-col">
      <Tabs defaultValue="basics" className="w-full h-full flex flex-col">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-1">
          <TabsList className="w-full h-7 my-1">
            <TabsTrigger value="basics" className="text-xs">
              Basics
            </TabsTrigger>
            <TabsTrigger value="details" className="text-xs" disabled>
              Details
            </TabsTrigger>
            <TabsTrigger value="variable" className="text-xs">
              Variable
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Fixed Preview */}
        <div className="flex-shrink-0 px-2">
          <ParagraphPreview hoverPreview={hoverPreview} />
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
                      ? handleHover("alignment", value as cg.TextAlign)
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
                          "decoration",
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
                <PropertyLineLabel className="text-left">
                  More
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
                      ? handleHover("case", value as cg.TextTransform)
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
                  placeholder="1"
                />
              </PropertyLine>
            )}

            <Separator />

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
          </TabsContent>

          {/* Details Tab - Disabled for now */}
          <TabsContent value="details" className="mt-3 px-2 pb-4">
            <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
              Details tab is disabled for now
            </div>
          </TabsContent>

          {/* Variable Tab */}
          <TabsContent value="variable" className="space-y-4 mt-3 px-2 pb-4">
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
        </div>
      </Tabs>
    </div>
  );
}
