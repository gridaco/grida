import parse from "color-parse";

export function quantize(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let niceFraction: number;
  if (fraction < 1.5) {
    niceFraction = 1;
  } else if (fraction < 3) {
    niceFraction = 2;
  } else if (fraction < 7) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

/**
 * @param color accepts hex, named, rgb or rgba
 * @returns [0-1] range of r, g, b, a
 *
 * returns undefined if not a valid color
 */
export function parseColor(
  color: string
): [number, number, number, number] | undefined {
  const parsed = parse(color);
  if (parsed.space === "rgb") {
    const [r, g, b] = parsed.values;
    const a = parsed.alpha ?? 1;
    return [r / 255, g / 255, b / 255, a];
  }
}
