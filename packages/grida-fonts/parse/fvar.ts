import Typr from "../typr";

export type FvarAxes = Record<string, Typr.FVARAxis>;
export interface FvarInstance {
  name: string;
  coordinates: Record<string, number>;
  flg: number;
  postscriptName: string | null;
}
export interface FvarData {
  axes: FvarAxes;
  instances: FvarInstance[];
}

export function parseFvar(buffer: ArrayBuffer): FvarData {
  const [font] = Typr.parse(buffer);
  return parseFvarTable(font);
}

export function parseFvarTable(font: Typr.FontData): FvarData {
  const axes: FvarAxes = {};
  const instances: FvarInstance[] = [];
  const fvar = font.fvar;
  if (!fvar) return { axes, instances };

  const axisRecords = fvar[0] as any[];
  for (const axis of axisRecords) {
    const [tag, min, def, max, flg, axisName] = axis as [
      string,
      number,
      number,
      number,
      number,
      string,
    ];
    axes[tag] = { tag, min, def, max, flg, name: axisName } as Typr.FVARAxis;
  }

  const tags = axisRecords.map((a: any) => a[0]) as string[];
  const nameTable = font.name || {};
  for (const inst of fvar[1] as any[]) {
    const [instName, flg, coords, pnid] = inst as [
      string,
      number,
      number[] | undefined,
      number | string | undefined,
    ];
    const coordinates: Record<string, number> = {};
    (coords || []).forEach((c, i) => {
      const tag = tags[i];
      if (tag) coordinates[tag] = c;
    });

    let postscriptName: string | null = null;
    if (typeof pnid === "number") postscriptName = nameTable["_" + pnid];

    instances.push({
      name: instName,
      coordinates,
      flg,
      postscriptName,
    } satisfies FvarInstance);
  }

  return { axes, instances };
}
