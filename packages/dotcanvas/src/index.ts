// `dotcanvas` — reader/writer for the `.canvas` portable directory
// format. The entire public surface is the `dotcanvas` namespace (values + types).
//
//   import { dotcanvas } from "dotcanvas";
//   const canvas = await dotcanvas.read(fs);
//
// Contract: docs/wg/format/canvas.md
export * as dotcanvas from "./api";
