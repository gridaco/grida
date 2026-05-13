/**
 * Surface — host-implemented paint sink.
 *
 * The package tells the surface *what* to render (text content, caret
 * position, selection range, optional composition range) and *when*
 * (every state mutation). The host decides *how* it looks: caret bar
 * vs wedge, selection rectangle color, whether IME preedit gets
 * underlined, etc.
 *
 * The surface may also make ephemeral DOM/state changes for the
 * duration of an edit session (e.g. the SVG backend opts a collapsing-
 * whitespace `<text>` into `xml:space="preserve"`). `dispose` lets the
 * caller decide whether those changes stay (final content needs them)
 * or get reverted (final content doesn't).
 */
export interface Surface {
  /** Replace the rendered text. Called on every keystroke. */
  setText(text: string): void;

  /**
   * Render the caret at `index` ([0..text.length]). `visible` toggles
   * for the blink animation — the package handles blink timing.
   */
  setCaret(index: number, visible: boolean): void;

  /**
   * Render a selection range. `start === end` clears it.
   */
  setSelection(start: number, end: number): void;

  /**
   * Optional IME preedit overlay. Surfaces may no-op in V1; required
   * once attributed-text/visible-composition support lands.
   */
  setComposition?(start: number, text: string): void;

  /**
   * Tear down the surface.
   *
   * `keepEditMutations` tells the surface what to do with any DOM
   * changes it made *for the duration of editing* (e.g. an SVG
   * `xml:space="preserve"` opt-in). `true` keeps them (the final
   * committed text requires them); `false` (default) reverts them.
   */
  dispose(keepEditMutations?: boolean): void;
}
