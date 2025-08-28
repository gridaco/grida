import { Typr } from "../typr";

export type FvarAxis = { min: number; max: number; def: number };
export type FvarAxes = Record<string, FvarAxis>;
export type FvarInstance = {
  name: string;
  coordinates: Record<string, number>;
};
export type FvarData = { axes: FvarAxes; instances: FvarInstance[] };

export function parseFvar(buffer: ArrayBuffer): FvarData {
  const [font] = Typr.parse(buffer);
  const axes: FvarAxes = {};
  const instances: FvarInstance[] = [];
  const fvar = font.fvar;
  if (!fvar) return { axes, instances };

  const axisRecords = fvar[0] as any[];
  for (const axis of axisRecords) {
    const [tag, min, def, max] = axis as [string, number, number, number];
    axes[tag] = { min, max, def };
  }

  const tags = axisRecords.map((a: any) => a[0]);
  for (const inst of fvar[1] as any[]) {
    const [name, _flg, coords] = inst as [string, number, number[]];
    const coordinates: Record<string, number> = {};
    (coords as number[]).forEach((c, i) => {
      const tag = tags[i];
      if (tag) coordinates[tag] = c;
    });
    instances.push({ name, coordinates });
  }

  return { axes, instances };
}
