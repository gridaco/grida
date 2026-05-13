/**
 * TextEditor — the orchestrator.
 *
 * Wires the package's pure layers (session, edit-command, history,
 * input-relay, clipboard) to the host's BYOB contracts (`LayoutEngine`
 * for geometry, `Surface` for paint).
 *
 * Host responsibilities:
 *  - construct/destroy at the right time
 *  - provide `layout` + `surface` impls
 *  - act on `onCommit(text)` / `onCancel()` (persist or discard)
 *  - (optional) `onUndoFallthrough` / `onRedoFallthrough` to let the
 *    host's document-level history take over when the session stack
 *    is exhausted
 *
 * The orchestrator owns keyboard, IME, clipboard, multi-click
 * escalation, caret blink, and the commit/cancel lifecycle.
 */

import type { Clipboard } from "./clipboard";
import { apply_command, type EditingCommand } from "./edit-command";
import { HistoryStack } from "./history";
import type { InputFactory, InputProvider } from "./input";
import type { Action } from "./keymap";
import type { LayoutEngine } from "./layout-engine";
import { TextEditSession, type SessionSnapshot } from "./session";
import type { Surface } from "./surface";

const MULTI_CLICK_TIMEOUT_MS = 500;
const MULTI_CLICK_RADIUS = 5;

export interface TextEditorCallbacks {
  /** Live: every textContent change. */
  onChange(text: string): void;
  /** Final commit (Enter / blur / `commit()`). */
  onCommit(text: string): void;
  /** Cancel (Escape). */
  onCancel(): void;
  /** Session undo stack empty; host should run its own undo. */
  onUndoFallthrough?(): void;
  /** Session redo stack empty; host should run its own redo. */
  onRedoFallthrough?(): void;
}

export interface TextEditorOptions {
  initialText: string;
  layout: LayoutEngine;
  surface: Surface;
  callbacks: TextEditorCallbacks;
  /**
   * Factory called by the orchestrator with its internal callbacks.
   * Browser hosts typically pass `(cbs) => new DomInputRelay(container,
   * cbs, { isMac })` from the `@grida/text-editor/dom` subpath; tests
   * and non-browser hosts pass a stub.
   */
  input: InputFactory;
  /**
   * Clipboard impl. Browser hosts pass `new DomClipboard()` from
   * `@grida/text-editor/dom`; non-browser hosts pass their own.
   */
  clipboard: Clipboard;
  /**
   * Whether to keep edit-time surface mutations on commit when the
   * final text requires them. Default: `false` (host must opt in).
   *
   * Backends that mutate the underlying document during editing
   * (e.g. the SVG host's scoped `xml:space="preserve"`) pass a
   * predicate here; the orchestrator forwards it to
   * `Surface.dispose(keepEditMutations)`.
   */
  requiresMutationsForCommit?(text: string): boolean;
}

type ClickState = {
  count: number;
  time: number;
  x: number;
  y: number;
};

export class TextEditor {
  private readonly session: TextEditSession;
  private readonly layout: LayoutEngine;
  private readonly surface: Surface;
  private readonly input: InputProvider;
  private readonly history = new HistoryStack();
  private readonly clipboard: Clipboard;
  private readonly cb: TextEditorCallbacks;
  private readonly requiresMutations: (text: string) => boolean;
  private readonly unsubscribe: () => void;

  private settled = false;
  private dragging = false;
  private caretVisible = true;
  private clickState: ClickState = { count: 0, time: 0, x: 0, y: 0 };
  /**
   * Last committed-text we notified the host about. We render the
   * displayText (which includes the IME preedit) to the surface every
   * frame, but only call `onChange` when the host's view of the text
   * actually changes — otherwise the host writes back the committed
   * text and clobbers the preedit we just rendered.
   */
  private lastNotifiedText: string;

  constructor(opts: TextEditorOptions) {
    this.cb = opts.callbacks;
    this.layout = opts.layout;
    this.surface = opts.surface;
    this.clipboard = opts.clipboard;
    this.requiresMutations = opts.requiresMutationsForCommit ?? (() => false);
    this.session = new TextEditSession(opts.initialText);
    this.session.selectAll();
    this.lastNotifiedText = opts.initialText;

    this.input = opts.input({
      onAction: (action) => this.handle_action(action),
      onBlur: () => this.commit(),
    });

    this.unsubscribe = this.session.subscribe(() => this.render());
    this.render();
  }

  // ─── External API ────────────────────────────────────────────────────────

  /**
   * Pointer-down inside the editing text. `clickCount` is computed
   * internally via timeout + radius — pass shift to extend selection.
   *
   * V1 escalation: k=1 caret, k=2 word, k≥3 select all.
   */
  pointerDown(clientX: number, clientY: number, shift: boolean): void {
    const count = this.computeClickCount(clientX, clientY);
    const idx = this.layout.positionAtPoint(clientX, clientY);
    if (count >= 3) {
      apply_command(this.session, { type: "select_all" });
    } else if (count === 2) {
      apply_command(this.session, {
        type: "select_at",
        index: idx,
        granularity: "word",
      });
    } else {
      this.session.moveCaret(idx, shift);
    }
    this.dragging = count === 1;
    this.input.focus();
  }

