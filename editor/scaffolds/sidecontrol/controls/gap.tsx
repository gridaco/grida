import InputPropertyNumber from "../ui/number";

export function GapControl({
  value,
  onValueCommit,
}: {
  value: { mainAxisGap: number; crossAxisGap: number };
  onValueCommit?: (
    value: number | { mainAxisGap: number; crossAxisGap: number }
  ) => void;
}) {
  return (
    <InputPropertyNumber
      mode="fixed"
      type="number"
      // TODO: individual gap control
      value={value.mainAxisGap === value.crossAxisGap ? value.mainAxisGap : ""}
      placeholder="gap"
      step={1}
      min={0}
      onValueCommit={onValueCommit}
    />
  );
}
