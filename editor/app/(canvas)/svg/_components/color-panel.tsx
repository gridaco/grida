"use client";

import { useState } from "react";
import kolor from "@grida/color";
import { HexColorPicker } from "@/components/color-picker";
import type { Paint, PaintPreviewSession, PaintValue } from "@grida/svg-editor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { cn } from "@app/ui/lib/utils";
import { ProvenanceChip } from "./provenance-chip";

type Channel = "fill" | "stroke";

/**
 * Curated solid-color presets (Tailwind 500-ish). Inline + dependency-free —
 * the agnostic `color-picker-presets.tsx` speaks `kolor` RGBA32F and pulls a
 * heavy tailwind JSON, which doesn't fit the SVG editor's string-based hex
 * paint model cleanly. A small palette is enough for a demo solid picker.
 */
const PRESET_SWATCHES = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#000000", // black
  "#6b7280", // gray
  "#ffffff", // white
] as const;

/**
 * What kind of paint the computed value resolves to. Solid colors are
 * editable through the hex input; everything else (gradient refs,
 * `currentColor`, `context-fill/stroke`) is shown read-only — picking a
 * solid in the popover replaces it.
 */
type PaintShape =
  | { kind: "none" }
  | { kind: "solid"; hex: string }
  | { kind: "nonsolid"; label: string };

function classify(value: PaintValue): PaintShape {
  const c = value.computed;
  if (!c || typeof c !== "object" || !("kind" in c)) {
    // Invalid / null computed — fall back to declared string if any.
    const declared = value.declared?.trim();
    if (!declared || declared === "none") return { kind: "none" };
    return { kind: "nonsolid", label: declared };
  }
  switch (c.kind) {
    case "none":
      return { kind: "none" };
    case "color":
      if (c.value.kind === "rgb") {
        return { kind: "solid", hex: normalizeToHex(c.value.value) };
      }
      return { kind: "nonsolid", label: "currentColor" };
    case "ref":
      return { kind: "nonsolid", label: `url(#${c.id})` };
    case "context_fill":
      return { kind: "nonsolid", label: "context-fill" };
    case "context_stroke":
      return { kind: "nonsolid", label: "context-stroke" };
  }
}

/**
 * One paint row (fill or stroke) — solid-only editor.
 *
 * Layout: `[swatch chip button] [hex input] [provenance chip]`. The chip
 * opens a popover (`HexColorPicker` + none + presets). Presentational —
 * the caller subscribes per channel (`SubscribedPaintRow`) so a fill drag
 * re-renders only the fill row.
 *
 * Scope note: this control is solid-only. Gradient create/pick affordances
 * from the previous expand-in-place row were dropped — non-solid paints
 * (gradient `url(#id)`, `currentColor`, `context-fill/stroke`) are shown
 * read-only in the input; picking a solid replaces them.
 */
