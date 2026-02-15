/**
 * @grida/refig — Node.js entrypoint
 *
 * Re-exports the full core API and adds Node-specific helpers (file I/O).
 */

import { readFileSync } from "node:fs";
import { FigmaDocument, FigmaRenderer } from "./lib";

// ---------------------------------------------------------------------------
// Node-specific: FigmaDocument.fromFile
// ---------------------------------------------------------------------------

/**
 * Read a `.fig` binary or a Figma REST API JSON file from disk and return a
 * `FigmaDocument`.
 *
 * @param filePath Path to a `.fig` file or a `.json` file.
 */
FigmaDocument.fromFile = function fromFile(filePath: string): FigmaDocument {
  const normalized = filePath.trim();
  if (!normalized) {
    throw new Error("FigmaDocument.fromFile: path must be non-empty");
  }

  if (normalized.toLowerCase().endsWith(".json")) {
    const text = readFileSync(normalized, "utf-8");
    return new FigmaDocument(JSON.parse(text));
  }

  return new FigmaDocument(new Uint8Array(readFileSync(normalized)));
};

// ---------------------------------------------------------------------------
// Re-export everything from core
// ---------------------------------------------------------------------------

export {
  FigmaDocument,
  FigmaRenderer,
  collectExportsFromDocument,
  exportSettingToRenderOptions,
  resolveMimeType,
  type ExportItem,
  type RefigRenderFormat,
  type RefigRendererOptions,
  type RefigRenderOptions,
  type RefigRenderResult,
} from "./lib";

export default FigmaRenderer;

// ---------------------------------------------------------------------------
// Type augmentation: FigmaDocument.fromFile (Node only)
// ---------------------------------------------------------------------------

declare module "./lib" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace FigmaDocument {
    function fromFile(filePath: string): FigmaDocument;
  }
}
