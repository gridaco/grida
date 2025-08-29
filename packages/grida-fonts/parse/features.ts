import Typr from "../typr";
import { FEATURES } from "../k";

export interface FontFeature {
  tag: string;
  name: string;
}

export function parseFeatures(buffer: ArrayBuffer): FontFeature[] {
  const [font] = Typr.parse(buffer);
  const gsub = font.GSUB as Record<string, unknown> | undefined;
  if (!gsub) return [];
  const nameTable = font.name || {};
  return Object.keys(gsub).map((tag) => ({
    tag,
    name: (nameTable as any)[tag] || FEATURES[tag]?.name || tag,
  }));
}
