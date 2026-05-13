/**
 * Hidden-textarea DOM input relay.
 *
 * Mounts an invisible `<textarea>` and translates raw DOM input events
 * (keystrokes, IME composition, blur) into typed `Action`s. The
 * textarea never holds the editor's text — we clear its value after
 * every input — it exists only to capture native OS input + IME.
 *
 * Implements `InputProvider`. Renderer-agnostic: knows nothing about
 * backends or the session model. The orchestrator routes each Action.
 */

import type { InputCallbacks, InputProvider } from "../input";
import { key_event_to_action } from "../keymap";

export interface DomInputRelayOptions {
  /**
   * Whether the host is running on macOS. Required — see `keymap.ts`
   * for why the package can't detect this itself. The host should
   * compute it from `navigator.userAgent` and pass it in.
   */
  isMac: boolean;
  /** ARIA label for the textarea — surfaces to screen readers. */
  ariaLabel?: string;
}

export class DomInputRelay implements InputProvider {
  private readonly textarea: HTMLTextAreaElement;
  private readonly isMac: boolean;
  private composing = false;
  private disposed = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: InputCallbacks,
    options: DomInputRelayOptions
  ) {
    this.isMac = options.isMac;
    const ta = parent.ownerDocument.createElement("textarea");
    ta.setAttribute("data-grida-text-edit-input", "");
    ta.setAttribute("role", "textbox");
    ta.setAttribute("aria-multiline", "false");
    if (options.ariaLabel) ta.setAttribute("aria-label", options.ariaLabel);
    ta.autocapitalize = "off";
    ta.autocomplete = "off";
    ta.spellcheck = false;
    Object.assign(ta.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "1px",
      height: "1px",
      padding: "0",
      margin: "0",
      border: "none",
      outline: "none",
      resize: "none",
      overflow: "hidden",
      opacity: "0",
      caretColor: "transparent",
      color: "transparent",
      background: "transparent",
      zIndex: "9999",
    });
    parent.appendChild(ta);
    this.textarea = ta;

    ta.addEventListener("input", this.onInput);
    ta.addEventListener("keydown", this.onKeyDown);
    ta.addEventListener("compositionstart", this.onCompositionStart);
    ta.addEventListener("compositionupdate", this.onCompositionUpdate);
    ta.addEventListener("compositionend", this.onCompositionEnd);
    ta.addEventListener("blur", this.onBlur);

    requestAnimationFrame(() => {
      if (!this.disposed) ta.focus();
    });
  }

  focus(): void {
    this.textarea.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textarea.removeEventListener("input", this.onInput);
    this.textarea.removeEventListener("keydown", this.onKeyDown);
    this.textarea.removeEventListener(
      "compositionstart",
      this.onCompositionStart
    );
    this.textarea.removeEventListener(
      "compositionupdate",
      this.onCompositionUpdate
    );
    this.textarea.removeEventListener("compositionend", this.onCompositionEnd);
    this.textarea.removeEventListener("blur", this.onBlur);
    this.textarea.remove();
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  private onInput = () => {
    if (this.composing) return;
    const value = this.textarea.value;
    if (value) {
      this.callbacks.onAction({
        kind: "command",
        cmd: { type: "insert", text: value },
      });
      this.textarea.value = "";
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.composing || e.isComposing) return;
    e.stopPropagation();
    const action = key_event_to_action(e, this.isMac);
    if (action) {
      e.preventDefault();
      this.callbacks.onAction(action);
    }
  };

  private onCompositionStart = () => {
    this.composing = true;
  };

  private onCompositionUpdate = (e: CompositionEvent) => {
    this.callbacks.onAction({
      kind: "command",
      cmd: { type: "composition_set", text: e.data ?? "" },
    });
  };

  private onCompositionEnd = (e: CompositionEvent) => {
    this.composing = false;
    this.callbacks.onAction({
      kind: "command",
      cmd: { type: "composition_commit", text: e.data ?? "" },
    });
    this.textarea.value = "";
  };

  /**
   * Blur is ambiguous: it fires when focus moves to a click target we
   * actually care about (clicking inside the text to reposition the
   * caret), and we immediately refocus the textarea. Defer the commit
   * one frame and check if focus came back to us.
   */
  private onBlur = () => {
    requestAnimationFrame(() => {
      if (this.disposed) return;
      if (this.textarea.ownerDocument.activeElement === this.textarea) return;
      this.callbacks.onBlur();
    });
  };
}
