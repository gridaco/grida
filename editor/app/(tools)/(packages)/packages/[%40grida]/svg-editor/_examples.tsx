"use client";

import { useEffect, useRef, useState } from "react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useCommands,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { Tool } from "@grida/svg-editor";
import type { DomSurfaceHandle } from "@grida/svg-editor/dom";
import {
  CSS,
  GROUP_TRANSFORM,
  INSERT_FRAGMENT,
  INSERT_FRAGMENT_ICONS,
  LINE,
  NESTED_SVG,
  PATH,
  SHAPES,
  SYMBOL_USE,
  TEXT,
} from "./_fixtures";

/**
 * One isolated editor per card.
 *
 * Each `SvgStage` owns its own `SvgEditorProvider`, so the cards on this page
 * are independent editor instances — the spec-demo equivalent of `@grida/hud`'s
 * per-section playgrounds. `tool` is *preset* and `selectName` *seeds* a
 * selection, but neither is *locked*: the package has no capability profile yet,
 * so every other tool and command stays live. The pairing of fixture +
 * intended interaction is what a future profile would enforce. See the
 * directory README.
 */
function SvgStage({
  svg,
  tool,
  selectName,
}: {
  svg: string;
  tool?: Tool;
  /** Select the node with this authored `id=` on mount, so the card lands warm. */
  selectName?: string;
}) {
  return (
    <SvgEditorProvider initialSvg={svg}>
      <SvgStageBody tool={tool} selectName={selectName} />
    </SvgEditorProvider>
  );
}

function SvgStageBody({
  tool,
  selectName,
}: {
  tool?: Tool;
  selectName?: string;
}) {
  const editor = useSvgEditor();
  // Apply preset tool + seed selection exactly once on mount. Identity of the
  // props is ignored on purpose — re-running would fight the user's own picks.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (tool) editor.set_tool(tool);
    if (selectName) {
      for (const node of editor.tree().nodes.values()) {
        if (node.name === selectName) {
          editor.commands.select([node.id]);
          break;
        }
      }
    }
  }, [editor, tool, selectName]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:20px_20px]">
      <SvgEditorCanvas fit className="absolute inset-0 h-full w-full" />
    </div>
  );
}

// ─── Cards — one fixture each ────────────────────────────────────────────────

/** Every primitive shape, one of each. Cursor tool; click any shape. */
export function ShapesExample() {
  return <SvgStage svg={SHAPES} tool={{ type: "cursor" }} />;
}

/** Path content edit. Path pre-selected; Enter / Q drops into vertex edit. */
export function PathExample() {
  return <SvgStage svg={PATH} tool={{ type: "cursor" }} selectName="wave" />;
}

/** Line's 2-endpoint interaction. Diagonal pre-selected to show endpoint handles. */
export function LineExample() {
  return (
    <SvgStage svg={LINE} tool={{ type: "cursor" }} selectName="diagonal" />
  );
}

/** Text + tspan. Headline pre-selected; double-click to edit inline. */
export function TextExample() {
  return (
    <SvgStage svg={TEXT} tool={{ type: "cursor" }} selectName="headline" />
  );
}

/** Groups + transform. Rotated group pre-selected; Enter descends scope. */
export function GroupTransformExample() {
  return (
    <SvgStage
      svg={GROUP_TRANSFORM}
      tool={{ type: "cursor" }}
      selectName="card"
    />
  );
}

/**
 * Nested <svg>. A node *inside* the inner viewport is pre-selected, so the card
 * lands on exactly the open case: chrome must cross the nested-viewport boundary
 * (`getCTM` stops at the nearest viewport today).
 */
export function NestedSvgExample() {
  return (
    <SvgStage
      svg={NESTED_SVG}
      tool={{ type: "cursor" }}
      selectName="inner-dot"
    />
  );
}

/** Symbol + use. A scaled instance pre-selected; geometry lives in the symbol. */
export function SymbolUseExample() {
  return (
    <SvgStage svg={SYMBOL_USE} tool={{ type: "cursor" }} selectName="pin-d" />
  );
}

/** CSS-driven fill + transform via a document <style> block. */
export function CssExample() {
  return <SvgStage svg={CSS} tool={{ type: "cursor" }} selectName="pill" />;
}

// ─── Fragment insertion — `commands.insert_fragment` ────────────────────────

/** Drag payload type for the demo's icon chips — scoped to this card. */
const FRAGMENT_MIME = "application/x-grida-svg-fragment-demo";

/**
 * The minimal `insert_fragment` consumer: click a chip to insert its icon,
 * or drag it onto the stage to insert at the drop point. Both paths are a
 * single `insert_fragment` call — position is authored content, so the
 * drop point becomes a `<g transform="translate(…)">` wrapper around the
 * fragment, and the whole insert is ONE undo step.
 */
export function InsertFragmentExample() {
  return (
    <SvgEditorProvider initialSvg={INSERT_FRAGMENT}>
      <InsertFragmentBody />
    </SvgEditorProvider>
  );
}

function InsertFragmentBody() {
  const cmd = useCommands();
  const [handle, setHandle] = useState<DomSurfaceHandle | null>(null);
  // Cascade repeated center-inserts so stamps don't hide each other.
  const stamps = useRef(0);

  const insert_at = (
    icon: (typeof INSERT_FRAGMENT_ICONS)[number],
    at: { x: number; y: number }
  ) => {
    // The whole recipe: author the position around the fragment, insert
    // once. Rounded — the transform round-trips into the saved file.
    const tx = Math.round((at.x - icon.size / 2) * 100) / 100;
    const ty = Math.round((at.y - icon.size / 2) * 100) / 100;
    cmd.insert_fragment(
      `<g transform="translate(${tx} ${ty})">${icon.svg}</g>`
    );
  };

  const insert_at_stage_center = (
    icon: (typeof INSERT_FRAGMENT_ICONS)[number]
  ) => {
    const n = stamps.current++;
    insert_at(icon, { x: 280 + (n % 5) * 28 - 56, y: 160 });
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(FRAGMENT_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: React.DragEvent) => {
    const key = e.dataTransfer.getData(FRAGMENT_MIME);
    const icon = INSERT_FRAGMENT_ICONS.find((i) => i.name === key);
    if (!icon || !handle) return;
    e.preventDefault();
    // Drop point (container-local px) → world space via the camera.
    const cr = e.currentTarget.getBoundingClientRect();
    const at = handle.camera.screen_to_world({
      x: e.clientX - cr.left,
      y: e.clientY - cr.top,
    });
    insert_at(icon, at);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {INSERT_FRAGMENT_ICONS.map((icon) => (
          <button
            key={icon.name}
            type="button"
            draggable
            onClick={() => insert_at_stage_center(icon)}
            onDragStart={(e) => {
              e.dataTransfer.setData(FRAGMENT_MIME, icon.name);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted cursor-grab active:cursor-grabbing"
            title={`Insert ${icon.name} — click, or drag onto the stage`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: icon.svg }}
            />
            {icon.name}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          click to insert · drag to place
        </span>
      </div>
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative aspect-video w-full overflow-hidden rounded-lg border bg-[radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:20px_20px]"
      >
        <SvgEditorCanvas
          fit
          onAttach={setHandle}
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
