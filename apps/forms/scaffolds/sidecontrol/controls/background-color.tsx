import { RGBAColorControl, RGBAColorControlProps } from "./color";

export function BackgroundColorControl({
  value,
  onValueChange,
}: RGBAColorControlProps) {
  return <RGBAColorControl value={value} onValueChange={onValueChange} />;
}
