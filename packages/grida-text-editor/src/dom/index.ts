/**
 * `@grida/text-editor/dom` — browser wiring.
 *
 * Provides the DOM-backed `InputProvider` (`DomInputRelay`), the
 * browser `Clipboard` impl (`DomClipboard`), and a `createTextEditor`
 * convenience that wires them — plus the caret-blink timer — to the
 * platform-agnostic `TextEditor` in `@grida/text-editor`.
 *
 * The core package never imports from here. Tests run against the
 * core directly with stubs; the browser app imports from this subpath.
 *
 *     // Browser app
 *     import { createTextEditor } from "@grida/text-editor/dom";
 *     const editor = createTextEditor({ container, layout, surface, … });
 *
 *     // Test / canvas runtime
 *     import { TextEditor } from "@grida/text-editor";
 *     const editor = new TextEditor({ input: stubFactory, clipboard: stub, … });
 */

import {
  TextEditor,
  type TextEditorOptions,
  type SessionSnapshot,
} from "../text-editor";
import { DomClipboard } from "./clipboard";
import { DomInputRelay } from "./input-relay";

export { DomClipboard } from "./clipboard";
export { DomInputRelay, type DomInputRelayOptions } from "./input-relay";

const CARET_BLINK_MS = 530;

/**
 * Options for `createTextEditor`. Mirrors `TextEditorOptions` but
 * replaces the `input` factory and `clipboard` instance with browser
 * defaults wired automatically, and adds `container` / `isMac` /
 * `ariaLabel` which the DOM defaults need.
 */
export interface CreateTextEditorOptions extends Omit<
  TextEditorOptions,
  "input" | "clipboard"
> {
  /** Parent element that hosts the hidden `<textarea>`. */
  container: HTMLElement;
  /**
   * Whether the host runs on macOS. Required — the package never
   * sniffs `navigator`. Browser hosts compute via
   * `/Mac|iPod|iPhone|iPad/.test(navigator.userAgent)`.
   */
  isMac: boolean;
  /** ARIA label for the relay textarea. */
  ariaLabel?: string;
  /**
   * Override the default `DomClipboard`. Useful for tests that want
   * to inject a fake (the core package's `TextEditor` accepts the
   * `Clipboard` interface directly; this is the same seam for users
   * of the convenience).
   */
  clipboard?: TextEditorOptions["clipboard"];
}

/**
 * Construct a `TextEditor` wired with the DOM `InputRelay` +
 * `Clipboard` and a `setInterval(530ms)` caret-blink loop. The blink
 * loop self-cancels when the editor settles (commit/cancel), so most
 * hosts don't need to do anything for cleanup — `editor.commit()`
 * or `editor.cancel()` tears the whole thing down.
 */
export function createTextEditor(opts: CreateTextEditorOptions): TextEditor {
  const { container, isMac, ariaLabel, callbacks, ...rest } = opts;

  let timer: ReturnType<typeof setInterval> | null = null;
  const stopBlink = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const editor = new TextEditor({
    ...rest,
    input: (cbs) => new DomInputRelay(container, cbs, { isMac, ariaLabel }),
    clipboard: opts.clipboard ?? new DomClipboard(),
    callbacks: {
      ...callbacks,
      onCommit: (text) => {
        stopBlink();
        callbacks.onCommit(text);
      },
      onCancel: () => {
        stopBlink();
        callbacks.onCancel();
      },
    },
  });

  timer = setInterval(() => {
    editor.tickBlink();
  }, CARET_BLINK_MS);

  return editor;
}

export type { SessionSnapshot };
