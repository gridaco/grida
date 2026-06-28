import React from "react";
import Link from "next/link";
import { GridDivider, GridRow } from "./grid";
import { sitemap } from "@/www/data/sitemap";

/** A bordered code card with a monospace filename bar. */
function CodeCard({ filename, html }: { filename: string; html: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
      <div className="border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground/70">
        {filename}
      </div>
      <div
        className="overflow-x-auto p-4 text-[12px] leading-relaxed md:p-6 md:text-[13px] [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/** The single-column spec body wrapper — the width a spec reads at. */
function Clause({
  title,
  children,
}: React.PropsWithChildren<{ title: React.ReactNode }>) {
  return (
    <GridRow>
      <div className="mx-auto max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h2>
        <div className="mt-5 space-y-5">{children}</div>
      </div>
    </GridRow>
  );
}

function P({ children }: React.PropsWithChildren) {
  return (
    <p className="text-base leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/** Field reference for `.canvas.json`. */
const FIELDS: { field: string; type: string; notes: React.ReactNode }[] = [
  {
    field: "version",
    type: "string?",
    notes: "Spec version targeted. Missing → current.",
  },
  {
    field: "$schema",
    type: "string?",
    notes: "Editor-tooling hint. Ignored by readers.",
  },
  {
    field: "editor",
    type: "enum?",
    notes: (
      <>
        Which editor opens it. <code>slides</code> · <code>board</code> ·{" "}
        <code>unknown</code>. Unrecognized → <code>unknown</code>.
      </>
    ),
  },
  {
    field: "files",
    type: "string[]?",
    notes: (
      <>
        Content globs. Missing → <code>[&quot;*.svg&quot;]</code>.{" "}
        <code>[]</code> derives nothing.
      </>
    ),
  },
  {
    field: "thumbnail",
    type: "string?",
    notes: "Explicit thumbnail path. Overrides the filename convention.",
  },
  {
    field: "documents",
    type: "array?",
    notes: "Ordered set of documents. Absent → derived from disk.",
  },
  {
    field: "documents[].src",
    type: "string",
    notes: "Relative path. The only field that must resolve on disk.",
  },
  {
    field: "documents[].id",
    type: "string?",
    notes: (
      <>
        Stable identity. Absent → <code>src</code> is the identity.
      </>
    ),
  },
  {
    field: "documents[].layout",
    type: "object?",
    notes: (
      <>
        2D placement <code>{`{ x, y, w, h, z }`}</code>. Absent → no canvas
        position.
      </>
    ),
  },
  {
    field: "documents[].skip",
    type: "boolean?",
    notes: "Omit from the linear slides view. Advisory; still exists.",
  },
  {
    field: "ext",
    type: "object?",
    notes: "Vendor bag. Round-tripped, never interpreted.",
  },
];

const EDITOR_ROWS: { value: string; meaning: React.ReactNode }[] = [
  {
    value: "slides",
    meaning: (
      <>
        Linear deck. <code>documents[]</code> order is the primary presentation;{" "}
        <code>layout</code> is an additive canvas view.
      </>
    ),
  },
  {
    value: "board",
    meaning: (
      <>
        Freeform canvas. Each document&apos;s <code>layout</code> is primary;
        order is secondary.
      </>
    ),
  },
  {
    value: "unknown",
    meaning: (
      <>
        No assumption. Default for a missing or unrecognized editor and for
        implicit mode.
      </>
    ),
  },
];

const READER_ROWS: { situation: React.ReactNode; behavior: React.ReactNode }[] =
  [
    {
      situation: (
        <>
          <code>.canvas.json</code> missing
        </>
      ),
      behavior: (
        <>
          Open in implicit mode, <code>editor: unknown</code>; MAY derive
          documents from disk.
        </>
      ),
    },
    {
      situation: ".canvas.json is malformed JSON",
      behavior: "Degrade to implicit mode and surface a warning. No hard-fail.",
    },
    {
      situation: "Unknown top-level field or editor",
      behavior: "Ignore on read; SHOULD preserve on write.",
    },
    {
      situation: (
        <>
          <code>documents</code> absent
        </>
      ),
      behavior: (
        <>
          Derive from disk: root files matching <code>files</code>, ordered
          lexically by filename.
        </>
      ),
    },
    {
      situation: (
        <>
          A <code>documents[].src</code> points at a missing file
        </>
      ),
      behavior: "Skip it with a warning. Disk is authoritative for existence.",
    },
    {
      situation: "Disk has matching files not in documents",
      behavior: "MAY append after the listed ones. Disk wins existence.",
    },
    {
      situation: (
        <>
          Two entries share an <code>id</code> / <code>src</code>
        </>
      ),
      behavior: "Warning; the reader keeps the first.",
    },
  ];

function Table({
  cols,
  rows,
}: {
  cols: string;
  rows: { cells: React.ReactNode[]; mono?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {rows.map((row, i) => (
        <div
          key={i}
          className={
            "grid gap-x-5 gap-y-1 px-5 py-3.5 text-sm " +
            cols +
            (i > 0 ? " border-t border-border" : "")
          }
        >
          {row.cells.map((cell, j) => (
            <span
              key={j}
              className={
                j === 0 ? "font-mono text-foreground" : "text-muted-foreground"
              }
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Spec({
  manifestHtml,
  usageHtml,
}: {
  manifestHtml: string;
  usageHtml: string;
}) {
  return (
    <>
      {/* §0 — model */}
      <Clause title="What a .canvas is">
        <P>
          A <code>.canvas</code> is a directory containing a root{" "}
          <code>.canvas.json</code>. Its presence — not the directory name —
          declares the bundle. Every other file is opaque to the format: never
          required, never validated.
        </P>
        <P>
          A reader interprets whatever is on disk; it does not reject. An
          absent, partial, or malformed manifest degrades to implicit mode. The
          resolved view is recomputed on every read — there is no cache and no
          private IR. <code>.canvas.json</code> plus the files on disk are the
          only state.
        </P>
        <div className="rounded-lg border border-border bg-muted/30 px-5 py-4 font-mono text-sm">
          The manifest is authoritative for <strong>order</strong> and{" "}
          <strong>placement</strong>; the directory listing is authoritative for{" "}
          <strong>existence</strong>.
        </div>
      </Clause>

      <GridDivider />

      {/* §1 — manifest */}
      <Clause title=".canvas.json">
        <P>
          JSON. The minimal valid manifest is <code>{`{}`}</code> — every field
          is optional and the reader fills defaults. All paths are relative to
          the bundle root; <code>..</code> escape and absolute paths are out of
          V1, and containment is enforced by the host, not the reader.
        </P>
        <P>
          The marker is <code>.canvas.json</code> — hidden and JSON-typed, so
          editor tooling and <code>$schema</code> still apply, and it stays
          distinct from JSONCanvas&apos;s <code>*.canvas</code>.
        </P>
        <CodeCard filename=".canvas.json" html={manifestHtml} />
        <Table
          cols="grid-cols-1 md:grid-cols-[13rem_5rem_1fr]"
          rows={FIELDS.map((f) => ({ cells: [f.field, f.type, f.notes] }))}
        />
        <P>
          There is no <code>name</code> / <code>title</code> field. A human
          label is the document&apos;s own content&apos;s job — for an SVG, its{" "}
          <code>&lt;title&gt;</code> element.
        </P>
      </Clause>

      <GridDivider />

      {/* §2 — editor and content */}
      <Clause title="editor and files">
        <P>
          Two orthogonal axes. <code>editor</code> selects the{" "}
          <strong>editor</strong> that opens the bundle — how documents are
          read/presented (à la Figma&apos;s <code>editorType</code>).{" "}
          <code>files</code> selects the <strong>content</strong> — which root
          files are documents. Any editor holds any content kind.
        </P>
        <Table
          cols="grid-cols-1 md:grid-cols-[7rem_1fr]"
          rows={EDITOR_ROWS.map((r) => ({ cells: [r.value, r.meaning] }))}
        />
        <ul className="space-y-2 text-base leading-relaxed text-muted-foreground">
          <li>
            — <code>files</code> are glob patterns matched against root
            basenames. <code>*</code> (any run) is the only wildcard in V1.
          </li>
          <li>
            — Missing → <code>[&quot;*.svg&quot;]</code>. Explicit{" "}
            <code>[]</code> derives nothing; membership then comes only from{" "}
            <code>documents</code>.
          </li>
          <li>
            — It drives disk-derivation and signals the document kind a host
            opens an editor for.
          </li>
        </ul>
      </Clause>

      <GridDivider />

      {/* §3 — resolution */}
      <Clause title="Reader semantics">
        <P>
          A reader reconciles the manifest against the directory listing. The
          manifest is authoritative for order and placement; the listing is
          authoritative for existence. Each situation has one defined behavior.
        </P>
        <Table
          cols="grid-cols-1 md:grid-cols-[15rem_1fr]"
          rows={READER_ROWS.map((r) => ({
            cells: [r.situation, r.behavior],
          }))}
        />
        <P>
          Ordering is <code>documents</code> order, then disk-only matches
          appended lexically. There is no auto-renumber and no re-sort mode.
        </P>
      </Clause>

      <GridDivider />

      {/* §4 — reference implementation */}
      <Clause title="dotcanvas">
        <P>
          <code>dotcanvas</code> is the reference reader/writer. ESM-only, zero
          runtime dependencies. <code>read</code> / <code>write</code> operate
          over an injected <code>{`{ list(); read() }`}</code> port; the pure
          transforms take <code>(manifest, …)</code> and return a new manifest
          without mutating the input or throwing.
        </P>
        <CodeCard filename="reader + transforms" html={usageHtml} />
        <P>
          It is not a renderer, a validator that rejects, a filesystem, or a
          converter for any document&apos;s internal format. It resolves paths,
          order, and warnings — nothing else.
        </P>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[
            ["npm", sitemap.links.npm_dotcanvas],
            ["source", sitemap.links.github_dotcanvas],
            ["normative spec", sitemap.links.dotcanvas_spec],
            ["JSON Schema", sitemap.links.schema_dotcanvas_v1],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:no-underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </Clause>
    </>
  );
}
