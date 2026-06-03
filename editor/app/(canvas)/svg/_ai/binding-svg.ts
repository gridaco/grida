import type { SvgEditor } from "@grida/svg-editor";
import type { AgentFs } from "@grida/agent/fs";
import { formatSvg } from "./format-svg";

/**
 * Adapt an `SvgEditor` to the `LiveBinding` contract.
 *
 * - `serialize()` returns the editor's SVG **pretty-printed** (one
 *   element per line, indented). This is what the agent sees on
 *   `read_file` — stable, line-oriented, perfect for `edit_file`'s
 *   match-and-replace.
 * - `load()` accepts any valid SVG; the editor handles re-formatting.
 * - `getVersion()` returns `content_version` so UI-state emissions
 *   (selection, scope, mode, tool) don't strand AI writes as stale —
 *   a click between the agent's read and write must not invalidate
 *   the write.
 * - `subscribe()` wires the editor's emit channel to the fs for
 *   auto-flush to the backend. The fs dedups by content, so it's fine
 *   that this fires on every emission.
 *
 * Lives at the call site because pretty-printing is SVG-specific. The
 * generic `@grida/agent/fs` knows nothing about element-per-line
 * formatting.
 */
export function svgEditorBinding(editor: SvgEditor): AgentFs.LiveBinding {
  return {
    serialize: () => formatSvg(editor.serialize()),
    load: (content) => editor.load(content),
    getVersion: () => editor.state.content_version,
    subscribe: (cb) => editor.subscribe(cb),
  };
}
