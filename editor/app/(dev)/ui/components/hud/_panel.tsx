"use client";

// ───────────────────────────────────────────────────────────────────────────
// Read-only inspector for HUDStage.
//
// Subscribes to outcomes (gesture, cursor, hover, last intent, selection,
// zoom) — never raw pointer events. This mirrors the SDK doctrine: hosts
// consume designed views, not the internal stream.
// ───────────────────────────────────────────────────────────────────────────

import * as React from "react";
import type { HUDPlaygroundState } from "./_host";

export interface InspectorPanelProps {
  state: HUDPlaygroundState | null;
  /** Optional title above the panel. */
  title?: string;
  className?: string;
}

export function InspectorPanel({
  state,
  title = "Surface state",
  className,
}: InspectorPanelProps) {
  if (!state) {
    return (
      <div
        className={[
          "flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-400",
          className ?? "",
        ].join(" ")}
      >
        Initialising…
      </div>
    );
  }
  return (
    <div
      className={[
        "flex h-full flex-col gap-2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </span>
        <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
          z {state.zoom.toFixed(2)}×
        </span>
      </div>

      <Row label="gesture">
        <code className="font-mono text-[11px] text-zinc-800">
          {state.gesture.kind}
        </code>
      </Row>
      <Row label="cursor">
        <code className="font-mono text-[11px] text-zinc-800">
          {cursorLabel(state.cursor)}
        </code>
      </Row>
      <Row label="hover">
        <code className="font-mono text-[11px] text-zinc-800">
          {state.hover ?? "—"}
        </code>
      </Row>
      <Row label="selection">
        <code className="font-mono text-[11px] text-zinc-800">
          {state.selection.length === 0
            ? "—"
            : state.selection.length === 1
              ? state.selection[0]
              : `${state.selection.length} ids`}
        </code>
      </Row>
      <Row label="last intent">
        {state.lastIntent ? (
          <div className="space-y-0.5">
            <code className="font-mono text-[11px] text-emerald-700">
              {state.lastIntent.kind}
            </code>
            {"phase" in state.lastIntent && state.lastIntent.phase ? (
              <code className="ml-2 font-mono text-[10px] text-zinc-500">
                {state.lastIntent.phase}
              </code>
            ) : null}
          </div>
        ) : (
          <code className="font-mono text-[11px] text-zinc-400">—</code>
        )}
      </Row>
      <Row label="modifiers">
        <code className="font-mono text-[11px] text-zinc-800">
          {modifierLabel(state.modifiers)}
        </code>
      </Row>
      <Row label="click count">
        <code className="font-mono text-[11px] text-zinc-800 tabular-nums">
          {state.clickCount}
        </code>
      </Row>

      <details className="mt-2 border-t border-zinc-100 pt-2 text-[11px]">
        <summary className="cursor-pointer text-zinc-500">raw</summary>
        <pre className="mt-1 overflow-auto rounded bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-700">
          {JSON.stringify(
            {
              gesture: state.gesture,
              hover: state.hover,
              selection: state.selection,
              lastIntent: state.lastIntent,
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function cursorLabel(c: HUDPlaygroundState["cursor"]): string {
  if (typeof c === "string") return c;
  if (c.kind === "resize") return `resize:${c.direction}`;
  if (c.kind === "rotate") return `rotate:${c.corner}`;
  return JSON.stringify(c);
}

function modifierLabel(m: HUDPlaygroundState["modifiers"]): string {
  const on: string[] = [];
  if (m.shift) on.push("⇧");
  if (m.alt) on.push("⌥");
  if (m.meta) on.push("⌘");
  if (m.ctrl) on.push("⌃");
  return on.length === 0 ? "—" : on.join(" ");
}
