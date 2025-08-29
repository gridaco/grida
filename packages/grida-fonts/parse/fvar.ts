import { Typr } from "../typr";

export type FvarAxis = {
  min: number;
  max: number;
  def: number;
  flags: number;
  name: string;
};
export type FvarAxes = Record<string, FvarAxis>;
export type FvarInstance = {
  name: string;
  coordinates: Record<string, number>;
  flags: number;
  postscriptName?: string;
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
    const [tag, min, def, max, flags, axisName] = axis as [
      string,
      number,
      number,
      number,
      number,
      string,
    ];
    axes[tag] = { min, max, def, flags, name: axisName };
  }

  const tags = axisRecords.map((a: any) => a[0]);
  const nameTable = font.name || {};
  for (const inst of fvar[1] as any[]) {
    const [instName, flg, coords, pnid] = inst as [
      string,
      number,
      number[],
      number | string | undefined,
    ];
    const coordinates: Record<string, number> = {};
    (coords as number[]).forEach((c, i) => {
      const tag = tags[i];
      if (tag) coordinates[tag] = c;
    });

    let postscriptName: string | undefined;
    if (typeof pnid === "number") {
      postscriptName = nameTable["_" + pnid];
    } else if (typeof pnid === "string") {
      postscriptName = pnid;
    }

    const instance: FvarInstance = { name: instName, coordinates, flags: flg };
    if (postscriptName) instance.postscriptName = postscriptName;
    instances.push(instance);
  }

  return { axes, instances };
}
