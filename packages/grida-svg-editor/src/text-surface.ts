// `Surface` + `LayoutEngine` adapter that bridges `@grida/text-editor` to a
// live `SVGTextContentElement` (a `<text>` or leaf `<tspan>`). Caret +
// selection are SVG `<rect>` siblings of the outer `<text>`.

import type { LayoutEngine, Surface } from "@grida/text-editor";

const SVG_NS = "http://www.w3.org/2000/svg";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

export class SvgTextSurface implements Surface, LayoutEngine {
  private readonly textEl: SVGTextContentElement;
  private readonly caretRect: SVGRectElement;
  private readonly selectionRect: SVGRectElement;
  private prevXmlSpace: string | null | undefined = undefined;
  private prevPointerEvents: string | null | undefined = undefined;
  private last_caret_idx = -1;
  private last_caret_visible = false;
  private last_sel_start = -1;
  private last_sel_end = -1;

  constructor(textEl: SVGTextContentElement) {
    this.textEl = textEl;
    const ownerDoc = textEl.ownerDocument;

    // SVG's text content model rejects `<rect>` as a child of `<text>` —
    // walk up to the outermost text element to mount the chrome rects as
    // valid siblings.
    let mountAnchor: SVGElement = textEl;
    while (
      mountAnchor.parentElement instanceof SVGElement &&
      (mountAnchor.localName === "tspan" ||
        mountAnchor.localName === "textPath")
    ) {
      mountAnchor = mountAnchor.parentElement;
    }
    const parent = mountAnchor.parentNode;
    if (!parent) throw new Error("text element has no parent");

    const computedWhitespace =
      ownerDoc.defaultView?.getComputedStyle(textEl).whiteSpace;
    if (
      !(
        computedWhitespace === "pre" ||
        computedWhitespace === "pre-wrap" ||
        computedWhitespace === "break-spaces"
      )
    ) {
      this.prevXmlSpace = textEl.getAttributeNS(XML_NS, "space");
      textEl.setAttributeNS(XML_NS, "xml:space", "preserve");
    }

    // Default `visible-painted` only hits painted glyphs; widen so clicks
    // between characters land on the text for caret positioning.
    this.prevPointerEvents = textEl.getAttribute("pointer-events");
    textEl.setAttribute("pointer-events", "bounding-box");

    const selection = ownerDoc.createElementNS(SVG_NS, "rect");
    selection.setAttribute("fill", "#2563eb");
    selection.setAttribute("fill-opacity", "0.25");
    selection.setAttribute("pointer-events", "none");
    selection.setAttribute("data-svg-text-edit-selection", "");
    selection.style.display = "none";
    parent.insertBefore(selection, mountAnchor);
    this.selectionRect = selection;

    const caret = ownerDoc.createElementNS(SVG_NS, "rect");
    caret.setAttribute("fill", "#2563eb");
    caret.setAttribute("pointer-events", "none");
    caret.setAttribute("data-svg-text-edit-caret", "");
    caret.style.display = "none";
    parent.insertBefore(caret, mountAnchor.nextSibling);
    this.caretRect = caret;
  }

  // ─── Surface ─────────────────────────────────────────────────────────────

  setText(text: string): void {
    if (this.textEl.textContent !== text) this.textEl.textContent = text;
  }

  setCaret(index: number, visible: boolean): void {
    if (index === this.last_caret_idx && visible === this.last_caret_visible)
      return;
    this.last_caret_idx = index;
    this.last_caret_visible = visible;
    if (!visible) {
      this.caretRect.style.display = "none";
      return;
    }
    const m = this.metrics();
    const x = this.charX(index);
    this.caretRect.setAttribute("x", String(x - 0.75));
    this.caretRect.setAttribute("y", String(m.top));
    this.caretRect.setAttribute("width", "1.5");
    this.caretRect.setAttribute("height", String(m.height));
    this.caretRect.style.display = "block";
  }

