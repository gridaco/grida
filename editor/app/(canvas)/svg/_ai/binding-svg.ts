import type { SvgEditor } from "@grida/svg-editor";
import type { AgentFs } from "@grida/agent-tools/fs";
import { formatSvg } from "./format-svg";

/**
 * Adapt an `SvgEditor` to the `LiveBinding` contract.
 *
 * - `serialize()` returns the editor's SVG **pretty-printed** (one
 *   element per line, indented). This is what the agent sees on
 *   `read_file` — stable, line-oriented, perfect for `edit_file`'s
 *   match-and-replace.
 * - `load()` accepts any valid SVG; the editor handles re-formatting.
 * - `getVersion()` reflects every host-visible change (AI write, human
 *   gesture, undo).
 * - `subscribe()` wires the editor's emit channel to the fs for
 *   auto-flush to the backend.
 *
 * Lives at the call site because pretty-printing is SVG-specific. The
 * generic `@grida/agent-tools/fs` knows nothing about element-per-line
 * formatting.
 */
export function svgEditorBinding(editor: SvgEditor): AgentFs.LiveBinding {
  return {
    serialize: () => formatSvg(editor.serialize()),
    load: (content) => editor.load(content),
    getVersion: () => editor.state.version,
    subscribe: (cb) => editor.subscribe(cb),
  };
}
