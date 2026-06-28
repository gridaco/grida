// svg-geometry.ts — a TOY SVG geometry engine for the spike (feature rung D).
//
// PURPOSE: pick & translate elements INSIDE an unmounted frame without a live
// `@grida/svg-editor`. The host renders inactive frames as inert
// `<img data:image/svg+xml,…>` (the per-document isolation win — no cross-frame
// id/CSS collision), so there is NO DOM to hit-test. To select an element
// across frames we therefore parse the SVG string ourselves and compute each
// element's bounding box.
//
// This is deliberately a TOY — axis-aligned bbox only, approximate text metrics,
// crude `path`/`points` extents, and it IGNORES group/element transforms beyond
// the one we inject. Its very existence IS the spike finding (FINDINGS SE8):
// cross-frame picking forces the host to REIMPLEMENT the editor's private
// picking. Real fidelity (paths, text shaping, filters, nested transforms)
// needs the editor to expose hit-testing against an un-mounted document.

import type { Rect, Point } from "./svg-canvas";

export type SvgElement = {
  /** Stable identity = index in document order. Survives transform-injection
   *  (injection never changes element count or order), so it round-trips. */
  key: number;
  tag: string;
  /** Axis-aligned bounds in the SVG's OWN (viewBox) coordinate space. */
  bbox: Rect;
};

export type SvgGeometry = {
  /** viewBox = the SVG's local coordinate space (origin + size). A non-zero
   *  origin (e.g. `viewBox="-100 -100 200 200"`) shifts every coordinate. */
  viewBox: { x: number; y: number; width: number; height: number };
  elements: SvgElement[];
};

// Leaf elements we can bbox. `text` is matched with its content (for a width
// estimate); the rest are self-closing/leaf tags.
const SCAN_RE =
  /<text\b([^>]*)>([\s\S]*?)<\/text>|<(rect|circle|ellipse|line|polyline|polygon|path)\b([^>]*?)\/?>/g;

type Scanned = {
  index: number;
  tag: string;
  attrs: string;
  content: string;
  /** index of the opening `<`. */
  openTagStart: number;
  /** index just AFTER the `>` that closes the opening tag. */
  openTagEnd: number;
};

/** Walk the SVG string once, yielding leaf elements in document order. The same
 *  scan backs both parsing and transform-injection, so `key` is consistent. */
function* scanElements(svg: string): Generator<Scanned> {
  SCAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = SCAN_RE.exec(svg)) !== null) {
    const isText = m[3] === undefined;
    const tag = isText ? "text" : m[3];
    const attrs = isText ? m[1] : m[4];
    const content = isText ? m[2] : "";
    const openTagStart = m.index;
    const gt = svg.indexOf(">", openTagStart);
    const openTagEnd = (gt === -1 ? svg.length - 1 : gt) + 1;
    yield { index: index++, tag, attrs, content, openTagStart, openTagEnd };
  }
}

