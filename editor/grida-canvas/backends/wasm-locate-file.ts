import type { GridaCanvasModuleInitOptions } from "@grida/canvas-wasm";
type Args = Parameters<GridaCanvasModuleInitOptions["locateFile"]>;

/**
 * Locate the wasm file in the correct location.
 * @returns The URL of the file.
 */
export default function locateFile(...args: Args) {
  const [path, version] = args;
  if (process.env.NEXT_PUBLIC_GRIDA_WASM_DEV_SERVE_URL) {
    return `${process.env.NEXT_PUBLIC_GRIDA_WASM_DEV_SERVE_URL}/${path}`;
  } else {
    // the npm-published artifact, fetched at runtime. `version` is pinned by
    // editor/package.json — the engine repo (gridaco/nothing) owns publishing
    // and must never unpublish/deprecate the pinned version (freeze contract).
    return `https://unpkg.com/@grida/canvas-wasm@${version}/dist/${path}`;
  }
}
