"use client";

import { useEffect, useRef } from "react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { Tool } from "@grida/svg-editor";
import {
  CSS,
  GROUP_TRANSFORM,
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
