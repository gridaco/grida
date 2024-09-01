import { Switch } from "@/components/ui/switch";
import { PropertyLineControlRoot } from "../ui";

export function HiddenControl({
  value,
  onValueChange,
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
}) {
  return (
    <PropertyLineControlRoot>
      <Switch checked={value} onCheckedChange={onValueChange} />
    </PropertyLineControlRoot>
  );
}
