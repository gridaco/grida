import Typr from "../typr";
import { FEATURES } from "../k";

export interface FontFeature {
  tag: string;
  name: string;
  tooltip?: string;
  sampleText?: string;
  paramLabels?: string[];
  lookupIndices: number[];
}

export function parseFeatures(buffer: ArrayBuffer): FontFeature[] {
  const [font] = Typr.parse(buffer);
  const gsub = font.GSUB as any;
  if (!gsub || !gsub.features) return [];
  return Object.values(gsub.features).map((f: any) => ({
    tag: f.tag,
    name: f.uiName || FEATURES[f.tag]?.name || f.tag,
    tooltip: f.tooltip,
    sampleText: f.sampleText,
    paramLabels: f.paramLabels,
    lookupIndices: f.lookups || [],
  }));
}
