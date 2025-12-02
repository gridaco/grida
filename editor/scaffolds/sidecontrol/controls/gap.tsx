import InputPropertyNumber from "../ui/number";

export function GapControl({
  value,
  mode = "single",
  onValueCommit,
}: {
  value: { main_axis_gap: number; cross_axis_gap?: number };
  mode?: "single" | "multiple";
  onValueCommit?: (
    value: number | { main_axis_gap: number; cross_axis_gap: number }
  ) => void;
}) {
  const mainAxisGap = value.main_axis_gap ?? 0;

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
              main_axis_gap: v ?? 0,
              cross_axis_gap: value.cross_axis_gap ?? v ?? 0,
            })
          }
        />
        <InputPropertyNumber
          mode="fixed"
          type="number"
          value={value.cross_axis_gap}
          placeholder={String(mainAxisGap)}
          step={1}
          min={0}
          onValueCommit={(v) =>
            onValueCommit?.({
              main_axis_gap: mainAxisGap,
              cross_axis_gap: v ?? 0,
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
