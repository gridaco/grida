// @grida/svg-editor/presets — opinionated bundles on top of the core API.
//
// **Exotic import path by design.** Anything in this directory is sugar
// for compositions the main package leaves to the host. The main entry
// (`@grida/svg-editor`) and `/dom` / `/react` entries never reference
// `presets/`; hosts opt in explicitly at the import line.
//
// Each preset is exposed as a namespace so future presets compose:
//
// ```ts
// import { keynote } from '@grida/svg-editor/presets';
// const handle = keynote.attach(editor, { container, padding: 80 });
// ```
//
// See plan §3 (rationale) and §10 (import-discipline contract).

import * as keynote from "./presets/keynote";

export { keynote };
export type {
  KeynoteAttachOptions,
  KeynoteSurfaceHandle,
} from "./presets/keynote";