  pointerMove(clientX: number, clientY: number): void {
    if (!this.dragging) return;
    const idx = this.layout.positionAtPoint(clientX, clientY);
    this.session.moveCaret(idx, true);
  }

  pointerUp(): void {
    this.dragging = false;
  }

  commit(): void {
    if (!this.claim_settle()) return;
    const text = this.session.text;
    this.teardown(this.requiresMutations(text));
    this.cb.onCommit(text);
  }

  cancel(): void {
    if (!this.claim_settle()) return;
    this.teardown(false);
    this.cb.onCancel();
  }

  /** Once-and-only-once gate for `commit`/`cancel`. Returns whether the
   *  caller now owns the lifecycle transition. */
  private claim_settle(): boolean {
    if (this.settled) return false;
    this.settled = true;
    return true;
  }

  // ─── Action dispatch ─────────────────────────────────────────────────────

  private handle_action(action: Action): void {
    switch (action.kind) {
      case "command":
        this.dispatch_command(action.cmd);
        return;
      case "commit":
        this.commit();
        return;
      case "cancel":
        this.cancel();
        return;
      case "copy":
        this.handle_copy();
        return;
      case "cut":
        this.handle_cut();
        return;
      case "paste":
        this.handle_paste();
        return;
      case "undo":
        this.handle_undo();
        return;
      case "redo":
        this.handle_redo();
        return;
    }
  }

  private dispatch_command(cmd: EditingCommand): void {
    const before = this.session.snapshot;
    const kind = apply_command(this.session, cmd, this.layout);
    if (kind) {
      this.history.push(before, this.session.snapshot, kind);
    }
  }

  private handle_copy(): void {
    const sel = this.session.selection;
    if (!sel) return;
    const text = this.session.text.slice(sel.start, sel.end);
    void this.clipboard.copy(text);
  }

  private handle_cut(): void {
    const sel = this.session.selection;
    if (!sel) return;
    const text = this.session.text.slice(sel.start, sel.end);
    void this.clipboard.copy(text);
    const before = this.session.snapshot;
    this.session.replace(sel.start, sel.end, "");
    this.history.push(before, this.session.snapshot, "cut");
  }

  private handle_paste(): void {
    void this.clipboard.paste().then((text) => {
      if (!text || this.settled) return;
      const before = this.session.snapshot;
      this.session.insertText(text);
      this.history.push(before, this.session.snapshot, "paste");
    });
  }

  private handle_undo(): void {
    const snap = this.history.undo();
    if (snap === null) {
      this.cb.onUndoFallthrough?.();
      return;
    }
    this.session.load(snap);
  }

  private handle_redo(): void {
    const snap = this.history.redo();
    if (snap === null) {
      this.cb.onRedoFallthrough?.();
      return;
    }
    this.session.load(snap);
  }

  // ─── Multi-click ─────────────────────────────────────────────────────────

  private computeClickCount(clientX: number, clientY: number): number {
    const now = nowMs();
    const prev = this.clickState;
    const dt = now - prev.time;
    const dist = Math.hypot(clientX - prev.x, clientY - prev.y);
    let count: number;
    if (dt < MULTI_CLICK_TIMEOUT_MS && dist < MULTI_CLICK_RADIUS) {
      count = prev.count + 1;
    } else {
      count = 1;
    }
    this.clickState = { count, time: now, x: clientX, y: clientY };
    return count;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private render(): void {
    const display = this.session.displayText;
    this.surface.setText(display);
    const committed = this.session.text;
    if (committed !== this.lastNotifiedText) {
      this.lastNotifiedText = committed;
      this.cb.onChange(committed);
    }
    // Caret is suppressed during selection (matches the Rust crate's
    // "no blink while selecting" behavior).
    const sel = this.session.displaySelection;
    this.caretVisible = sel === null;
    this.surface.setCaret(this.session.displayCaret, this.caretVisible);
    if (sel) this.surface.setSelection(sel.start, sel.end);
    else this.surface.setSelection(0, 0);
    if (this.surface.setComposition) {
      const comp = this.session.displayCompositionRange;
      if (comp) {
        this.surface.setComposition(
          comp.start,
          display.slice(comp.start, comp.end)
        );
      } else {
        this.surface.setComposition(0, "");
      }
    }
  }

  /**
   * Advance the caret-blink phase by one tick. Suppressed during
   * selection (matches the Rust crate's "no blink while selecting"
   * behavior). The host owns the timer — the `dom` subpath wires a
   * `setInterval(530ms)` by default; non-browser hosts drive their
   * own cadence (or skip blinking entirely).
   */
  tickBlink(): void {
    if (this.settled) return;
    if (this.session.selection !== null) return;
    this.caretVisible = !this.caretVisible;
    this.surface.setCaret(this.session.displayCaret, this.caretVisible);
  }

  private teardown(keepEditMutations: boolean): void {
    this.unsubscribe();
    this.surface.dispose(keepEditMutations);
    this.input.dispose();
  }
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } })
    .performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

// Re-export the snapshot type for hosts that want to inspect/save state.
export type { SessionSnapshot };