export function PaintRow({
  label,
  value,
  onSetPaint,
  preview,
}: {
  label: Channel;
  value: PaintValue | null;
  onSetPaint: (paint: Paint) => void;
  /** Hook-owned preview session — see `usePaintPreview`. */
  preview: PaintPreviewSession;
}) {
  const [open, setOpen] = useState(false);

  if (!value) return null;
  const shape = classify(value);
  const provenance = value.provenance.carrier;
  const isSolid = shape.kind === "solid";
  const pickerHex = isSolid ? shape.hex : "#000000";

  // A discrete paint choice — a preset swatch, "none", or a committed hex —
  // is an absolute, atomic write. No manual discard needed: the editor
  // supersedes any in-flight picker-drag preview on the same channel (see
  // `PreviewSession`), so the popover's close-time `preview.commit()`
  // cannot replay a stale dragged value over this write.
  const commitPaint = (paint: Paint) => {
    onSetPaint(paint);
  };

  const setSolidHex = (hex: string) =>
    commitPaint({ kind: "color", value: { kind: "rgb", value: hex } });

  // hex input — controlled, validated on commit. Read-only for non-solid.
  const inputValue =
    shape.kind === "solid"
      ? shape.hex
      : shape.kind === "none"
        ? ""
        : shape.label;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Drag in the picker streams `preview.update`; closing commits the
    // gesture into a single undo step.
    if (!next) preview.commit();
  };

  return (
    <div
      className="flex items-center gap-1.5 w-full"
      data-testid={`paint-row-${label}`}
    >
      <Popover modal={false} open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`${label} paint`}
            data-testid={`paint-button-${label}`}
          >
            <Swatch shape={shape} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="left"
          sideOffset={8}
          className="w-56 p-2"
          data-testid={`paint-popover-${label}`}
        >
          <HexColorPicker
            color={pickerHex}
            onChange={(hex) =>
              preview.update({
                kind: "color",
                value: { kind: "rgb", value: hex },
              })
            }
            data-testid={`hex-picker-${label}`}
          />
          <div className="mt-2 grid grid-cols-8 gap-1">
            {PRESET_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                title={hex}
                onClick={() => setSolidHex(hex)}
                className="size-5 rounded-sm border border-border/50 cursor-pointer"
                style={{ background: hex }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => commitPaint({ kind: "none" })}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/50 cursor-pointer"
          >
            <NoneSwatch className="size-3.5" />
            none
          </button>
        </PopoverContent>
      </Popover>

      <HexTextInput
        readOnly={!isSolid}
        value={inputValue}
        placeholder={shape.kind === "none" ? "none" : "#000000"}
        onCommit={setSolidHex}
      />

      <ProvenanceChip carrier={provenance} />
    </div>
  );
}

/**
 * Controlled hex text field. Keeps free-form ephemeral text while the user
 * types; on Enter / blur it validates and commits an absolute solid color,
 * or reverts to the external value when invalid. Read-only mode just shows
 * the declared string (gradient ref / currentColor / context-*).
 */
function HexTextInput({
  value,
  placeholder,
  readOnly,
  onCommit,
}: {
  value: string;
  placeholder: string;
  readOnly: boolean;
  onCommit: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? value;

  const commit = () => {
    if (draft == null) return;
    const hex = parseHex(draft);
    if (hex) onCommit(hex);
    setDraft(null);
  };

  return (
    <input
      type="text"
      value={display}
      readOnly={readOnly}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "flex-1 min-w-0 rounded-md border bg-transparent px-2 py-1 text-xs font-mono",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        readOnly && "text-muted-foreground cursor-default"
      )}
      onChange={readOnly ? undefined : (e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Swatch({ shape }: { shape: PaintShape }) {
  if (shape.kind === "none") return <NoneSwatch />;
  if (shape.kind === "nonsolid") {
    // Neutral indicator for gradient ref / currentColor / context-*.
    return (
      <span className="inline-block size-4 rounded-sm border bg-[repeating-linear-gradient(45deg,var(--muted)_0,var(--muted)_3px,var(--background)_3px,var(--background)_6px)]" />
    );
  }
  return (
    <span
      className="inline-block size-4 rounded-sm border"
      style={{ background: shape.hex }}
    />
  );
}

function NoneSwatch({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 rounded-sm border",
        "bg-[linear-gradient(135deg,transparent_45%,#f44_45%,#f44_55%,transparent_55%),#fff]",
        className
      )}
    />
  );
}

/**
 * Normalize an arbitrary CSS color string to a `#rrggbb` hex (alpha dropped —
 * the solid picker is opaque). `@grida/color`'s resolver covers hex,
 * `rgb()/rgba()`, `hsl()/hsla()`, `hwb()`, and the full CSS named-color set;
 * falls back to black for non-colors (`none` / `currentColor`) or anything
 * it refuses (`lab()` / `oklch()` / garbage).
 */
function normalizeToHex(value: string): string {
  return kolor.resolveHEX(value)?.slice(0, 7) ?? "#000000";
}

/**
 * Parse a free-form hex draft into a canonical `#rrggbb`, or `null` when the
 * input isn't a valid 3/6-digit hex. Tolerates a missing leading `#`.
 */
function parseHex(input: string): string | null {
  const v = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) {
    return (
      "#" +
      v
        .split("")
        .map((c) => c + c)
        .join("")
    );
  }
  if (/^[0-9a-f]{6}$/.test(v)) return "#" + v;
  return null;
}
