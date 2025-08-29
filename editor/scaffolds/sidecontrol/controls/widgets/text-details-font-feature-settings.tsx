import React from "react";
import { DashIcon, CheckIcon } from "@radix-ui/react-icons";
import { PropertyLine, PropertyLineLabel, PropertyEnumToggle } from "../../ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type cg from "@grida/cg";
import type { FontFeature } from "@grida/fonts/parse";
import { Label } from "@/components/ui/label";

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

type NumberFeature = (typeof NUMBER_FEATURES)[number];

interface GroupedFeatures {
  ssxx: FontFeature[];
  numbers: FontFeature[];
  other: FontFeature[];
}

function groupFeatures(features: FontFeature[]): GroupedFeatures {
  const ssxx = features.filter(
    (feature) => feature.tag.startsWith("ss") && /^ss\d{1,2}$/.test(feature.tag)
  );

  const numbers = features.filter((feature) =>
    NUMBER_FEATURES.includes(feature.tag as NumberFeature)
  );

  const other = features
    .filter(
      (feature) =>
        !feature.tag.startsWith("ss") || !/^ss\d{1,2}$/.test(feature.tag)
    )
    .filter(
      (feature) => !NUMBER_FEATURES.includes(feature.tag as NumberFeature)
    );

  return {
    ssxx,
    numbers,
    other,
  };
}

interface FontFeatureToggleProps {
  feature: FontFeature;
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
  const sampleText = feature.sampleText;
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
            {sampleText ? (
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs">{tag}</span>
                <span className="text-sm font-medium">{sampleText}</span>
              </div>
            ) : (
              tag
            )}
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
  title: string;
  features: FontFeature[];
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
      <PropertyLine>
        <Label className="text-sm font-semibold text-foreground w-auto">
          {title}
        </Label>
      </PropertyLine>
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
  features: FontFeature[];
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
  const groupedFeatures = groupFeatures(features);
  const { ssxx, numbers, other } = groupedFeatures;

  return (
    <div className="divide-y divide-border">
      {/* Other Features Section */}
      <div className="py-6 first:pt-0 last:pb-0">
        <FontFeatureSection
          title="Features"
          features={other}
          fontFeatures={fontFeatures}
          onFeatureToggleChange={onFeatureToggleChange}
          onFeatureHover={onFeatureHover}
          onFeatureHoverLeave={onFeatureHoverLeave}
        />
      </div>

      {/* Stylistic Sets Section */}
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

      {/* Numbers Section */}
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
    </div>
  );
}
