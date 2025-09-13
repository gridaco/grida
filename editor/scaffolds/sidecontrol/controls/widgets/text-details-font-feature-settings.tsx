import React from "react";
import { DashIcon, CheckIcon } from "@radix-ui/react-icons";
import { PropertyLine, PropertyLineLabel, PropertyEnumToggle } from "../../ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type cg from "@grida/cg";
import { Label } from "@/components/ui/label";
import { editor } from "@/grida-canvas";

// Number-related OpenType features
const NUMBER_FEATURES = [
  "afrc", // Alternative fractions
  "dnom", // Denominators
  "frac", // Fractions
  "lnum", // Lining figures
  "numr", // Numerators
  "onum", // Oldstyle figures
  "ordn", // Ordinals
  "pnum", // Proportional figures
  "sinf", // Scientific inferiors
  "subs", // Subscript
  "sups", // Superscript
  "tnum", // Tabular figures
  "zero", // Slashed zero
] as const;

// Letter case-related OpenType features
const LETTER_CASE_FEATURES = [
  "case", // Case sensitive forms
] as const;

// Horizontal spacing-related OpenType features
const HORIZONTAL_SPACING_FEATURES = [
  "cpsp", // Capital spacing
  "kern", // Kerning
] as const;

type NumberFeature = (typeof NUMBER_FEATURES)[number];
type LetterCaseFeature = (typeof LETTER_CASE_FEATURES)[number];
type HorizontalSpacingFeature = (typeof HORIZONTAL_SPACING_FEATURES)[number];

interface GroupedFeatures {
  ssxx: editor.font_spec.UIFontFaceFeature[];
  numbers: editor.font_spec.UIFontFaceFeature[];
  letterCase: editor.font_spec.UIFontFaceFeature[];
  horizontal_spacing: editor.font_spec.UIFontFaceFeature[];
  other: editor.font_spec.UIFontFaceFeature[];
}

function groupFeatures(
  features: editor.font_spec.UIFontFaceFeature[]
): GroupedFeatures {
  const ssxx = features.filter(
    (feature) => feature.tag.startsWith("ss") && /^ss\d{1,2}$/.test(feature.tag)
  );

  const numbers = features.filter((feature) =>
    NUMBER_FEATURES.includes(feature.tag as NumberFeature)
  );

  const letterCase = features.filter((feature) =>
    LETTER_CASE_FEATURES.includes(feature.tag as LetterCaseFeature)
  );

  const horizontal_spacing = features.filter((feature) =>
    HORIZONTAL_SPACING_FEATURES.includes(
      feature.tag as HorizontalSpacingFeature
    )
  );

  // Build other features by excluding already categorized features
  const categorizedFeatures = new Set([
    ...ssxx.map((f) => f.tag),
    ...numbers.map((f) => f.tag),
    ...letterCase.map((f) => f.tag),
    ...horizontal_spacing.map((f) => f.tag),
  ]);

  const other = features.filter(
    (feature) => !categorizedFeatures.has(feature.tag)
  );

  return {
    ssxx,
    numbers,
    letterCase,
    horizontal_spacing,
    other,
  };
}

interface FontFeatureToggleProps {
  feature: editor.font_spec.UIFontFaceFeature;
  enabled: boolean;
  onFeatureToggleChange?: (feature: cg.OpenTypeFeature, value: boolean) => void;
  onFeatureHover: (feature: cg.OpenTypeFeature, value?: "0" | "1") => void;
  onFeatureHoverLeave: () => void;
}

function FontFeatureToggle({
  feature,
  enabled,
  onFeatureToggleChange,
  onFeatureHover,
  onFeatureHoverLeave,
}: FontFeatureToggleProps) {
  const tag = feature.tag as cg.OpenTypeFeature;
  const label = feature.name || tag;
  const sampleText = feature.glyphs?.join(" ");
  const featureToggleOptions = [
    {
      value: "0",
      icon: <DashIcon className="size-3" />,
      label: "Off",
    },
    {
      value: "1",
      icon: <CheckIcon className="size-3" />,
      label: "On",
    },
  ];

  const handleFeatureToggleChange = (value: string) => {
    const isEnabled = value === "1";
    onFeatureToggleChange?.(tag, isEnabled);
  };

  return (
    <div className="pb-3 last:pb-0">
      <PropertyLine>
        <Tooltip delayDuration={200}>
          <TooltipTrigger className="text-left">
            <PropertyLineLabel className="w-auto">{label}</PropertyLineLabel>
          </TooltipTrigger>
          <TooltipContent side="left">
            {sampleText ? <span className="text-xs">{tag}</span> : tag}
          </TooltipContent>
        </Tooltip>
        <PropertyEnumToggle
          enum={featureToggleOptions}
          value={enabled ? "1" : "0"}
          className="w-auto"
          size="sm"
          onValueChange={handleFeatureToggleChange}
          onValueSeeked={(value) => {
            if (value) {
              onFeatureHover(tag, value as "0" | "1");
            } else {
              onFeatureHoverLeave();
            }
          }}
        />
      </PropertyLine>
    </div>
  );
}

