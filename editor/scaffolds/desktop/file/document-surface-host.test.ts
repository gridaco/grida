import { createSvgEditor } from "@grida/svg-editor";
import { expect, it } from "vitest";
import { DocumentSurfaceHost } from "./document-surface-host";

it("withdraws the old text target when the standalone editor changes", () => {
  const editor = createSvgEditor({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Before</text></svg>',
  });
  const host = new DocumentSurfaceHost();
  const snapshots: ReturnType<DocumentSurfaceHost["readEditorSurfaces"]>[] = [];
  const unsubscribe = host.subscribeToEditorSurfaces(() => {
    snapshots.push(host.readEditorSurfaces());
  });
  try {
    host.setEditor(editor);
    const title = [...editor.tree().nodes.values()].find(
      (node) => node.name === "title"
    )!;
    editor.commands.select(title.id);
    const targetId = host.svgText.capture()!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "read" } as const,
    };
    expect(host.svgText.invoke(request)).toEqual({
      kind: "read",
      path: "/canvas.svg",
      revision: targetId,
      text: "Before",
    });
    host.setEditor(null);
    host.setEditor(editor);
    expect(host.svgText.invoke(request)).toEqual({ kind: "unavailable" });
    expect(host.svgText.capture()).not.toBe(targetId);
    expect(snapshots).toEqual([
      { active: "/canvas.svg", open: ["/canvas.svg"], truncated: false },
      { active: null, open: [], truncated: false },
      { active: "/canvas.svg", open: ["/canvas.svg"], truncated: false },
    ]);
  } finally {
    unsubscribe();
    host.setEditor(null);
    editor.dispose();
  }
});
