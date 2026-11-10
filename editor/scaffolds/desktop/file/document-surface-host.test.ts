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

it("keeps the new slide bound when an older editor detaches", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Slide</text></svg>';
  const first = createSvgEditor({ svg });
  const second = createSvgEditor({ svg });
  const host = new DocumentSurfaceHost();
  const closeFirst = host.bindEditor(first, "/slides/first.svg");
  try {
    first.commands.select(
      [...first.tree().nodes.values()].find((node) => node.name === "title")!.id
    );
    const targetId = host.svgText.capture()!;
    expect(targetId).toBeDefined();
    const closeSecond = host.bindEditor(second, "/slides/second.svg");
    closeFirst();
    expect(host.readEditorSurfaces().active).toBe("/slides/second.svg");
    expect(
      host.svgText.invoke({
        targetId,
        expiresAtMs: Date.now() + 1000,
        operation: { kind: "read" },
      })
    ).toEqual({ kind: "unavailable" });
    closeSecond();
    expect(host.readEditorSurfaces().active).toBeNull();
  } finally {
    host.setEditor(null);
    first.dispose();
    second.dispose();
  }
});
