// `@grida/io-canvas` — reader/writer for the `.canvas` portable directory
// format. The entire public surface is the `iocanvas` namespace (values + types).
//
//   import { iocanvas } from "@grida/io-canvas";
//   const canvas = await iocanvas.read(fs);
//
// Contract: docs/wg/format/canvas.md
export * as iocanvas from "./api";
