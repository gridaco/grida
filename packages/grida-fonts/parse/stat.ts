import Typr from "../typr";

export interface StatAxis extends Typr.STATAxisRecord {
  values: Typr.STATAxisValue[];
}

export interface StatCombination
  extends Pick<Typr.STATAxisValueFormat4, "format" | "name" | "flags"> {
  values: { tag: string; value: number }[];
}

export interface StatData {
  axes: StatAxis[];
  combinations: StatCombination[];
  elidedFallbackName?: string;
}

export function parseStat(buffer: ArrayBuffer): StatData {
  const [font] = Typr.parse(buffer);
  const stat = font.STAT as Typr.STATTable | undefined;
  const axes: StatAxis[] = [];
  const combinations: StatCombination[] = [];
  if (!stat) return { axes, combinations, elidedFallbackName: undefined };

  stat.designAxes.forEach((a, i) => {
    axes[i] = { ...a, values: [] };
  });

  stat.axisValues.forEach((v) => {
    if (v.format === 4) {
      combinations.push({
        format: 4,
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
      axis.values.push(v);
    }
  });

  const elidedFallbackName = stat.elidedFallbackNameID
    ? font.name?.["_" + stat.elidedFallbackNameID]
    : undefined;

  return { axes, combinations, elidedFallbackName };
}
