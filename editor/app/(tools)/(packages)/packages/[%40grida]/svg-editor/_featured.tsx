"use client";

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
  TypeIcon,
  UndoIcon,
} from "lucide-react";
import { FEATURED } from "./_fixtures";

/**
 * The fully-featured demo, mirroring `@grida/hud`'s "live editor" hero: the
 * real editor with the full tool/history/structure surface and a rich
 * document, so the page opens on what the editor can do end-to-end. The
 * isolated spec cards below it each strip back to one feature.
 */
export function FeaturedDemo() {
  return (
    <SvgEditorProvider initialSvg={FEATURED}>
      <InitialSelection name="series" />
      <div className="rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
        <Toolbar />
        <div className="mt-2 aspect-video overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <SvgEditorCanvas className="h-full w-full" fit />
        </div>
        <StatusBar />
      </div>
    </SvgEditorProvider>
  );
}

/**
 * Seed a selection so the hero lands warm (chrome visible on first paint).
 * Look the node up by its authored `id=` (resilient to re-parses), not by the
 * parser-assigned NodeId. Mount-once — re-running would fight the user's clicks.
 */
function InitialSelection({ name }: { name: string }) {
  const editor = useSvgEditor();
  React.useEffect(() => {
    for (const node of editor.tree().nodes.values()) {
      if (node.name === name) {
        editor.commands.select([node.id]);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

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
        label="Text"
        shortcut="T"
        active={tool.type === "insert-text"}
        onClick={() => setTool({ type: "insert-text" })}
        Icon={TypeIcon}
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
        title="Undo (⌘Z)"
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
        title="Redo (⌘⇧Z)"
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
