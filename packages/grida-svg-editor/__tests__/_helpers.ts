// Shared test helpers. Keep small and obvious — anything that needs
// arguments or branching belongs in the test file itself.

import { createSvgEditor } from "../src/index";
import type {
  CreateSvgEditorOptions,
  SvgEditorInternal,
} from "../src/core/editor";
import type { SvgDocument } from "../src/core/document";
import type { GeometryProvider } from "../src/core/geometry";
import type { NodeId, Rect } from "../src/types";

/**
 * Test-only factory that returns the wide `SvgEditorInternal` type so
 * tests can reach `editor._internal` / `editor.keymap` without an inline
 * cast at every use. Use the public `createSvgEditor` when the test
 * doesn't touch those — the narrow type is the contract for app code.
 */
export function createSvgEditorWithInternals(
  opts: CreateSvgEditorOptions
): SvgEditorInternal {
  return createSvgEditor(opts) as SvgEditorInternal;
}

/** Synthetic `Rect` literal — for headless snap / cmath fixtures that
 *  don't need a real SVG layout. */
export function rect(x: number, y: number, w = 10, h = 10): Rect {
  return { x, y, width: w, height: h };
}

/** Id of the first `<tag>` in document order. Accepts either the
 *  editor (most common) or the bare document. */
export function first_tag(
  source: ReturnType<typeof createSvgEditor> | SvgDocument,
  tag: string
): string {
  // Editor surface has `.tree()`; SvgDocument has `.all_elements()` + `.tag_of()`.
  if ("tree" in source) {
    for (const [id, n] of source.tree().nodes) {
      if (n.tag === tag) return id;
    }
  } else {
    for (const id of source.all_elements()) {
      if (source.tag_of(id) === tag) return id;
    }
  }
  throw new Error(`no <${tag}> in document`);
}

/** Id of the first `<rect>` in document order. Two overloads so tests
 *  can pass either the editor (most common) or the bare document. */
export function first_rect(editor: ReturnType<typeof createSvgEditor>): string;
export function first_rect(doc: SvgDocument): string;
export function first_rect(
  source: ReturnType<typeof createSvgEditor> | SvgDocument
): string {
  return first_tag(source, "rect");
}

/**
 * Install a headless `GeometryProvider` that derives bbox from the doc's own
 * attrs — covers `<rect>` / `<image>` / `<use>` / `<circle>` / `<ellipse>`.
 * Required by any command that needs world bounds (`resize_to`, `resize_by`,
 * `rotate`, `align`). Returns `null` for other tags (e.g. `<g>`).
 */
export function install_geometry(
  editor: ReturnType<typeof createSvgEditor>
): void {
  const internal = editor as SvgEditorInternal;
  const doc = editor.document;
  const num = (id: NodeId, name: string, fallback = 0): number => {
    const raw = doc.get_attr(id, name);
    if (raw == null) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const driver: GeometryProvider = {
    bounds_of(id: NodeId): Rect | null {
      const tag = doc.tag_of(id);
      switch (tag) {
        case "rect":
        case "image":
        case "use":
          return {
            x: num(id, "x"),
            y: num(id, "y"),
            width: num(id, "width"),
            height: num(id, "height"),
          };
        case "circle": {
          const cx = num(id, "cx");
          const cy = num(id, "cy");
          const r = num(id, "r");
          return { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
        }
        case "ellipse": {
          const cx = num(id, "cx");
          const cy = num(id, "cy");
          const rx = num(id, "rx");
          const ry = num(id, "ry");
          return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
        }
        default:
          return null;
      }
    },
    bounds_of_many(ids) {
      const out = new Map<NodeId, Rect>();
      for (const id of ids) {
        const r = this.bounds_of(id);
        if (r) out.set(id, r);
      }
      return out;
    },
    nodes_in_rect() {
      return [];
    },
    node_at_point() {
      return null;
    },
  };
  internal._internal.set_geometry(driver);
}
