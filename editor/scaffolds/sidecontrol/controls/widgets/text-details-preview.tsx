import React, { useMemo } from "react";
import type cg from "@grida/cg";
import type { FontFeature } from "@grida/fonts/parse";
import type Typr from "@grida/fonts/typr";
import { editor } from "@/grida-canvas";

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
  value?: "0" | "1";
} | null;

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
  axes?: Record<string, editor.font_spec.UIFontFaceAxis>;
  fontVariations?: Record<string, number>;
  fontWeight?: number;
  fontFamily?: string;

  // Features preview props
  features?: { [tag: string]: editor.font_spec.UIFontFaceFeature };
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

function BasicsPreview({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-start overflow-hidden">
      <div
        className="text-base leading-relaxed overflow-hidden text-ellipsis"
        style={style}
      >
        {PANGRAM_EN}
      </div>
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
  const axis = axes[hoveredAxis!];
  if (!hoveredAxis || !axis) return null;

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
  features = {},
  selectedValue,
}: {
  fontFamily?: string;
  fontWeight?: number;
  hoveredFeature: cg.OpenTypeFeature | null;
  features?: { [tag: string]: editor.font_spec.UIFontFaceFeature };
  selectedValue?: "0" | "1";
}) {
  if (!hoveredFeature || !selectedValue) return null;

  const feature = features[hoveredFeature];
  const demoText = feature?.glyphs?.join(" ");

  if (!demoText) return null;

  const style: React.CSSProperties = {
    fontFamily,
    fontWeight,
    fontFeatureSettings: `"${hoveredFeature}" ${selectedValue}`,
  };

  return (
    <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-start overflow-hidden">
      <div className="text-2xl font-medium break-words" style={style}>
        {demoText}
      </div>
    </div>
  );
}

function Preview(props: PreviewProps) {
  // Check if we have data to show
  let hasPreviewText = false;

  if (props.type === "basics") {
    hasPreviewText = !!props.hoverPreview;
  } else if (props.type === "axes") {
    const axesPreview = props.hoverPreview as VariationPreview;
    hasPreviewText = !!axesPreview?.axis && !!props.axes?.[axesPreview.axis];
  } else if (props.type === "features") {
    const featurePreview = props.hoverPreview as FeaturePreview;
    if (featurePreview?.feature && featurePreview?.value) {
      const feature = props.features?.[featurePreview.feature];
      hasPreviewText = !!feature?.glyphs?.join(" ");
    }
  }

  // Show placeholder if no data
  if (!hasPreviewText) {
    return (
      <div className="p-4 border rounded-md bg-muted/30 h-32 flex items-center justify-start overflow-hidden">
        <span className="text-muted-foreground text-sm">Preview</span>
      </div>
    );
  }

  // Render specific preview components
  if (props.type === "basics") {
    const basicPreview = props.hoverPreview as BasicPreview;
    const style = useMemo(
      () => getTextStyle(basicPreview || null),
      [basicPreview]
    );
    return <BasicsPreview style={style || undefined} />;
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
        selectedValue={featurePreview?.value}
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
