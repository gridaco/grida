// `.canvas` — IO shell.
//
// A thin wire over the injected filesystem port: it reads `canvas.json` + the
// directory listing and hands them to the pure core, or serializes a manifest
// and writes it. All decisions live in `./canvas`; this file holds none.

import {
  MANIFEST_FILENAME,
  parse,
  resolve,
  serialize,
  type Manifest,
  type ReadableFs,
  type ResolvedCanvas,
  type Warning,
  type WritableFs,
} from "./canvas";

/**
 * Read a `.canvas` bundle into its resolved projection.
 *
 * - `canvas.json` missing → implicit mode, no warning (a normal state).
 * - `canvas.json` malformed → implicit mode + a `manifest_malformed` warning.
 */
export async function read(fs: ReadableFs): Promise<ResolvedCanvas> {
  const text = await fs.read(MANIFEST_FILENAME);

  let manifest: Manifest | null = null;
  let parseWarning: Warning | null = null;
  if (text !== null) {
    const parsed = parse(text);
    manifest = parsed.manifest;
    parseWarning = parsed.warning;
  }

  const resolved = resolve(manifest, await fs.list());

  // Surface the malformed-manifest warning ahead of any reconcile warnings.
  return parseWarning
    ? { ...resolved, warnings: [parseWarning, ...resolved.warnings] }
    : resolved;
}

/**
 * Persist a manifest to `canvas.json`. The caller owns the manifest object
 * (including any unknown fields it read in); `write` only serializes it.
 */
export async function write(fs: WritableFs, manifest: Manifest): Promise<void> {
  await fs.write(MANIFEST_FILENAME, serialize(manifest));
}
