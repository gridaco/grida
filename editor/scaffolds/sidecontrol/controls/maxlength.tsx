import { WorkbenchUI } from "@/components/workbench";
import InputPropertyNumber from "../ui/number";

export function MaxlengthControl({
  value,
  placeholder,
  onValueCommit,
  disabled,
}: {
  value?: number;
  placeholder?: string;
  onValueCommit?: (value: number | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <InputPropertyNumber
      disabled={disabled}
      mode="fixed"
      type="number"
      placeholder={placeholder}
      min={0}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
      value={value ?? ""}
      onValueCommit={onValueCommit}
    />
  );
}
