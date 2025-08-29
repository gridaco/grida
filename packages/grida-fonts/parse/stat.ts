import { Typr } from "../typr";

export interface StatAxisValue {
  value: number;
  name: string;
  flags: number;
  linkedValue?: number;
  range?: [number, number];
}

export interface StatAxis {
  tag: string;
  name: string;
  ordering: number;
  values: StatAxisValue[];
}

export interface StatCombination {
  name: string;
  flags: number;
  values: { tag: string; value: number }[];
}

export interface StatData {
  axes: StatAxis[];
  combinations: StatCombination[];
  elidedFallbackName?: string;
}

export function parseStat(buffer: ArrayBuffer): StatData {
  const [font] = Typr.parse(buffer);
  const stat = font.STAT;
  const axes: StatAxis[] = [];
  const combinations: StatCombination[] = [];
  if (!stat) return { axes, combinations, elidedFallbackName: undefined };

  stat.designAxes.forEach((a, i) => {
    axes[i] = { tag: a.tag, name: a.name, ordering: a.ordering, values: [] };
  });

  stat.axisValues.forEach((v) => {
    if (v.format === 4) {
      combinations.push({
        name: v.name,
        flags: v.flags,
        values: v.axisValues.map((av) => ({
          tag: axes[av.axisIndex]?.tag || "",
          value: av.value,
        })),
      });
    } else {
      const axis = axes[v.axisIndex];
      if (!axis) return;
      const val: StatAxisValue = {
        name: v.name,
        flags: v.flags,
        value: (v as any).value ?? (v as any).nominalValue,
      };
      if (v.format === 2) {
        val.range = [v.rangeMinValue, v.rangeMaxValue];
      }
      if (v.format === 3) {
        val.linkedValue = v.linkedValue;
      }
      axis.values.push(val);
    }
  });

  const elidedFallbackName = stat.elidedFallbackNameID
    ? font.name?.["_" + stat.elidedFallbackNameID]
    : undefined;

  return { axes, combinations, elidedFallbackName };
}
