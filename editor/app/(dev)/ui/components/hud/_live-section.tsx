"use client";

// ───────────────────────────────────────────────────────────────────────────
// §0 — Live editor. Mounts the real `@grida/svg-editor` (the only
// production host of `@grida/hud` today). Every gesture, intent, and
// mutation in this section runs through the same wiring shipped to the
// svg-editor in production: pointer → hud surface → intent → editor
// command → document mutation → re-render.
//
// Intentionally minimal toolbar — just enough surface area to exercise the
// hud contract end-to-end. Bigger feature surfaces (paint editor, layer
// panel, exporter) belong in the svg-editor demo, not here.
// ───────────────────────────────────────────────────────────────────────────

import * as React from "react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useCanRedo,
  useCanUndo,
  useCommands,
  useMode,
  useSelection,
  useSvgEditor,
  useTool,
} from "@grida/svg-editor/react";
import type { Tool } from "@grida/svg-editor";
import { Button } from "@/components/ui/button";
import {
  CircleIcon,
  MinusIcon,
  MousePointer2Icon,
  RedoIcon,
  SquareDashedIcon,
  SquareIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";

// §0 is the showcase section — unlike the spec-demo fixtures below it,
// this one is rich on purpose: a real-world product card mockup with
// color, type, layout. Shows that the hud chrome reads cleanly against
// designer-flavour content (not just probe sheets).
const INITIAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <rect width="600" height="400" fill="#F4F1EA"/>

  <line x1="0" y1="80" x2="600" y2="80" stroke="#1E293B" stroke-width="1" stroke-dasharray="2 4" opacity="0.35"/>
  <line x1="0" y1="320" x2="600" y2="320" stroke="#1E293B" stroke-width="1" stroke-dasharray="2 4" opacity="0.35"/>
  <line x1="180" y1="0" x2="180" y2="400" stroke="#1E293B" stroke-width="1" stroke-dasharray="2 4" opacity="0.2"/>
  <line x1="420" y1="0" x2="420" y2="400" stroke="#1E293B" stroke-width="1" stroke-dasharray="2 4" opacity="0.2"/>

  <circle cx="300" cy="200" r="120" fill="#1E293B"/>

  <rect x="300" y="80" width="120" height="240" fill="#F4F1EA"/>

  <circle cx="300" cy="200" r="120" fill="none" stroke="#1E293B" stroke-width="2"/>

  <rect id="hero" x="180" y="200" width="240" height="120" fill="#E85D3C"/>

  <circle cx="300" cy="200" r="60" fill="#F4F1EA"/>

  <rect x="240" y="140" width="60" height="60" fill="#1E293B"/>

  <polygon points="420,80 480,80 420,200" fill="#F2C14E"/>

  <circle cx="480" cy="140" r="20" fill="#1E293B"/>

  <line x1="60" y1="60" x2="120" y2="60" stroke="#1E293B" stroke-width="1"/>
  <line x1="60" y1="56" x2="60" y2="64" stroke="#1E293B" stroke-width="1"/>
  <line x1="120" y1="56" x2="120" y2="64" stroke="#1E293B" stroke-width="1"/>
  <text x="90" y="50" font-size="9" fill="#1E293B" text-anchor="middle" font-family="ui-monospace, monospace">60</text>

  <line x1="540" y1="340" x2="540" y2="380" stroke="#1E293B" stroke-width="1"/>
  <line x1="536" y1="340" x2="544" y2="340" stroke="#1E293B" stroke-width="1"/>
  <line x1="536" y1="380" x2="544" y2="380" stroke="#1E293B" stroke-width="1"/>
  <text x="552" y="364" font-size="9" fill="#1E293B" font-family="ui-monospace, monospace">40</text>

  <circle cx="60" cy="360" r="3" fill="#E85D3C"/>
  <circle cx="76" cy="360" r="3" fill="#F2C14E"/>
  <circle cx="92" cy="360" r="3" fill="#1E293B"/>
  <circle cx="108" cy="360" r="3" fill="none" stroke="#1E293B" stroke-width="1"/>

  <text x="60" y="40" font-size="10" font-weight="600" fill="#1E293B" font-family="ui-monospace, monospace" letter-spacing="2">FORM / 01</text>
  <text x="540" y="40" font-size="10" font-weight="600" fill="#1E293B" text-anchor="end" font-family="ui-monospace, monospace" letter-spacing="2">DRAFT</text>
</svg>`;

export function LiveEditorSection() {
  return (
    <section id="live" className="scroll-mt-24 border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6 max-w-3xl space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            §0 Live editor
          </div>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            The real editor — every contract, end-to-end
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This canvas mounts{" "}
            <code className="rounded bg-zinc-100 px-1 text-[12px]">
              @grida/svg-editor
            </code>{" "}
            — the production host of{" "}
            <code className="rounded bg-zinc-100 px-1 text-[12px]">
              @grida/hud
            </code>
            . Every gesture, intent, and mutation below — select, marquee,
            lasso, translate, resize, rotate, drag, endpoint, enter
            content-edit, undo, redo — runs through the same wiring shipped to
            users. The sections below isolate each contract in a minimal host so
            you can read the spec; this one shows the whole stack live.
          </p>
        </div>

        <SvgEditorProvider initialSvg={INITIAL_SVG}>
          <InitialSelection />
          <div className="rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
            <Toolbar />
            <div className="mt-2 h-[500px] overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <SvgEditorCanvas className="h-full w-full" fit />
            </div>
            <StatusBar />
          </div>
        </SvgEditorProvider>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Initial selection — seed the demo with chrome visible on first paint.
//
// `SvgEditorProvider` mounts with an empty selection; without a default,
// the §0 canvas lands cold (no chrome, nothing to read against the spec
// sections below). We pick the orange feature rect by attribute rather
// than by parser-assigned NodeId (n0, n1, …) because attribute lookup
// stays correct if anyone edits INITIAL_SVG.
// ───────────────────────────────────────────────────────────────────────────

function InitialSelection() {
  const editor = useSvgEditor();
  React.useEffect(() => {
    // `tree().nodes[n].name` is the parsed SVG `id="..."` attribute,
    // not the internal NodeId — author-controlled and resilient to
    // re-parses. The orange feature rect is tagged `id="hero"` in
    // INITIAL_SVG; we look it up here rather than hardcoding the
    // parser-assigned NodeId (n0, n1, …).
    const tree = editor.tree();
    for (const node of tree.nodes.values()) {
      if (node.name === "hero") {
        editor.commands.select([node.id]);
        break;
      }
    }
    // Mount-once. Re-running on every render would fight the user's
    // clicks — they'd lose their selection on any rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Toolbar — tools + history + actions. Status badges live in StatusBar.
// ───────────────────────────────────────────────────────────────────────────

function Toolbar() {
  const editor = useSvgEditor();
  const tool = useTool();
  const cmd = useCommands();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const sel = useSelection();
  const mode = useMode();

  const setTool = (t: Tool) => editor.set_tool(t);

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
      <ToolButton
        label="Cursor"
        shortcut="V"
        active={tool.type === "cursor"}
        onClick={() => setTool({ type: "cursor" })}
        Icon={MousePointer2Icon}
      />
      <ToolButton
        label="Rect"
        shortcut="R"
        active={tool.type === "insert" && tool.tag === "rect"}
        onClick={() => setTool({ type: "insert", tag: "rect" })}
        Icon={SquareIcon}
      />
      <ToolButton
        label="Ellipse"
        shortcut="O"
        active={tool.type === "insert" && tool.tag === "ellipse"}
        onClick={() => setTool({ type: "insert", tag: "ellipse" })}
        Icon={CircleIcon}
      />
      <ToolButton
        label="Line"
        shortcut="L"
        active={tool.type === "insert" && tool.tag === "line"}
        onClick={() => setTool({ type: "insert", tag: "line" })}
        Icon={MinusIcon}
      />
      <ToolButton
        label="Lasso"
        shortcut="Q"
        active={tool.type === "lasso"}
        onClick={() => setTool({ type: "lasso" })}
        disabled={mode !== "edit-content"}
        Icon={SquareDashedIcon}
        hint="path edit only"
      />

      <span className="mx-1 h-5 w-px bg-zinc-300" />

      <Button
        size="sm"
        variant="outline"
        disabled={!canUndo}
        onClick={() => cmd.undo()}
        className="h-7 px-2"
        aria-label="Undo"
        title="Undo"
      >
        <UndoIcon className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canRedo}
        onClick={() => cmd.redo()}
        className="h-7 px-2"
        aria-label="Redo"
        title="Redo"
      >
        <RedoIcon className="size-3.5" />
      </Button>

      <span className="mx-1 h-5 w-px bg-zinc-300" />

      <Button
        size="sm"
        variant="outline"
        disabled={sel.length === 0}
        onClick={() => cmd.remove()}
        className="h-7 px-2"
        aria-label="Delete selection"
        title="Delete (⌫)"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => cmd.select_all()}
        className="h-7 px-2 text-[11px]"
      >
        Select all
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={sel.length === 0}
        onClick={() => cmd.deselect()}
        className="h-7 px-2 text-[11px]"
      >
        Deselect
      </Button>

      <span className="ml-auto text-[11px] text-zinc-500">
        ⌘/ctrl + wheel = zoom · space-drag = pan · ⌫ = delete
      </span>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  disabled,
  Icon,
  hint,
}: {
  label: string;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  Icon: typeof MousePointer2Icon;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label}${shortcut ? ` (${shortcut})` : ""}${hint ? ` — ${hint}` : ""}`}
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium shadow-sm transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <Icon className="size-3.5" />
      {label}
      {shortcut ? (
        <kbd className="ml-0.5 rounded bg-black/10 px-1 text-[10px] tabular-nums">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function StatusBar() {
  const sel = useSelection();
  const tool = useTool();
  const mode = useMode();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 px-2 pb-1 font-mono text-[11px] text-zinc-500">
      <span>
        mode: <code className="text-zinc-800">{mode}</code>
      </span>
      <span>
        tool:{" "}
        <code className="text-zinc-800">
          {tool.type}
          {"tag" in tool ? `:${tool.tag}` : ""}
        </code>
      </span>
      <span>
        selection:{" "}
        <code className="text-zinc-800">
          {sel.length === 0
            ? "—"
            : sel.length === 1
              ? sel[0]
              : `${sel.length} ids`}
        </code>
      </span>
    </div>
  );
}
