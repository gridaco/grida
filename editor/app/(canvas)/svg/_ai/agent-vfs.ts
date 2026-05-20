import type { SvgEditor } from "@grida/svg-editor";

export type ReadResult = {
  content: string;
  version: number;
};

export type WriteSuccess = {
  ok: true;
  version: number;
};

export type WriteFailure = {
  ok: false;
  reason: "not_read" | "stale" | "parse_error";
  message: string;
  current_version?: number;
};

export type WriteResult = WriteSuccess | WriteFailure;

// One-file VFS enforcing read-before-write against a live SvgEditor.
// Freshness token is `editor.state.version`, which bumps on any emit
// (human gestures, undo, AI writes). A successful write counts as a read.
export class AgentVFS {
  private last_read: number | null = null;

  constructor(private readonly editor: SvgEditor) {}

  read(): ReadResult {
    const version = this.editor.state.version;
    this.last_read = version;
    return { content: this.editor.serialize(), version };
  }

  write(content: string, expected_version: number): WriteResult {
    if (this.last_read === null) {
      return {
        ok: false,
        reason: "not_read",
        message:
          "SVG has not been read yet. Call read_file before update_file.",
      };
    }
    const current = this.editor.state.version;
    if (current !== expected_version) {
      return {
        ok: false,
        reason: "stale",
        message:
          "SVG changed since last read_file. Call read_file again, then retry.",
        current_version: current,
      };
    }
    try {
      this.editor.load(content);
    } catch (err) {
      return {
        ok: false,
        reason: "parse_error",
        message:
          err instanceof Error
            ? `Failed to parse SVG: ${err.message}`
            : "Failed to parse SVG.",
      };
    }
    const next = this.editor.state.version;
    this.last_read = next;
    return { ok: true, version: next };
  }
}
