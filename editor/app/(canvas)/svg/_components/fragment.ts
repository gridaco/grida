/**
 * Consumer-side fragment authoring for `commands.insert_fragment`.
 *
 * `@grida/svg-editor` deliberately ships no placement opt — "position is
 * authored content" (see the `insert_fragment` JSDoc). To land an asset at
 * a document-space point, the position is authored INTO the markup before
 * the single `insert_fragment` call: strip the asset's `<svg>` shell
 * (keeping its inner markup byte-verbatim), read its viewBox for the
 * intrinsic box, and wrap the content in a positioning
 * `<g transform="translate(…)">`. The whole drop is then one undo step and
 * round-trips as ordinary markup.
 *
 * String-level on purpose: no DOM parse, no re-serialization (a
 * `XMLSerializer` pass would re-stamp `xmlns` on every child and destroy
 * the verbatim-trivia property the editor preserves). The shell scan is
 * demo-grade — it assumes the opening `<svg …>` tag contains no literal
 * `>` inside attribute values, which holds for icon-set files.
 */
export namespace fragment {
  export type ViewBox = {
    min_x: number;
    min_y: number;
    width: number;
    height: number;
  };

  const SVG_OPEN_RE = /<svg(?:\s[^>]*)?>/i;
  const VIEWBOX_RE =
    /viewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/;

  /**
   * Split a standalone SVG document into its inner markup (bytes between
   * the root `<svg …>` open tag and the last `</svg>`) and its declared
   * viewBox. A string with no `<svg>` shell is already a bare fragment —
   * returned as-is with `viewbox: null`.
   */
  export function strip_shell(svg: string): {
    inner: string;
    viewbox: ViewBox | null;
  } {
    const open = SVG_OPEN_RE.exec(svg);
    if (!open) return { inner: svg, viewbox: null };

    const start = open.index + open[0].length;
    const end = svg.lastIndexOf("</svg");
    const inner = end > start ? svg.slice(start, end) : "";

    const vb = VIEWBOX_RE.exec(open[0]);
    const viewbox = vb
      ? {
          min_x: Number(vb[1]),
          min_y: Number(vb[2]),
          width: Number(vb[3]),
          height: Number(vb[4]),
        }
      : null;

    return { inner, viewbox };
  }

  /**
   * Author a fragment positioned at a document-space point: the asset's
   * intrinsic box (its viewBox) is centered on `at`. Without a viewBox the
   * fragment's local origin lands on `at` — best effort for content whose
   * box isn't knowable pre-insert.
   */
  export function position(svg: string, at: { x: number; y: number }): string {
    const { inner, viewbox } = strip_shell(svg);
    const cx = viewbox ? viewbox.min_x + viewbox.width / 2 : 0;
    const cy = viewbox ? viewbox.min_y + viewbox.height / 2 : 0;
    const tx = fmt(at.x - cx);
    const ty = fmt(at.y - cy);
    return `<g transform="translate(${tx} ${ty})">${inner}</g>`;
  }

  /** Trim float noise so the authored transform stays readable. */
  function fmt(n: number): string {
    return String(Math.round(n * 100) / 100);
  }
}
