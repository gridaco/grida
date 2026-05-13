// `@grida/text-editor` — public API barrel.
//
// V1 scope: see ./README.md.
//
// Hosts implement two contracts: LayoutEngine (geometry) and Surface
// (paint). The TextEditor orchestrator wires them to the package's
// pure session + command-dispatch + history + IME + clipboard logic.

export { TextEditor } from "./text-editor";
export type {
  TextEditorCallbacks,
  TextEditorOptions,
  SessionSnapshot,
} from "./text-editor";

export { TextEditSession } from "./session";
export type { Composition, Selection } from "./session";

export {
  apply_command,
  type EditingCommand,
  type EditKind,
  type Granularity,
} from "./edit-command";

export { HistoryStack } from "./history";

export {
  next_grapheme,
  next_word,
  prev_grapheme,
  prev_word,
  word_at,
} from "./boundaries";

export { key_event_to_action, type Action } from "./keymap";

export type { InputCallbacks, InputFactory, InputProvider } from "./input";

export type { Clipboard } from "./clipboard";

export { MockLayoutEngine } from "./layout-engine";
export type { LayoutEngine, NavigationDirection } from "./layout-engine";

export type { Surface } from "./surface";

export const VERSION = "0.0.0";
