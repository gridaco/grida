import { describe, expect, it } from "vitest";
import { createSvgEditor, type SvgEditor } from "@grida/svg-editor";
import { AgentVFS } from "./agent-vfs";

const SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="40" fill="red"/></svg>`;
const SVG_B = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="50" cy="50" r="20" fill="blue"/></svg>`;

function mk(): { editor: SvgEditor; vfs: AgentVFS } {
  const editor = createSvgEditor({ svg: SVG_A });
  const vfs = new AgentVFS(editor);
  return { editor, vfs };
}

describe("AgentVFS", () => {
  it("read() returns the current SVG and a version", () => {
    const { editor, vfs } = mk();
    const r = vfs.read();
    expect(r.content).toBe(editor.serialize());
    expect(r.version).toBe(editor.state.version);
  });

  it("write() without prior read fails with reason=not_read", () => {
    const { vfs } = mk();
    const w = vfs.write(SVG_B, 0);
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.reason).toBe("not_read");
  });

  it("write() with stale version fails with reason=stale and current_version", () => {
    const { editor, vfs } = mk();
    const { version } = vfs.read();
    // Simulate a concurrent human edit by mutating the editor through commands.
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    editor.commands.set_paint("fill", {
      kind: "color",
      value: { kind: "rgb", value: "green" },
    });
    expect(editor.state.version).toBeGreaterThan(version);

    const w = vfs.write(SVG_B, version);
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.reason).toBe("stale");
    expect(w.current_version).toBe(editor.state.version);
  });

  it("write() with matching version applies via editor.load and advances the baseline", () => {
    const { editor, vfs } = mk();
    const { version } = vfs.read();
    const w = vfs.write(SVG_B, version);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(editor.serialize()).toContain("<circle");
    // After a successful write, the AI can write again without re-reading
    // because the write itself counts as a read (last_read bumps to the new version).
    const w2 = vfs.write(SVG_A, w.version);
    expect(w2.ok).toBe(true);
  });

  it("write() returns reason=parse_error for invalid SVG and does not advance the baseline", () => {
    const { editor, vfs } = mk();
    const { version } = vfs.read();
    const w = vfs.write("not an svg", version);
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.reason).toBe("parse_error");
    // The next write at the same version should still succeed — the failed
    // write should not have advanced `last_read`.
    const w2 = vfs.write(SVG_B, editor.state.version);
    expect(w2.ok).toBe(true);
  });

  it("human edit between read and write is detected as stale", () => {
    const { editor, vfs } = mk();
    const first = vfs.read();
    // Human edits the SVG while the model is "thinking".
    const rect = [...editor.tree().nodes.values()].find(
      (n) => n.tag === "rect"
    )!;
    editor.commands.select(rect.id);
    editor.commands.translate({ dx: 5, dy: 0 });
    // Model writes with the stale version.
    const w = vfs.write(SVG_B, first.version);
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.reason).toBe("stale");
    // After re-reading and retrying, the write succeeds.
    const fresh = vfs.read();
    const w2 = vfs.write(SVG_B, fresh.version);
    expect(w2.ok).toBe(true);
  });
});
