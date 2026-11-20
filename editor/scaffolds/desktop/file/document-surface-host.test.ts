import { createSvgEditor, type VectorSubSelection } from "@grida/svg-editor";
import { expect, it, vi } from "vitest";
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

it("captures vector ordinals and revokes them on a vector-only change", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L10,10 L20,20 Z"/></svg>';
  const editor = createSvgEditor({ svg });
  const host = new DocumentSurfaceHost();
  host.setEditor(editor, "/slides/first.svg");
  const tree = editor.tree();
  const [path] = tree.nodes.get(tree.root)!.children;
  const original: VectorSubSelection = {
    node_id: path,
    vertices: [2],
    segments: [1],
    tangents: [[0, 1]],
  };
  let vector: VectorSubSelection | null = {
    node_id: path,
    vertices: [],
    segments: [],
    tangents: [],
  };
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
  editor.commands.select(path);
  editor.commands.set_mode("edit-content");
  try {
    expect(host.svgSelection.hasSelection()).toBe(false);
    expect(host.svgSelection.capture()).toBeUndefined();
    vector = original;
    const targetId = host.svgSelection.capture()!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    };
    expect(host.svgSelection.invoke(request)).toEqual({
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
      host.svgSelection.invoke({
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
    expect(host.svgSelection.invoke(request)).toEqual({ kind: "stale" });
    const beforeReload = host.svgSelection.capture()!;
    editor.load(svg);
    expect(
      host.svgSelection.invoke({ ...request, targetId: beforeReload })
    ).toEqual({ kind: "stale" });
  } finally {
    host.setEditor(null);
    editor.dispose();
  }
});