function attr(s: string, name: string): string | null {
  const m = s.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function num(s: string, name: string, dflt = 0): number {
  const v = attr(s, name);
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

function numbersIn(s: string): number[] {
  return (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function boundsOf(xs: number[], ys: number[]): Rect | null {
  if (!xs.length || !ys.length) return null;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Pad a degenerate (zero-width/height) bbox so a hairline stays hittable. */
function padThin(r: Rect, pad = 3): Rect {
  const dx = r.width === 0 ? pad : 0;
  const dy = r.height === 0 ? pad : 0;
  return {
    x: r.x - dx,
    y: r.y - dy,
    width: r.width + dx * 2,
    height: r.height + dy * 2,
  };
}

function bboxFor(tag: string, attrs: string, content: string): Rect | null {
  switch (tag) {
    case "rect":
      return {
        x: num(attrs, "x"),
        y: num(attrs, "y"),
        width: num(attrs, "width"),
        height: num(attrs, "height"),
      };
    case "circle": {
      const cx = num(attrs, "cx");
      const cy = num(attrs, "cy");
      const r = num(attrs, "r");
      return { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
    }
    case "ellipse": {
      const cx = num(attrs, "cx");
      const cy = num(attrs, "cy");
      const rx = num(attrs, "rx");
      const ry = num(attrs, "ry");
      return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
    }
    case "line":
      return padThin(
        boundsOf(
          [num(attrs, "x1"), num(attrs, "x2")],
          [num(attrs, "y1"), num(attrs, "y2")]
        ) ?? { x: 0, y: 0, width: 0, height: 0 }
      );
    case "polyline":
    case "polygon": {
      const pts = numbersIn(attr(attrs, "points") ?? "");
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) {
        xs.push(pts[i]);
        ys.push(pts[i + 1]);
      }
      return boundsOf(xs, ys);
    }
    case "path": {
      // crude: treat every number in `d` as an alternating x,y. Approximate
      // (ignores arc/curve control vs. on-path), good enough for a spike probe.
      const d = numbersIn(attr(attrs, "d") ?? "");
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < d.length; i += 2) {
        xs.push(d[i]);
        ys.push(d[i + 1]);
      }
      return boundsOf(xs, ys);
    }
    case "text": {
      const x = num(attrs, "x");
      const y = num(attrs, "y");
      const fs = num(attrs, "font-size", 16);
      const text = content.replace(/<[^>]*>/g, "").trim();
      const w = Math.max(fs * 0.6, text.length * fs * 0.55);
      const h = fs * 1.2;
      const anchor = attr(attrs, "text-anchor");
      const left =
        anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      return { x: left, y: y - fs * 0.8, width: w, height: h }; // baseline → top
    }
    default:
      return null;
  }
}

function rectContains(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
  );
}

/** Sum the translate() offsets in a `transform` attribute — the only transform
 *  this toy engine injects (via {@link applyElementTranslate}) and understands.
 *  Scale / rotate / matrix are ignored (the spike's documented approximation). */
function translateOf(attrs: string): Point {
  const t = attr(attrs, "transform");
  if (!t) return { x: 0, y: 0 };
  const re =
    /translate\(\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)(?:\s*[,\s]\s*(-?\d*\.?\d+(?:e[+-]?\d+)?))?\s*\)/gi;
  let x = 0;
  let y = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    x += Number(m[1]) || 0;
    y += Number(m[2] ?? 0) || 0;
  }
  return { x, y };
}

/** Parse a standalone SVG string into a pickable geometry model. */
export function parseSvgElements(svg: string): SvgGeometry {
  const elements: SvgElement[] = [];
  for (const e of scanElements(svg)) {
    const bbox = bboxFor(e.tag, e.attrs, e.content);
    if (!bbox) continue;
    // Offset by the element's injected translate() so a post-drag reparse uses
    // the MOVED bounds — otherwise hit-test + chrome would track the pre-drag box.
    const t = translateOf(e.attrs);
    elements.push({
      key: e.index,
      tag: e.tag,
      bbox: { ...bbox, x: bbox.x + t.x, y: bbox.y + t.y },
    });
  }
  return { viewBox: parseViewBox(svg), elements };
}

function parseViewBox(svg: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const vb = svg.match(/viewBox\s*=\s*"([^"]*)"/);
  if (vb) {
    const p = vb[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      return { x: p[0], y: p[1], width: p[2], height: p[3] };
    }
  }
  // fall back to the root <svg width/height> (origin 0,0)
  const head = svg.slice(0, svg.indexOf(">") + 1);
  return {
    x: 0,
    y: 0,
    width: num(head, "width", 0),
    height: num(head, "height", 0),
  };
}

/** Topmost element (last in document order) whose bbox contains the local point. */
export function elementAtPoint(geom: SvgGeometry, p: Point): SvgElement | null {
  for (let i = geom.elements.length - 1; i >= 0; i--) {
    if (rectContains(geom.elements[i].bbox, p)) return geom.elements[i];
  }
  return null;
}

function fmt(v: number): string {
  // round to 2dp, then let String() drop trailing zeros (2.5 not 2.50).
  return String(Math.round(v * 100) / 100);
}

/**
 * Return a NEW svg string with `translate(dx dy)` (in the SVG's local space)
 * applied to the `key`-th element. Composes with any existing transform
 * (prepended, so it applies outermost). Type-agnostic — works for any element
 * because it injects a transform rather than rewriting tag-specific coords.
 */
export function applyElementTranslate(
  svg: string,
  key: number,
  dx: number,
  dy: number
): string {
  for (const e of scanElements(svg)) {
    if (e.index !== key) continue;
    const openTag = svg.slice(e.openTagStart, e.openTagEnd);
    const existing = attr(openTag, "transform");
    const next =
      `translate(${fmt(dx)} ${fmt(dy)})` + (existing ? ` ${existing}` : "");
    let newTag: string;
    if (existing != null) {
      newTag = openTag.replace(
        /\btransform\s*=\s*"[^"]*"/,
        `transform="${next}"`
      );
    } else if (openTag.endsWith("/>")) {
      newTag = `${openTag.slice(0, -2)} transform="${next}"/>`;
    } else {
      newTag = `${openTag.slice(0, -1)} transform="${next}">`;
    }
    return svg.slice(0, e.openTagStart) + newTag + svg.slice(e.openTagEnd);
  }
  return svg;
}
