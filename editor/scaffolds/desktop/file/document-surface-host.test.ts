import { createSvgEditor, type VectorSubSelection } from "@grida/svg-editor";
import { expect, it, vi } from "vitest";
import { DocumentSurfaceHost } from "./document-surface-host";

it("withdraws the old selection when the standalone editor changes", () => {
  const editor = createSvgEditor({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Before</text></svg>',
  });
  const host = new DocumentSurfaceHost();
  const snapshots: ReturnType<DocumentSurfaceHost["readEditorSurfaces"]>[] = [];
  const unsubscribe = host.subscribeToEditorSurfaces(() => {
    snapshots.push(host.readEditorSurfaces());
  });
  let unbind = host.bindEditor(editor)!;
  try {
    const title = [...editor.tree().nodes.values()].find(
      (node) => node.name === "title"
    )!;
    editor.commands.select(title.id);
    const targetId = host.editorSelection.capture()!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "read-text" } as const,
    };
    expect(host.editorSelection.invoke(request)).toEqual({
      kind: "text",
      path: "/canvas.svg",
      revision: targetId,
      text: "Before",
    });
    unbind();
    unbind = host.bindEditor(editor)!;
    expect(host.editorSelection.invoke(request)).toEqual({ kind: "stale" });
    expect(host.editorSelection.capture()).not.toBe(targetId);
    expect(snapshots).toEqual([
      {
        active: "/canvas.svg",
        open: ["/canvas.svg"],
        truncated: false,
        selection: { kind: "svg", path: "/canvas.svg" },
      },
      { active: null, open: [], truncated: false },
      {
        active: "/canvas.svg",
        open: ["/canvas.svg"],
        truncated: false,
        selection: { kind: "svg", path: "/canvas.svg" },
      },
    ]);
  } finally {
    unsubscribe();
    unbind();
    editor.dispose();
  }
});

it("keeps the new slide bound when an older editor detaches", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Slide</text></svg>';
  const first = createSvgEditor({ svg });
  const second = createSvgEditor({ svg });
  const host = new DocumentSurfaceHost();
  const closeFirst = host.bindEditor(first, "/slides/first.svg")!;
  try {
    first.commands.select(
      [...first.tree().nodes.values()].find((node) => node.name === "title")!.id
    );
    const targetId = host.editorSelection.capture()!;
    expect(targetId).toBeDefined();
    const closeSecond = host.bindEditor(second, "/slides/second.svg")!;
    closeFirst();
    expect(host.readEditorSurfaces().active).toBe("/slides/second.svg");
    expect(
      host.editorSelection.invoke({
        targetId,
        expiresAtMs: Date.now() + 1000,
        operation: { kind: "read-text" },
      })
    ).toEqual({ kind: "stale" });
    closeSecond();
    expect(host.readEditorSurfaces().active).toBeNull();
  } finally {
    closeFirst();
    first.dispose();
    second.dispose();
  }
});

it("captures vector ordinals and revokes them on a vector-only change", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L10,10 L20,20 Z"/></svg>';
  const editor = createSvgEditor({ svg });
  const host = new DocumentSurfaceHost();
  const unbind = host.bindEditor(editor, "/slides/first.svg")!;
  const tree = editor.tree();
  const [path] = tree.nodes.get(tree.root)!.children;
  const original: VectorSubSelection = {
    node_id: path,
    vertices: [2],
    segments: [1],
    tangents: [[0, 1]],
  };
  const empty: VectorSubSelection = {
    node_id: path,
    vertices: [],
    segments: [],
    tangents: [],
  };
  let vector: VectorSubSelection | null = empty;
  let change: ((value: VectorSubSelection | null) => void) | undefined;
  vi.spyOn(editor, "vector_subselection").mockImplementation(() => vector);
  vi.spyOn(editor, "subscribe_vector_subselection").mockImplementation(
    (listener) => {
      change = listener;
      return () => {
        change = undefined;
      };
    }
  );
  const setVectorSelection = vi
    .spyOn(editor.commands, "set_vector_selection")
    .mockImplementation(() => {
      vector = empty;
      change?.(vector);
      return true;
    });
  editor.commands.select(path);
  editor.commands.set_mode("edit-content");
  try {
    expect(host.editorSelection.hasSelection()).toBe(false);
    expect(host.editorSelection.capture()).toBeUndefined();
    vector = original;
    expect(host.editorSelection.readLabel()).toBe("3 path parts");
    const targetId = host.editorSelection.capture()!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    };
    expect(host.editorSelection.invoke(request)).toEqual({
      kind: "inspection",
      path: "/slides/first.svg",
      revision: targetId,
      mode: "vector",
      total: 3,
      vectorElement: { kind: "element", elementPath: [0], tag: "path" },
      targets: [
        { kind: "vertex", index: 2 },
        { kind: "segment", index: 1 },
        { kind: "tangent", vertex: 0, side: 1 },
      ],
      nextCursor: null,
    });
    expect(
      host.editorSelection.invoke({
        ...request,
        operation: { kind: "set-opacity", revision: targetId, opacity: 0.3 },
      })
    ).toEqual({ kind: "unsupported" });
    const version = editor.state.content_version;
    vector = { ...original, vertices: [1] };
    change?.(vector);
    vector = original;
    change?.(vector);
    expect(editor.state.content_version).toBe(version);
    expect(host.editorSelection.invoke(request)).toEqual({ kind: "stale" });

    const beforeClear = host.editorSelection.capture()!;
    host.editorSelection.clear();
    expect(setVectorSelection).toHaveBeenCalledExactlyOnceWith({});
    expect(editor.state.mode).toBe("edit-content");
    expect(editor.state.selection).toEqual([path]);
    expect(host.editorSelection.capture()).toBeUndefined();
    expect(editor.serialize()).toBe(svg);
    vector = original;
    change?.(vector);
    expect(
      host.editorSelection.invoke({ ...request, targetId: beforeClear })
    ).toEqual({ kind: "stale" });

    const beforeReload = host.editorSelection.capture()!;
    editor.load(svg);
    expect(
      host.editorSelection.invoke({ ...request, targetId: beforeReload })
    ).toEqual({ kind: "stale" });
  } finally {
    unbind();
    editor.dispose();
  }
});
