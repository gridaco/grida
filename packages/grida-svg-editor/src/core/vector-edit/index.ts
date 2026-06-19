// Barrel for the vector-edit module.
//
// Boundary discipline: only `./model` and `./apply` are allowed to
// import from `@grida/vn`. Everything else in this directory (and
// outside it) consumes vector-edit through these re-exports.

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
// but no caller outside `vector-edit/` imports them. Keeping them out of the
// barrel keeps the published surface honest — if a future consumer needs
// one, add it here deliberately.

export { VectorEditSession, sub_selection_equal } from "./session";
export type { HoveredControl, SubSelectionSnapshot } from "./session";

export {
  source_to_session_d,
  apply_session_d,
  vector_apply,
  vector_revert,
} from "./apply";

export { marquee } from "./marquee";
export type { SubpathSelectCandidates } from "./marquee";

export { apply_subselection, validate_subselection } from "./subselection";
export type { SubSelectionInput } from "./subselection";
