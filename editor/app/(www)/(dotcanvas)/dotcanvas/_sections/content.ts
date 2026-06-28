// Code samples for the /dotcanvas spec page. Kept as raw strings so they can be
// Shiki-highlighted server-side in `page.tsx` (dual light/dark themes).

/** A representative `.canvas.json` exercising both axes and both views. */
export const MANIFEST_JSONC = `{
  // OPTIONAL. Editor-tooling hint only; readers ignore it.
  "$schema": "https://grida.co/schema/dotcanvas/v1.json",

  // OPTIONAL. Spec version this manifest targets. Missing -> current.
  "version": "1",

  // EDITOR — which editor opens the bundle (à la Figma's editorType).
  //   "slides" (linear deck) | "board" (freeform canvas) | "unknown"
  "editor": "board",

  // CONTENT — which root files are documents. Glob; "*" is the only wildcard.
  // Missing -> ["*.svg"]. Explicit [] derives nothing.
  "files": ["*.svg"],

  // OPTIONAL. The ordered set of documents. Absent -> derived from disk.
  "documents": [
    {
      "src": "001.svg",        // the only field that must resolve on disk
      "id": "n_a1b2",          // OPTIONAL stable identity; absent -> src
      "layout": { "x": 0, "y": 0, "w": 320, "h": 200, "z": 0 }
    },
    { "src": "002.svg", "skip": true }  // off the slides order; still on the board
  ],

  // OPTIONAL. Vendor bag. Readers round-trip unknown keys; never interpret them.
  "ext": {}
}`;

/** The reader/writer at work — `dotcanvas.read` + the pure transforms. */
export const USAGE_TS = `import { dotcanvas } from "dotcanvas";

// \`fs\` is any { list(); read() } port — no node:fs, no DOM.
const canvas = await dotcanvas.read(fs);

canvas.editor;    //=> "slides" | "board" | "unknown"   the editor
canvas.files;     //=> ["*.svg"]                         the content globs
canvas.documents; //=> reconciled, ordered ResolvedDocument[]
canvas.warnings;  //=> non-fatal observations (read never throws)

// Pure transforms: (manifest, …) -> manifest. Never mutate, never throw.
let m = canvas.manifest ?? {};
m = dotcanvas.reorder(m, ["002.svg", "001.svg"]);
m = dotcanvas.setLayout(m, "001.svg", { x: 0, y: 0 });

// Reconcile against disk (drop missing, append disk-only), then persist.
await dotcanvas.write(fs, dotcanvas.heal(m, await fs.list()));`;
