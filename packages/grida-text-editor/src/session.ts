/**
 * Pure text/caret/selection model.
 *
 * No DOM, no SVG. Drives the editor: every mutation funnels through
 * here, every renderer subscribes here. Trivial to unit-test.
 *
 * Selection model: `anchor` + `caret`. When `anchor` is non-null and
 * differs from `caret`, the selection range is
 * `[min(anchor, caret), max(anchor, caret)]`. Convenient because all
 * caret-extension operations (shift+arrow, drag) just move the caret.
 *
 * Composition (IME preedit): stored separately from `text`. Renderers
 * compose the display string via `displayText` / `compositionRange`.
 */

export type Selection = { start: number; end: number };

export type Composition = { start: number; text: string };

export interface SessionSnapshot {
  text: string;
  caret: number;
  anchor: number | null;
}

export class TextEditSession {
  private _text: string;
  private _caret: number;
  private _anchor: number | null;
  private _composition: Composition | null = null;
  private listeners = new Set<() => void>();

  constructor(initialText: string) {
    this._text = initialText;
    this._caret = initialText.length;
    this._anchor = null;
  }

  get text(): string {
    return this._text;
  }
  get caret(): number {
    return this._caret;
  }
  get selection(): Selection | null {
    if (this._anchor === null || this._anchor === this._caret) return null;
    return {
      start: Math.min(this._anchor, this._caret),
      end: Math.max(this._anchor, this._caret),
    };
  }
  get composition(): Composition | null {
    return this._composition;
  }
  /**
   * The text the user sees while editing. When IME composition is
   * active, the preedit is spliced in at `composition.start`.
   */
  get displayText(): string {
    const c = this._composition;
    if (!c) return this._text;
    return this._text.slice(0, c.start) + c.text + this._text.slice(c.start);
  }
  /**
   * The caret index in `displayText`. Pre-edit shifts the visible
   * caret past the inserted preedit.
   */
  get displayCaret(): number {
    const c = this._composition;
    if (!c) return this._caret;
    return this._caret >= c.start ? this._caret + c.text.length : this._caret;
  }
  /**
   * Range of the active preedit within `displayText`, or null.
   */
  get displayCompositionRange(): Selection | null {
    const c = this._composition;
    if (!c) return null;
    return { start: c.start, end: c.start + c.text.length };
  }
  /**
   * Selection range in `displayText` coordinates — committed-text
   * offsets shifted past the active preedit. Returns null when there
   * is no selection. The orchestrator should hand this directly to
   * `Surface.setSelection`; the offset math doesn't belong on the
   * outside.
   */
  get displaySelection(): Selection | null {
    const sel = this.selection;
    if (!sel) return null;
    const c = this._composition;
    if (!c) return sel;
    const shift = c.text.length;
    return {
      start: sel.start >= c.start ? sel.start + shift : sel.start,
      end: sel.end >= c.start ? sel.end + shift : sel.end,
    };
  }
  get snapshot(): SessionSnapshot {
    return { text: this._text, caret: this._caret, anchor: this._anchor };
  }

  load(snapshot: SessionSnapshot): void {
    this._text = snapshot.text;
    this._caret = snapshot.caret;
    this._anchor = snapshot.anchor;
    this._composition = null;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  selectAll(): void {
    this._anchor = 0;
    this._caret = this._text.length;
    this._composition = null;
    this.emit();
  }

  setSelection(anchor: number, focus: number): void {
    const t = this._text.length;
    this._anchor = Math.max(0, Math.min(t, anchor));
    this._caret = Math.max(0, Math.min(t, focus));
    if (this._anchor === this._caret) this._anchor = null;
    this._composition = null;
    this.emit();
  }

  insertText(text: string): void {
    if (!text) return;
    const sel = this.selection;
    if (sel) {
      this._text =
        this._text.slice(0, sel.start) + text + this._text.slice(sel.end);
      this._caret = sel.start + text.length;
    } else {
      this._text =
        this._text.slice(0, this._caret) + text + this._text.slice(this._caret);
      this._caret += text.length;
    }
    this._anchor = null;
    this._composition = null;
    this.emit();
  }

  deleteBackward(): void {
    const sel = this.selection;
    if (sel) {
      this._text = this._text.slice(0, sel.start) + this._text.slice(sel.end);
      this._caret = sel.start;
    } else if (this._caret > 0) {
      this._text =
        this._text.slice(0, this._caret - 1) + this._text.slice(this._caret);
      this._caret--;
    }
    this._anchor = null;
    this._composition = null;
    this.emit();
  }

  deleteForward(): void {
    const sel = this.selection;
    if (sel) {
      this._text = this._text.slice(0, sel.start) + this._text.slice(sel.end);
      this._caret = sel.start;
    } else if (this._caret < this._text.length) {
      this._text =
        this._text.slice(0, this._caret) + this._text.slice(this._caret + 1);
    }
    this._anchor = null;
    this._composition = null;
    this.emit();
  }

  /**
   * Move the caret to `target`, clamped to text bounds. If `extend` is
   * true, the anchor stays put (creating or extending a selection
   * range); if false, the anchor is cleared (collapsing any active
   * selection).
   *
   * Emits whenever ANY observable state (caret OR anchor) changes —
   * including the case where the caret was already at `target` but
   * the anchor was non-null and is now cleared (e.g. Shift+Home
   * leaves caret at 0 with anchor at n, ArrowLeft then collapses to
   * anchor=null without moving the caret). Missing the emit there
   * leaves the surface drawing a stale selection rect on top of the
   * caret.
   */
  moveCaret(target: number, extend: boolean): void {
    const clamped = Math.max(0, Math.min(this._text.length, target));
    const prev_caret = this._caret;
    const prev_anchor = this._anchor;
    if (extend) {
      if (this._anchor === null) this._anchor = this._caret;
    } else {
      this._anchor = null;
    }
    this._caret = clamped;
    if (this._caret !== prev_caret || this._anchor !== prev_anchor) {
      this.emit();
    }
  }

  /**
   * Bulk replace. Caret lands at `start + text.length`. Used by IME
   * commit when preedit length changes and by word/line-granularity
   * delete/backspace.
   */
  replace(start: number, end: number, text: string): void {
    const s = Math.max(0, Math.min(this._text.length, start));
    const e = Math.max(s, Math.min(this._text.length, end));
    this._text = this._text.slice(0, s) + text + this._text.slice(e);
    this._caret = s + text.length;
    this._anchor = null;
    this._composition = null;
    this.emit();
  }

  // ─── IME composition (preedit) ──────────────────────────────────────────

  /**
   * Set or update the active preedit string. If no composition is
   * active, anchors at the current caret. If text is empty, clears.
   */
  setComposition(text: string): void {
    if (!text) {
      if (this._composition) {
        this._composition = null;
        this.emit();
      }
      return;
    }
    if (!this._composition) {
      // Drop any selection so preedit anchors at a single point.
      const sel = this.selection;
      if (sel) {
        this._text = this._text.slice(0, sel.start) + this._text.slice(sel.end);
        this._caret = sel.start;
        this._anchor = null;
      }
      this._composition = { start: this._caret, text };
    } else {
      this._composition.text = text;
    }
    this.emit();
  }

  /**
   * Finalize composition: drop the preedit and insert `text` at the
   * composition's start (which is where the caret already is).
   */
  commitComposition(text: string): void {
    this._composition = null;
    if (text) {
      this.insertText(text);
    } else {
      this.emit();
    }
  }

  cancelComposition(): void {
    if (this._composition) {
      this._composition = null;
      this.emit();
    }
  }
}
