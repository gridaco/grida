import React, { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { PropertyLine, PropertyLineLabel, PropertyEnumToggle } from "../../ui";
import InputPropertyNumber from "../../ui/number";
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
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";

const PANGRAM_EN = "The Quick Brown Fox Jumps Over The Lazy Dog";

// Type definitions

type VerticalTrim = "all" | "disable-all";

type PropertyKey = "alignment" | "decoration" | "case";

type HoverPreview = {
  key: PropertyKey;
  value: cg.TextAlign | cg.TextDecoration | cg.TextTransform;
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

interface TextDetailsProps {
  // Properties
  alignment?: cg.TextAlign;
  decoration?: cg.TextDecoration;
  case?: cg.TextTransform;
  verticalTrim?: VerticalTrim;
  truncate?: boolean;
  maxLines?: number | null;
  slant?: number;
  weight?: number;

  // Change handlers
  onAlignmentChange?: (value: cg.TextAlign) => void;
  onDecorationChange?: (value: cg.TextDecoration) => void;
  onCaseChange?: (value: cg.TextTransform) => void;
  onVerticalTrimChange?: (value: VerticalTrim) => void;
  onTruncateChange?: (value: boolean) => void;
  onMaxLinesChange?: (value: number) => void;
  onSlantChange?: (value: number) => void;
  onWeightChange?: (value: number) => void;
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

export function TextDetails(props: TextDetailsProps = {}) {
  const {
    // Properties
    alignment = "left",
    decoration = "none",
    case: textCase = "none",
    verticalTrim = "all",
    truncate = false,
    maxLines = 1,
    slant = 0,
    weight = 400,

    // Change handlers
    onAlignmentChange,
    onDecorationChange,
    onCaseChange,
    onVerticalTrimChange,
    onTruncateChange,
    onMaxLinesChange,
    onSlantChange,
    onWeightChange,
  } = props;

  const [hoverPreview, setHoverPreview] = useState<HoverPreview>(null);

  const handleHover = (
    key: PropertyKey,
    value: cg.TextAlign | cg.TextDecoration | cg.TextTransform
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
        <TabsList className="w-full h-7">
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
                value={alignment}
                className="w-full"
                size="sm"
                onValueChange={onAlignmentChange}
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
                value={decoration}
                className="w-full"
                size="sm"
                onValueChange={onDecorationChange}
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
                value={textCase}
                className="w-full"
                size="sm"
                onValueChange={onCaseChange}
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
            <PropertyLine>
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
            <PropertyLine>
              <PropertyLineLabel>Weight</PropertyLineLabel>
              <div className="flex-1">
                <Slider
                  value={[weight]}
                  max={900}
                  min={100}
                  step={1}
                  className="w-full"
                  onValueChange={(values) => onWeightChange?.(values[0])}
                />
              </div>
            </PropertyLine>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
