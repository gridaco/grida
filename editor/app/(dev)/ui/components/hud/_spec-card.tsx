"use client";

// Spec citations + a compact table layout used under each demo. One row
// per rule, citation chips on the right.

import * as React from "react";

export interface SpecCite {
  label: string;
  href?: string;
}

export interface SpecRow {
  name: string;
  rule: React.ReactNode;
  citations?: SpecCite[];
}

export function SpecTable({ rows }: { rows: SpecRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.name}
              className={i === 0 ? "" : "border-t border-zinc-100"}
            >
              <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[11px] font-semibold text-zinc-900">
                {r.name}
              </td>
              <td className="px-3 py-2 align-top leading-relaxed text-zinc-700">
                {r.rule}
              </td>
              <td className="whitespace-nowrap px-3 py-2 align-top text-right">
                {r.citations?.map((c, j) =>
                  c.href ? (
                    <a
                      key={j}
                      href={c.href}
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="ml-1 inline-block rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      {c.label}
                    </a>
                  ) : (
                    <span
                      key={j}
                      className="ml-1 inline-block rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                    >
                      {c.label}
                    </span>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Only working-group docs are cited from the spec demo. Source files and
// test files churn too fast to be useful as durable references — they go
// stale within a release or two. WG docs are the design contract; they're
// the only artifact stable enough to outlive the citation.
export const cite = {
  wgSelectionIntent: (): SpecCite => ({
    label: "wg: selection-intent",
    href: "https://grida.co/docs/wg/feat-editor/ux-surface/selection-intent",
  }),
  wgSelection: (): SpecCite => ({
    label: "wg: selection",
    href: "https://grida.co/docs/wg/feat-editor/ux-surface/selection",
  }),
};
