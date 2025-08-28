import { Typr } from "../typr";

export type FvarAxis = { min: number; max: number; def: number };
export type FvarAxes = Record<string, FvarAxis>;

export function parseFvar(buffer: ArrayBuffer): FvarAxes {
  const [font] = Typr.parse(buffer);
  const axes: FvarAxes = {};
  const fvar = font.fvar;
  if (!fvar) return axes;
  for (const axis of fvar[0]) {
    const [tag, min, def, max] = axis as [string, number, number, number];
    axes[tag] = { min, max, def };
  }
  return axes;
}

