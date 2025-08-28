import { Typr } from "../typr";

export function parseFeatures(buffer: ArrayBuffer): string[] {
  const [font] = Typr.parse(buffer);
  const gsub = font.GSUB as Record<string, unknown> | undefined;
  if (!gsub) return [];
  return Object.keys(gsub);
}

