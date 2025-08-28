import { Typr } from "../typr";
import type { FontSource } from "../fontface";

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

export async function fetchFvar(
  source: FontSource,
  opts: { fetch?: typeof fetch } = {}
): Promise<FvarAxes> {
  let buffer: ArrayBuffer;
  if (source.kind === "url") {
    const res = await (opts.fetch ?? fetch)(source.url);
    buffer = await res.arrayBuffer();
  } else if (source.kind === "buffer") {
    buffer = source.bytes;
  } else {
    buffer = await source.file.arrayBuffer();
  }
  return parseFvar(buffer);
}
