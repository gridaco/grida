// Barrel for the path-edit module.
//
// Boundary discipline: only `./model` is allowed to import from `@grida/vn`.
// Everything else in this directory (and outside it) consumes path-edit
// through these re-exports.

export { PathModel } from "./model";
export type {
  VertexId,
  SegmentId,
  TangentRef,
  TangentMirrorMode,
  PathSnapshot,
} from "./model";
// `Verb`, `SegmentView`, `SubSelection` are NOT re-exported: they exist
// for `PathModel`'s internal contract and the in-package marquee helpers,
// but no caller outside `path-edit/` imports them. Keeping them out of the
// barrel keeps the published surface honest — if a future consumer needs
// one, add it here deliberately.

export { PathEditSession } from "./session";
export type { HoveredControl } from "./session";

export { marquee } from "./marquee";
export type { SubpathSelectCandidates } from "./marquee";
