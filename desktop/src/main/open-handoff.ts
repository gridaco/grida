/**
 * GRIDA-SEC-004 — cross-instance "open" handoff codec.
 *
 * macOS hands a file opened via "Open With" to a *new* instance when our
 * app is not the **default** handler for that type (`.svg` is
 * `LSHandlerRank: Alternate`; `.grida` is `Owner`). That new instance
 * loses the single-instance lock and would otherwise quit and drop the
 * file. The fix is for the secondary to *forward* the open to the running
 * primary instead — riding `app.requestSingleInstanceLock(additionalData)`
 * → the primary's `second-instance` event (the only documented
 * secondary→primary channel). See the macOS limitation in
 * electron/electron#14029 and the wiring in `main.ts`.
 *
 * This module is the **wire contract** for that handoff: pure, no electron
 * imports, so the secondary's `encode` and the primary's `decode` are one
 * testable unit. The two ends are written by the same hand but cross a
 * process boundary — treat it like a protocol: `decode` is tolerant and
 * yields `[]` for any shape it doesn't recognize (a foreign or legacy
 * `second-instance` payload must never be mistaken for our opens).
 *
 * `fromArgv` + `isSupportedFile` live here too: classifying an argv entry
 * as a file/url open is the same pure "what counts as an open" logic, used
 * for the Windows/Linux path where files arrive on the command line rather
 * than via the macOS `open-file` Apple Event.
 */

import path from "node:path";

const DEEP_LINK_SCHEME = "grida://";
const SUPPORTED_FILE_EXTENSIONS = new Set([".svg", ".grida"]);

// Tagged envelope: `additionalData` is `Record<any, any>`, so the primary
// must be able to tell our forward from an arbitrary payload. The version
// suffix lets a future shape change be recognized rather than silently
// mis-decoded.
const ENVELOPE_TAG_KEY = "__grida_open_handoff";
const ENVELOPE_TAG_VALUE = "v1";

export namespace open_handoff {
  /** A single thing the OS asked us to open. */
  export type Open =
    | { readonly kind: "file"; readonly path: string }
    | { readonly kind: "url"; readonly url: string };

  /** Does this path look like a file Grida opens? Extension-only — the
   * agent server is the authority on whether it can actually be read. */
  export function isSupportedFile(filePath: string): boolean {
    return SUPPORTED_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  /**
   * Classify command-line arguments into opens (Windows/Linux file
   * associations + `grida://` deep links). Content-based, not
   * position-based: the exec path, app dir (`.`), and flags simply don't
   * classify, so callers can pass the whole `argv` / `second-instance`
   * `commandLine` without trimming. Order is preserved.
   */
  export function fromArgv(argv: readonly string[]): Open[] {
    const opens: Open[] = [];
    for (const arg of argv) {
      if (arg.startsWith(DEEP_LINK_SCHEME))
        opens.push({ kind: "url", url: arg });
      else if (isSupportedFile(arg)) opens.push({ kind: "file", path: arg });
    }
    return opens;
  }

  /** Build the `additionalData` payload a secondary instance forwards to
   * the primary. */
  export function encode(opens: readonly Open[]): Record<string, unknown> {
    return {
      [ENVELOPE_TAG_KEY]: ENVELOPE_TAG_VALUE,
      opens: opens.map((o) =>
        o.kind === "file"
          ? { kind: "file", path: o.path }
          : { kind: "url", url: o.url }
      ),
    };
  }

  /**
   * Read opens back out of a `second-instance` `additionalData`. Tolerant
   * by design — returns `[]` for anything that isn't our tagged envelope,
   * and drops individual entries that aren't well-formed, so a foreign or
   * legacy payload can never be mistaken for an open.
   */
  export function decode(data: unknown): Open[] {
    if (typeof data !== "object" || data === null) return [];
    const envelope = data as Record<string, unknown>;
    if (envelope[ENVELOPE_TAG_KEY] !== ENVELOPE_TAG_VALUE) return [];
    if (!Array.isArray(envelope.opens)) return [];

    const opens: Open[] = [];
    for (const item of envelope.opens) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      if (
        entry.kind === "file" &&
        typeof entry.path === "string" &&
        entry.path
      ) {
        opens.push({ kind: "file", path: entry.path });
      } else if (
        entry.kind === "url" &&
        typeof entry.url === "string" &&
        entry.url
      ) {
        opens.push({ kind: "url", url: entry.url });
      }
    }
    return opens;
  }
}
