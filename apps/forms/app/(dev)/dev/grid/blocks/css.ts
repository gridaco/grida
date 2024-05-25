import * as Vanilla from "csstype";

type VanillaCSSProperties = Vanilla.Properties<string | number>;

export namespace DataType {
  // region extended
  export type RGB = {
    r: number;
    g: number;
    b: number;
  };

  export type RGBA = RGB & {
    a: number;
  };
  export type ColorObject = RGB | RGBA;
  // endregion extended

  export type Color = Vanilla.DataType.Color | ColorObject;
}

// @ts-ignore
export interface Properties extends VanillaCSSProperties {
  color?: Vanilla.Globals | DataType.Color;
  backgroundColor?: Vanilla.Globals | DataType.Color;
  borderColor?: Vanilla.Globals | DataType.Color;
}

export function parse(properties: Properties): VanillaCSSProperties {
  const { color, backgroundColor, borderColor, ...rest } = properties;
  return {
    ...rest,
    color: color ? parseColor(color) : undefined,
    backgroundColor: backgroundColor ? parseColor(backgroundColor) : undefined,
    borderColor: borderColor ? parseColor(borderColor) : undefined,
  };
}

export function parseColor(
  color?: DataType.Color
): Vanilla.DataType.Color | undefined {
  if (typeof color === "object") {
    if ("r" in color && "a" in color) {
      return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }
    if ("r" in color) {
      return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
  }
  return color;
}