  setSelection(start: number, end: number): void {
    if (start === this.last_sel_start && end === this.last_sel_end) return;
    this.last_sel_start = start;
    this.last_sel_end = end;
    if (start === end) {
      this.selectionRect.style.display = "none";
      return;
    }
    const m = this.metrics();
    const x1 = this.charX(start);
    const x2 = this.charX(end);
    this.selectionRect.setAttribute("x", String(Math.min(x1, x2)));
    this.selectionRect.setAttribute("y", String(m.top));
    this.selectionRect.setAttribute("width", String(Math.abs(x2 - x1)));
    this.selectionRect.setAttribute("height", String(m.height));
    this.selectionRect.style.display = "block";
  }

  dispose(keepEditMutations = false): void {
    this.caretRect.remove();
    this.selectionRect.remove();
    if (this.prevXmlSpace !== undefined && !keepEditMutations) {
      if (this.prevXmlSpace === null) {
        this.textEl.removeAttributeNS(XML_NS, "space");
      } else {
        this.textEl.setAttributeNS(XML_NS, "xml:space", this.prevXmlSpace);
      }
    }
    // pointer-events="bounding-box" is edit-time only; always restore.
    if (this.prevPointerEvents !== undefined) {
      if (this.prevPointerEvents === null) {
        this.textEl.removeAttribute("pointer-events");
      } else {
        this.textEl.setAttribute("pointer-events", this.prevPointerEvents);
      }
    }
    this.prevXmlSpace = undefined;
    this.prevPointerEvents = undefined;
  }

  // ─── LayoutEngine ────────────────────────────────────────────────────────

  positionAtPoint(clientX: number, clientY: number): number {
    const ctm = this.textEl.getScreenCTM();
    const svg = this.textEl.ownerSVGElement;
    if (!ctm || !svg) return 0;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return this.localXToCharIndex(local.x);
  }

  /**
   * Single-line `<text>` element: there's no "previous visual line" to move
   * to. Cocoa single-line convention: Up/PageUp/line_start → doc start;
   * Down/PageDown/line_end → doc end.
   */
  positionForNavigation(
    _index: number,
    direction:
      | "up"
      | "down"
      | "line_start"
      | "line_end"
      | "page_up"
      | "page_down"
  ): number | null {
    const text = this.textEl.textContent ?? "";
    switch (direction) {
      case "up":
      case "page_up":
      case "line_start":
        return 0;
      case "down":
      case "page_down":
      case "line_end":
        return text.length;
    }
  }

  // ─── Internal geometry ───────────────────────────────────────────────────

  private metrics(): { top: number; height: number } {
    try {
      const b = this.textEl.getBBox();
      if (b.height > 0) return { top: b.y, height: b.height };
    } catch {
      // fall through
    }
    const fontSize =
      parseFloat(
        this.textEl.ownerDocument.defaultView?.getComputedStyle(this.textEl)
          .fontSize ?? "16"
      ) || 16;
    return {
      top: parseFloat(this.textEl.getAttribute("y") ?? "0") - fontSize * 0.85,
      height: fontSize,
    };
  }

  private charX(i: number): number {
    const text = this.textEl.textContent ?? "";
    const baseX = parseFloat(this.textEl.getAttribute("x") ?? "0");
    if (text.length === 0) return baseX;
    if (i <= 0) {
      try {
        return this.textEl.getStartPositionOfChar(0).x;
      } catch {
        return baseX;
      }
    }
    if (i >= text.length) {
      try {
        return this.textEl.getEndPositionOfChar(text.length - 1).x;
      } catch {
        return baseX;
      }
    }
    try {
      return this.textEl.getStartPositionOfChar(i).x;
    } catch {
      return baseX;
    }
  }

  private localXToCharIndex(localX: number): number {
    const text = this.textEl.textContent ?? "";
    if (!text) return 0;
    for (let i = 0; i < text.length; i++) {
      try {
        const ext = this.textEl.getExtentOfChar(i);
        if (localX < ext.x + ext.width / 2) return i;
      } catch {
        break;
      }
    }
    return text.length;
  }
}
