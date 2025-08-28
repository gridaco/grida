import React, { useMemo } from "react";
import type cg from "@grida/cg";
import { FEATURES } from "@grida/fonts/k";

const PANGRAM_EN = "The Quick Brown Fox Jumps Over The Lazy Dog";

type BasicPropertyKey =
  | "textAlign"
  | "textDecorationLine"
  | "textTransform"
  | "textDecorationStyle"
  | "textDecorationSkipInk";

type BasicPreview = {
  key: BasicPropertyKey;
  value:
    | cg.TextAlign
    | cg.TextDecorationLine
    | cg.TextTransform
    | cg.TextDecorationStyle
    | cg.TextDecorationSkipInkFlag;
} | null;

type VariationPreview = {
  axis: string;
} | null;

type FeaturePreview = {
  feature: cg.OpenTypeFeature;
} | null;

interface BasicsPreviewProps {
  style?: React.CSSProperties;
  showPlaceholder?: boolean;
}

interface AxesPreviewProps {
  axes: Record<
    string,
    {
      min: number;
      max: number;
      def: number;
    }
  >;
  fontVariations?: Record<string, number>;
  fontWeight?: number;
  fontFamily?: string;
}

interface PreviewProps {
  // Preview state
  hoverPreview?: BasicPreview | VariationPreview | FeaturePreview;

  // Axes preview props
  axes?: Record<
    string,
    {
      min: number;
      max: number;
      def: number;
    }
  >;
  fontVariations?: Record<string, number>;
  fontWeight?: number;
  fontFamily?: string;

  // Features preview props
  features?: cg.OpenTypeFeature[];
  fontFeatures?: Partial<Record<cg.OpenTypeFeature, boolean>>;

  // Type indicator
  type: "basics" | "axes" | "features";
}

const getTextStyle = (
  hoverPreview: BasicPreview
): React.CSSProperties | null => {
  if (!hoverPreview) return null;

  const style: React.CSSProperties = {};

  switch (hoverPreview.key) {
    case "textAlign":
      style.textAlign = hoverPreview.value as cg.TextAlign;
      break;
    case "textDecorationLine":
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
    case "textDecorationStyle":
      // For decoration style preview, we need to combine with existing decoration
      style.textDecorationLine = "underline";
      style.textDecorationStyle = hoverPreview.value as cg.TextDecorationStyle;
      break;
    case "textDecorationSkipInk":
      // For skip ink preview, we need to combine with existing decoration
      style.textDecorationLine = "underline";
      style.textDecorationSkipInk =
        (hoverPreview.value as cg.TextDecorationSkipInkFlag) ? "auto" : "none";
      break;
    case "textTransform":
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

function BasicsPreview({ style, showPlaceholder = false }: BasicsPreviewProps) {
  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32 overflow-hidden">
      {style ? (
        <div
          className="text-base leading-relaxed overflow-hidden text-ellipsis"
          style={style}
        >
          {PANGRAM_EN}
        </div>
      ) : showPlaceholder ? (
        <span className="text-muted-foreground text-sm">Preview</span>
      ) : (
        <div className="text-base leading-relaxed overflow-hidden text-ellipsis">
          {PANGRAM_EN}
        </div>
      )}
    </div>
  );
}

function AxesPreview({
  axes,
  fontVariations = {},
  fontWeight,
  fontFamily,
  hoveredAxis,
}: AxesPreviewProps & {
  hoveredAxis: string | null;
}) {
  if (!hoveredAxis) {
    return (
      <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-center overflow-hidden">
        <span className="text-muted-foreground text-sm">Preview</span>
      </div>
    );
  }

  const axis = axes[hoveredAxis];
  if (!axis) return null;

  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-center gap-8 overflow-hidden">
      <span
        className="text-6xl font-medium overflow-hidden"
        style={{
          fontFamily,
          fontVariationSettings: `"${hoveredAxis}" ${axis.min}`,
        }}
      >
        R
      </span>
      <span
        className="text-6xl font-medium overflow-hidden"
        style={{
          fontFamily,
          fontVariationSettings: `"${hoveredAxis}" ${axis.def}`,
        }}
      >
        R
      </span>
      <span
        className="text-6xl font-medium overflow-hidden"
        style={{
          fontFamily,
          fontVariationSettings: `"${hoveredAxis}" ${axis.max}`,
        }}
      >
        R
      </span>
    </div>
  );
}

function FeaturesPreview({
  fontFamily,
  fontWeight,
  hoveredFeature,
  features = [],
  fontFeatures = {},
}: {
  fontFamily?: string;
  fontWeight?: number;
  hoveredFeature: cg.OpenTypeFeature | null;
  features?: cg.OpenTypeFeature[];
  fontFeatures?: Partial<Record<cg.OpenTypeFeature, boolean>>;
}) {
  if (!hoveredFeature) {
    return (
      <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-center overflow-hidden">
        <span className="text-muted-foreground text-sm">Preview</span>
      </div>
    );
  }

  const featureInfo = FEATURES[hoveredFeature];
  const demoText = featureInfo?.demo || "Ag123456789";

  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-center gap-8 overflow-hidden">
      <div
        className="text-2xl font-medium overflow-hidden"
        style={{
          fontFamily,
          fontWeight,
          fontFeatureSettings: `"${hoveredFeature}" off`,
        }}
      >
        {demoText}
      </div>
      <div
        className="text-2xl font-medium overflow-hidden"
        style={{
          fontFamily,
          fontWeight,
          fontFeatureSettings: `"${hoveredFeature}" on`,
        }}
      >
        {demoText}
      </div>
    </div>
  );
}

function Preview(props: PreviewProps) {
  if (props.type === "basics") {
    const basicPreview = props.hoverPreview as BasicPreview;
    const style = useMemo(
      () => getTextStyle(basicPreview || null),
      [basicPreview]
    );
    return (
      <BasicsPreview
        style={style || undefined}
        showPlaceholder={!basicPreview}
      />
    );
  } else if (props.type === "axes") {
    const axesPreview = props.hoverPreview as VariationPreview;
    return (
      <AxesPreview
        axes={props.axes!}
        fontVariations={props.fontVariations}
        fontWeight={props.fontWeight}
        fontFamily={props.fontFamily}
        hoveredAxis={axesPreview?.axis ?? null}
      />
    );
  } else if (props.type === "features") {
    const featurePreview = props.hoverPreview as FeaturePreview;
    return (
      <FeaturesPreview
        fontFamily={props.fontFamily}
        fontWeight={props.fontWeight}
        hoveredFeature={featurePreview?.feature ?? null}
        features={props.features}
        fontFeatures={props.fontFeatures}
      />
    );
  }
  return null;
}

export {
  Preview,
  type BasicPreview,
  type VariationPreview,
  type FeaturePreview,
  type BasicPropertyKey as PropertyKey,
};
