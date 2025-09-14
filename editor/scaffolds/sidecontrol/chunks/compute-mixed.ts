import grida from "@grida/schema";

export function computeMixed(
  values: number[]
): typeof grida.mixed | number | "" {
  if (values.length === 0) return "";
  const first = values[0];
  return values.every((v) => v === first) ? first : grida.mixed;
}
