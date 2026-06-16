// `Surface` + `LayoutEngine` adapter that bridges `@grida/text-editor` to a
// live `SVGTextContentElement` (a `<text>` or leaf `<tspan>`).
//
// This is a GEOMETRY PROVIDER, not a renderer. It owns the text-editing DOM
// mutations (the live text content + edit-time `xml:space` / `pointer-events`)
// and computes the caret + selection geometry in LOCAL svg user-space, but it
// does NOT paint them. Instead it emits that geometry to a host `sink`, which
// the editor (`dom.ts`) projects and hands to `@grida/hud`'s text-edit chrome.
// The HUD draws caret + selection on its canvas — above the content and the
// selection box (never occluded) and at a constant on-screen thickness.

import type { LayoutEngine, Surface } from "@grida/text-editor";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

/**
 * Caret + selection geometry in LOCAL svg user-space. `null` = no chrome.
 * The host projects this to screen space (the local→world transform comes from
 * the live element's CTM) before handing it to the HUD.
 */
export interface SvgTextEditGeometry {
  /** Caret endpoints (local) + blink visibility; `null` when there's no caret. */
  caret: {
    top: [number, number];
    bottom: [number, number];
    visible: boolean;
  } | null;
  /** Selection highlight rect (local); `null` when the selection is collapsed. */
  selection: { x: number; y: number; width: number; height: number } | null;
}

/** Sink the host wires to push geometry into the HUD (and clear it on `null`). */
export type SvgTextEditChromeSink = (geom: SvgTextEditGeometry | null) => void;

export class SvgTextSurface implements Surface, LayoutEngine {
  private readonly textEl: SVGTextContentElement;
  private readonly sink: SvgTextEditChromeSink;
  private prevXmlSpace: string | null | undefined = undefined;
  private prevPointerEvents: string | null | undefined = undefined;
  private caret: SvgTextEditGeometry["caret"] = null;
  private selection: SvgTextEditGeometry["selection"] = null;
  private last_caret_idx = -1;
  private last_caret_visible = false;
  private last_sel_start = -1;
  private last_sel_end = -1;

  /**
   * @param textEl the live text element to drive.
   * @param sink   receives the caret + selection geometry (local space) on
   *   every change; the host projects + forwards it to the HUD. Called with
   *   `null` on dispose so the host clears the chrome.
   */
  constructor(textEl: SVGTextContentElement, sink: SvgTextEditChromeSink) {
    this.textEl = textEl;
    this.sink = sink;
    const ownerDoc = textEl.ownerDocument;

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
    const m = this.metrics();
    const x = this.charX(index);
    this.caret = {
      top: [x, m.top],
      bottom: [x, m.top + m.height],
      visible,
    };
    this.emit();
  }

  setSelection(start: number, end: number): void {
    if (start === this.last_sel_start && end === this.last_sel_end) return;
    this.last_sel_start = start;
    this.last_sel_end = end;
    if (start === end) {
      this.selection = null;
      this.emit();
      return;
    }
    const m = this.metrics();
    const x1 = this.charX(start);
    const x2 = this.charX(end);
    this.selection = {
      x: Math.min(x1, x2),
      y: m.top,
      width: Math.abs(x2 - x1),
      height: m.height,
    };
    this.emit();
  }

  private emit(): void {
    this.sink({ caret: this.caret, selection: this.selection });
  }

  dispose(keepEditMutations = false): void {
    this.sink(null);
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
