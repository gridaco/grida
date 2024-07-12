import { Slider } from "@/components/ui/slider";

export function OpacityControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <Slider
      min={0}
      max={1}
      step={0.01}
      value={value ? [value] : undefined}
      onValueChange={([v]) => {
        onValueChange?.(v);
      }}
    />
  );
}
