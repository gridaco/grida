import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

type Border = {
  borderWidth?: number;
};

export function BorderControl({
  value,
  onValueChange,
}: {
  value?: Border;
  onValueChange?: (value?: Border) => void;
}) {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.({
      ...(value || {}),
      borderWidth: parseInt(e.target.value),
    });
  };

  return (
    <Input
      type="number"
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      value={value?.borderWidth}
      onChange={onChange}
    />
  );
}
