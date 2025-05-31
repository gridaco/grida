import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

export function RotateControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <InputPropertyNumber
      mode="auto"
      placeholder="0deg"
      value={value}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}
