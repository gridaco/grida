"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { useState } from "react";
import { cn } from "@app/ui/lib/utils";
import styles from "./native-effort-slider.module.css";

/** Discrete effort positions, with the selected label supplied by the picker. */
export function NativeEffortSlider({
  labels,
  value,
  onValueChange,
}: {
  labels: readonly string[];
  value: number;
  onValueChange: (value: number) => void;
}) {
  // Keep motion continuous while the selected effort follows the nearest step.
  const [draft, setDraft] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [animated, setAnimated] = useState(false);
  const position = draft ?? value;
  const fraction = position / (labels.length - 1);
  const finish = () => {
    setDragging(false);
    setDraft(null);
  };
  return (
    <SliderPrimitive.Root
      className={cn(
        styles.slider,
        "relative flex h-[var(--effort-thumb-size)] w-full touch-none items-center select-none"
      )}
      dir="ltr"
      data-animated={animated || undefined}
      data-dragging={dragging || undefined}
      min={0}
      max={labels.length - 1}
      step={0.001}
      value={[position]}
      onPointerDown={(event) => {
        const thumb =
          event.currentTarget.querySelector<HTMLElement>('[role="slider"]');
        if (event.button !== 0) {
          event.preventDefault();
          return;
        }
        setAnimated(true);
        if (thumb?.contains(event.target as Node)) {
          setDragging(true);
          return;
        }
        // Prevent Radix from capturing a track press and beginning a drag.
        event.preventDefault();
        finish();
        const track = event.currentTarget.getBoundingClientRect();
        const inset = (thumb?.getBoundingClientRect().width ?? 0) / 2;
        const travel = track.width - inset * 2;
        if (travel <= 0) return;
        const target = (event.clientX - track.left - inset) / travel;
        const next = Math.round(
          Math.max(0, Math.min(1, target)) * (labels.length - 1)
        );
        thumb?.focus({ preventScroll: true });
        onValueChange(next);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onValueChange={([next]) => {
        if (next === undefined) return;
        setDraft(next);
        const step = Math.round(next);
        if (step !== value) onValueChange(step);
      }}
      onValueCommit={finish}
      onKeyDown={(event) => {
        const targets: Record<string, number> = {
          ArrowRight: value + 1,
          ArrowUp: value + 1,
          PageUp: value + 1,
          ArrowLeft: value - 1,
          ArrowDown: value - 1,
          PageDown: value - 1,
          Home: 0,
          End: labels.length - 1,
        };
        const next = targets[event.key];
        if (next === undefined) return;
        event.preventDefault();
        setAnimated(true);
        finish();
        onValueChange(Math.max(0, Math.min(labels.length - 1, next)));
      }}
    >
      <SliderPrimitive.Track className="relative h-6 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/5 ring-inset">
        {/* Match Radix's inset thumb center, including at either endpoint. */}
        <span
          data-effort-range=""
          className="absolute left-0 h-full bg-foreground"
          style={{
            right: `calc(${(1 - fraction) * 100}% + var(--effort-thumb-size) * ${fraction - 0.5})`,
          }}
        />
      </SliderPrimitive.Track>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[calc(var(--effort-thumb-size)/2)] flex items-center justify-between"
      >
        {labels.map((label, index) => (
          <span
            key={label}
            className={cn(
              "size-1 rounded-full",
              index < position ? "bg-background/40" : "bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
      <SliderPrimitive.Thumb
        aria-label="Effort"
        aria-valuenow={Math.round(position)}
        aria-valuetext={labels[Math.round(position)]}
        className={cn(
          styles.thumb,
          "relative block size-[var(--effort-thumb-size)] rounded-full border border-border bg-background shadow-sm ring-ring/50 outline-none focus-visible:ring-4"
        )}
      />
    </SliderPrimitive.Root>
  );
}
