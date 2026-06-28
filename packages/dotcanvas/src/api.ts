// The public surface of `dotcanvas`, re-exported as the `dotcanvas`
// namespace from `./index`. Kept deliberately tight: read/write + the pure
// core (resolve/heal/serialize) + pure editing transforms (add/remove/reorder/
// setLayout). `parse` stays internal (folded into `read`). The editing
// transforms were promoted once a second consumer dogfooded the manifest-edit
// shape; `heal` (the read→writable bridge) was promoted once two consumers
// re-implemented the same reconcile fold (see README "Public surface").

export type {
  EditorType,
  Layout,
  Manifest,
  ManifestDocument,
  ReadableFs,
  ResolvedCanvas,
  ResolvedDocument,
  Warning,
  WarningCode,
  WritableFs,
} from "./canvas";

export {
  BUNDLE_EXTENSION,
  MANIFEST_FILENAME,
  THUMBNAIL_NAMES,
  isBundlePath,
  add,
  heal,
  remove,
  reorder,
  resolve,
  serialize,
  setLayout,
  setSkip,
} from "./canvas";
export { read, write } from "./io";
