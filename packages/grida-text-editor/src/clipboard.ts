/**
 * Plain-text clipboard contract.
 *
 * V1 only handles plain text — copy/cut from session selection, paste
 * inserts text at the caret. HTML rich-text waits for V2 attributed-
 * text.
 *
 * The default browser-backed impl lives in the `dom` subpath as
 * `DomClipboard` (async Clipboard API + `execCommand("copy")`
 * fallback). Non-browser hosts pass their own.
 */

export interface Clipboard {
  copy(text: string): Promise<void>;
  /**
   * Returns the pasted text, or empty string if the clipboard is empty
   * or read was denied.
   */
  paste(): Promise<string>;
}
