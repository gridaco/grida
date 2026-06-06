"use client";

import React, { useCallback, useState } from "react";
import { motion } from "motion/react";
import {
  SvgEditorProvider,
  SvgEditorCanvas,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { DomSurfaceHandle } from "@grida/svg-editor/dom";
import { cn } from "@app/ui/lib/utils";
import { GridCells } from "./grid";
import { PLAYGROUND_FIXTURES } from "./playground-fixtures";

/**
 * Dynamic bento footprint per fixture (artwork, illustration, heart, grida).
 * On mobile everything collapses to equal 1×1 squares; from `md` up, the first
 * tile becomes a 2×2 feature, the second a 2×1 wide tile, and the last two
 * stay 1×1 units. The 1×1 / 2×1 aspects establish the row height that the 2×2
 * tile spans.
 */
const TILE_LAYOUT = [
  "aspect-square md:aspect-auto md:col-span-2 md:row-span-2",
  "aspect-square md:aspect-[2/1] md:col-span-2",
  "aspect-square",
  "aspect-square",
];

/**
 * The canvas + its auto-edit wiring. The select / enter-edit must run *after*
 * the DOM surface attaches (it installs the content-edit driver), so it's done
 * in `onAttach`, not a mount effect — opening each tile straight into path-edit
 * mode on its primary <path> with the vector vertices on display. Falls back to
 * selecting all top-level elements when the fixture has no path.
 */
function TileCanvas({
  active,
  selectOnly,
}: {
  active: boolean;
  selectOnly?: boolean;
}) {
  const editor = useSvgEditor();
  const onAttach = useCallback(
    (handle: DomSurfaceHandle | null) => {
      if (!handle) return;
      const tree = editor.tree();
      // `selectOnly` tiles stop at a plain selection box; the rest open into
      // path-edit on their primary <path> so the vertices show.
      if (!selectOnly) {
        let pathId: string | null = null;
        for (const [id, node] of tree.nodes) {
          if (node.tag === "path") {
            pathId = id;
            break;
          }
        }
        if (pathId) {
          editor.commands.select(pathId);
          editor.enter_content_edit(pathId);
          return;
        }
      }
      const children = tree.nodes.get(tree.root)?.children ?? [];
      if (children.length > 0) editor.commands.select([...children]);
    },
    [editor, selectOnly]
  );
  return (
    <SvgEditorCanvas
      fit
      gestures={active}
      onAttach={onAttach}
      className="absolute inset-0 h-full w-full"
    />
  );
}

/**
 * One live editor tile. Gestures stay off until the user clicks "edit", so
 * scrolling past the section doesn't get hijacked by wheel-pan/zoom; the
 * path-edit chrome still shows it's editable.
 */
function PlaygroundTile({
  svg,
  label,
  index,
  className,
  selectOnly,
}: {
  svg: string;
  label: string;
  index: number;
  className?: string;
  selectOnly?: boolean;
}) {
  const [active, setActive] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className={cn("group relative bg-background", className)}
    >
      <SvgEditorProvider initialSvg={svg}>
        <TileCanvas active={active} selectOnly={selectOnly} />
      </SvgEditorProvider>
      <span className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] text-muted-foreground/50">
        {label}.svg
      </span>
      {!active && (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="absolute inset-0 z-10 flex items-end justify-center pb-4"
          aria-label={`Edit ${label}.svg`}
        >
          <span className="rounded-full border bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100">
            Click to edit
          </span>
        </button>
      )}
    </motion.div>
  );
}

export default function Playground() {
  return (
    <GridCells className="grid-cols-2 md:grid-cols-4">
      {PLAYGROUND_FIXTURES.map((f, i) => (
        <PlaygroundTile
          key={f.label}
          svg={f.svg}
          label={f.label}
          index={i}
          className={TILE_LAYOUT[i]}
          selectOnly={f.selectOnly}
        />
      ))}
    </GridCells>
  );
}
