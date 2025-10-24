import InputPropertyNumber from "../ui/number";

export function GapControl({
  value,
  mode = "single",
  onValueCommit,
}: {
  value: { mainAxisGap: number; crossAxisGap?: number };
  mode?: "single" | "multiple";
  onValueCommit?: (
    value: number | { mainAxisGap: number; crossAxisGap: number }
  ) => void;
}) {
  const mainAxisGap = value.mainAxisGap ?? 0;

  if (mode === "multiple") {
    return (
      <div className="flex gap-2 w-full">
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={mainAxisGap}
          placeholder="0"
          step={1}
          min={0}
          onValueCommit={(v) =>
            onValueCommit?.({
              mainAxisGap: v ?? 0,
              crossAxisGap: value.crossAxisGap ?? v ?? 0,
            })
          }
        />
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={value.crossAxisGap}
          placeholder={String(mainAxisGap)}
          step={1}
          min={0}
          onValueCommit={(v) =>
            onValueCommit?.({
              mainAxisGap,
              crossAxisGap: v ?? 0,
            })
          }
        />
      </div>
    );
  }

  return (
    <InputPropertyNumber
      mode="fixed"
      type="number"
      value={mainAxisGap}
      placeholder="gap"
      step={1}
      min={0}
      onValueCommit={onValueCommit}
    />
  );
}
