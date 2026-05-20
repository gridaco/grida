/**
 * Input provider contract.
 *
 * The package routes every external input event (keystroke, IME
 * composition, blur, clipboard intent, undo) through a typed `Action`
 * vocabulary defined in `keymap.ts`. The orchestrator never talks to
 * a textarea, a DOM event, or `navigator` directly — instead it
 * accepts an `InputFactory` and the host supplies an implementation.
 *
 * The default browser-backed impl lives in the `dom` subpath as
 * `DomInputRelay` (a hidden `<textarea>` that captures OS keyboard +
 * IME). Non-browser hosts — tests, theoretical canvas/Skia runtimes —
 * stub `InputProvider` directly.
 */

import type { Action } from "./keymap";

export interface InputCallbacks {
  /**
   * Fired for every action the input produces. Includes character
   * insertion (`{ kind: "command", cmd: { type: "insert", text } }`),
   * navigation, selection, clipboard intents, undo/redo, and lifecycle
   * (commit/cancel).
   */
  onAction(action: Action): void;
  /**
   * Fired when the input surrenders focus *and* the host should commit.
   * The DOM relay defers one frame so click-back-into-text refocus
   * doesn't fire a spurious commit; other impls may have other rules.
   */
  onBlur(): void;
}

export interface InputProvider {
  /** Re-focus the input (called after pointer-down inside the text). */
  focus(): void;
  /** Tear down: remove event listeners, remove any host-injected DOM. */
  dispose(): void;
}

/**
 * Factory called by the orchestrator with its internal callbacks. The
 * returned `InputProvider` owns the input lifecycle until `dispose()`.
 *
 * Hosts typically close over their container/element when constructing
 * the factory:
 *
 * ```ts
 * new TextEditor({
 *   input: (cbs) => new DomInputRelay(container, cbs, { isMac }),
 *   // …
 * });
 * ```
 */
export type InputFactory = (callbacks: InputCallbacks) => InputProvider;