interface FontFeatureSectionProps {
  title?: string;
  features: editor.font_spec.UIFontFaceFeature[];
  fontFeatures: Partial<Record<cg.OpenTypeFeature, boolean>>;
  onFeatureToggleChange?: (feature: cg.OpenTypeFeature, value: boolean) => void;
  onFeatureHover: (feature: cg.OpenTypeFeature, value?: "0" | "1") => void;
  onFeatureHoverLeave: () => void;
}

function FontFeatureSection({
  title,
  features,
  fontFeatures,
  onFeatureToggleChange,
  onFeatureHover,
  onFeatureHoverLeave,
}: FontFeatureSectionProps) {
  if (features.length === 0) return null;

  return (
    <div className="space-y-3">
      {title && (
        <PropertyLine>
          <Label className="text-sm font-semibold text-foreground w-auto">
            {title}
          </Label>
        </PropertyLine>
      )}
      <div>
        {features.map((feature) => {
          const tag = feature.tag as cg.OpenTypeFeature;
          const enabled = fontFeatures?.[tag] ?? false;
          return (
            <FontFeatureToggle
              key={tag}
              feature={feature}
              enabled={enabled}
              onFeatureToggleChange={onFeatureToggleChange}
              onFeatureHover={onFeatureHover}
              onFeatureHoverLeave={onFeatureHoverLeave}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FontFeatureSettingsProps {
  features: { [tag: string]: editor.font_spec.UIFontFaceFeature };
  fontFeatures: Partial<Record<cg.OpenTypeFeature, boolean>>;
  onFeatureToggleChange?: (feature: cg.OpenTypeFeature, value: boolean) => void;
  onFeatureHover: (feature: cg.OpenTypeFeature, value?: "0" | "1") => void;
  onFeatureHoverLeave: () => void;
}

export function FontFeatureSettings({
  features,
  fontFeatures,
  onFeatureToggleChange,
  onFeatureHover,
  onFeatureHoverLeave,
}: FontFeatureSettingsProps) {
  const featuresArray = Object.values(features);
  const groupedFeatures = groupFeatures(featuresArray);
  const { ssxx, numbers, letterCase, horizontal_spacing, other } =
    groupedFeatures;

  return (
    <div className="divide-y divide-border">
      <div className="py-6 first:pt-0 last:pb-0">
        <PropertyLine>
          <Label className="text-sm font-semibold text-foreground w-auto">
            Features{" "}
            <span className="text-xs text-muted-foreground">
              ({featuresArray.length})
            </span>
          </Label>
        </PropertyLine>
      </div>

      {/* Other Features Section */}
      {other.length > 0 && (
        <div className="py-6 first:pt-0 last:pb-0">
          <FontFeatureSection
            features={other}
            fontFeatures={fontFeatures}
            onFeatureToggleChange={onFeatureToggleChange}
            onFeatureHover={onFeatureHover}
            onFeatureHoverLeave={onFeatureHoverLeave}
          />
        </div>
      )}

      {/* Stylistic Sets Section */}
      {ssxx.length > 0 && (
        <div className="py-6 first:pt-0 last:pb-0">
          <FontFeatureSection
            title="Stylistic sets"
            features={ssxx}
            fontFeatures={fontFeatures}
            onFeatureToggleChange={onFeatureToggleChange}
            onFeatureHover={onFeatureHover}
            onFeatureHoverLeave={onFeatureHoverLeave}
          />
        </div>
      )}

      {/* Letter Case Section */}
      {letterCase.length > 0 && (
        <div className="py-6 first:pt-0 last:pb-0">
          <FontFeatureSection
            title="Letter case"
            features={letterCase}
            fontFeatures={fontFeatures}
            onFeatureToggleChange={onFeatureToggleChange}
            onFeatureHover={onFeatureHover}
            onFeatureHoverLeave={onFeatureHoverLeave}
          />
        </div>
      )}

      {/* Horizontal Spacing Section */}
      {horizontal_spacing.length > 0 && (
        <div className="py-6 first:pt-0 last:pb-0">
          <FontFeatureSection
            title="Horizontal spacing"
            features={horizontal_spacing}
            fontFeatures={fontFeatures}
            onFeatureToggleChange={onFeatureToggleChange}
            onFeatureHover={onFeatureHover}
            onFeatureHoverLeave={onFeatureHoverLeave}
          />
        </div>
      )}

      {/* Numbers Section */}
      {numbers.length > 0 && (
        <div className="py-6 first:pt-0 last:pb-0">
          <FontFeatureSection
            title="Numbers"
            features={numbers}
            fontFeatures={fontFeatures}
            onFeatureToggleChange={onFeatureToggleChange}
            onFeatureHover={onFeatureHover}
            onFeatureHoverLeave={onFeatureHoverLeave}
          />
        </div>
      )}
    </div>
  );
}
