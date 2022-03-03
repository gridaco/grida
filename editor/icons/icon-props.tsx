type Size =
  | number
  | {
      width: number;
      height: number;
    };
export interface IconProps {
  size?: Size;
  color?: string;
}

export const width = (size: Size) => flatsize(size, "width");
export const height = (size: Size) => flatsize(size, "height");

const flatsize = (size: Size, porperty: "width" | "height") => {
  if (typeof size === "number") {
    return size;
  }
  return size[porperty];
};
