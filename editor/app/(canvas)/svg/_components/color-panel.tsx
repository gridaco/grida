"use client";

import { useState } from "react";
import { HexColorPicker } from "@/components/color-picker";
import type {
  GradientDefinition,
  GradientEntry,
  Paint,
  PaintPreviewSession,
  PaintValue,
} from "@grida/svg-editor";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { ProvenanceChip } from "./provenance-chip";

type Channel = "fill" | "stroke";

/**
 * One paint row (fill or stroke). Presentational — the caller passes
 * `value` and gradients; the caller is responsible for subscribing per
 * channel so a fill drag re-renders only the fill row.
 */
export function PaintRow({
  label,
  value,
  gradients,
  onSetPaint,
  preview,
  onCreateGradient,
}: {
  label: Channel;
  value: PaintValue | null;
  gradients: ReadonlyArray<GradientEntry>;
  onSetPaint: (paint: Paint) => void;
  /** Hook-owned preview session — see `usePaintPreview`. */
  preview: PaintPreviewSession;
  onCreateGradient: (def: GradientDefinition) => { gradient_id: string };
}) {
  const [open, setOpen] = useState(false);

  if (!value) return null;
  const declared = value.declared ?? "(none)";
  const display_hex = readHex(value);
  const provenance = value.provenance.carrier;

  const onChange = (hex: string) =>
    preview.update({ kind: "color", value: { kind: "rgb", value: hex } });

  const close = () => {
    setOpen(false);
    preview.commit();
  };

  const setNone = () => {
    preview.commit();
    onSetPaint({ kind: "none" });
  };

  return (
    <div className="w-full">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 w-full p-1.5 text-xs border rounded-md bg-background hover:bg-muted/50 cursor-pointer"
        data-testid={`paint-button-${label}`}
      >
        <Swatch value={display_hex} declared={declared} />
        <span className="font-mono">{label}</span>
        <span className="ms-auto text-muted-foreground truncate max-w-[100px]">
          {declared}
        </span>
        <ProvenanceChip carrier={provenance} />
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <HexColorPicker
            color={display_hex}
            onChange={onChange}
            data-testid={`hex-picker-${label}`}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={setNone}
            >
              none
            </Button>
            <Button size="sm" className="ms-auto h-7 text-xs" onClick={close}>
              done
            </Button>
          </div>
          {gradients.length > 0 && (
            <div className="mt-1">
              <div className="text-[10px] text-muted-foreground mb-1">
                Gradients
              </div>
              <div className="flex flex-wrap gap-1">
                {gradients.map((g) => (
                  <Button
                    key={g.id}
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] font-mono"
                    onClick={() => onSetPaint({ kind: "ref", id: g.id })}
                  >
                    url(#{g.id})
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              onCreateGradient({
                kind: "linear",
                stops: [
                  { offset: 0, color: "#ff6b35" },
                  { offset: 1, color: "#7fb8e0" },
                ],
              })
            }
          >
            + New linear gradient
          </Button>
        </div>
      )}
    </div>
  );
}

function Swatch({ value, declared }: { value: string; declared: string }) {
  const isNone = declared === "none" || declared === "(none)" || !declared;
  return (
    <span
      className={cn(
        "inline-block w-4 h-4 rounded-sm border",
        isNone &&
          "bg-[linear-gradient(135deg,transparent_45%,#f44_45%,#f44_55%,transparent_55%),#fff]"
      )}
      style={isNone ? undefined : { background: value }}
    />
  );
}

function readHex(value: PaintValue): string {
  const c = value.computed;
  if (
    c &&
    typeof c === "object" &&
    "kind" in c &&
    c.kind === "color" &&
    c.value.kind === "rgb"
  ) {
    return normalizeToHex(c.value.value);
  }
  return "#000000";
}

function normalizeToHex(value: string): string {
  if (!value) return "#000000";
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "currentcolor" || v === "transparent")
    return "#000000";
  if (v.startsWith("#")) {
    if (v.length === 4) {
      return (
        "#" +
        v
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      );
    }
    if (v.length === 7) return v;
  }
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, "0");
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }
  const named: Record<string, string> = {
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    black: "#000000",
    white: "#ffffff",
  };
  return named[v] ?? "#000000";
}
