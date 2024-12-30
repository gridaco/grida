import { Switch } from "./utils/switch";

export function SwitchControl({
  value,
  onValueChange,
  disabled,
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      disabled={disabled}
      checked={value}
      onCheckedChange={onValueChange}
    />
  );
}
