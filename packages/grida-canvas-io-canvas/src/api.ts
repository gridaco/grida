// The public surface of `@grida/io-canvas`, re-exported as the `iocanvas`
// namespace from `./index`. Kept deliberately tight: read/write + the pure
// core (resolve/serialize) + pure editing transforms (add/remove/reorder/
// setLayout). `parse` stays internal (folded into `read`). The editing
// transforms were promoted once a second consumer dogfooded the manifest-edit
// shape (see README "Public surface").

export type {
  CanvasType,
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
  remove,
  reorder,
  resolve,
  serialize,
  setLayout,
} from "./canvas";
export { read, write } from "./io";
