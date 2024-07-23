import { Slider } from "./utils/slider";
import { inputVariants } from "./utils/input-variants";
import { Input } from "@/components/ui/input";

export function OpacityControl({
  value = 1,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <div className={inputVariants({ variant: "container", size: "container" })}>
      <Input
        className={inputVariants({ size: "sm" })}
        value={value}
        type="number"
        min={0}
        max={1}
        step={0.01}
        onChange={(e) => {
          onValueChange?.(parseFloat(e.target.value));
        }}
      />
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={value ? [value] : undefined}
        onValueChange={([v]) => {
          onValueChange?.(v);
        }}
      />
    </div>
  );
}
