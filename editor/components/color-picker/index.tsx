// export declare const HexColorPicker: (props: Partial<ColorPickerBaseProps<string>>) => JSX.Element;
import {
  HexColorPicker,
  HslStringColorPicker,
  HsvStringColorPicker,
  HsvaStringColorPicker,
  RgbStringColorPicker,
  RgbaStringColorPicker,
} from "react-colorful";

type ColorPickerHTMLAttributes = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "color" | "onChange" | "onChangeCapture"
>;
export interface ColorPickerBaseProps<
  T extends string,
> extends ColorPickerHTMLAttributes {
  color: T;
  onChange: (newColor: T) => void;
}

export function OklchColorPicker(props: Partial<ColorPickerBaseProps<string>>) {
  throw new Error("OklchColorPicker is not implemented");
}

export {
  HexColorPicker,
  HslStringColorPicker,
  HsvStringColorPicker,
  HsvaStringColorPicker,
  RgbStringColorPicker,
  RgbaStringColorPicker,
};

export const pickers = {
  hex: HexColorPicker,
  hsl: HslStringColorPicker,
  hsv: HsvStringColorPicker,
  hsva: HsvaStringColorPicker,
  rgb: RgbStringColorPicker,
  rgba: RgbaStringColorPicker,
  noop: () => null,
};
