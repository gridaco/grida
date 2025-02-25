import { RGBAColorControl, RGBAColorControlProps } from "./color";

export function TextColorControl({
  value,
  onValueChange,
}: RGBAColorControlProps) {
  return <RGBAColorControl value={value} onValueChange={onValueChange} />;
}
