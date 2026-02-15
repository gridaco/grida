/**
 * @grida/refig/browser — Browser entrypoint
 *
 * Same core API as @grida/refig, without any Node.js dependencies (no node:fs).
 * Use this when bundling for the browser.
 */

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

export { FigmaRenderer as default } from "./lib";
