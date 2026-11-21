import { createSvgEditor, type NodeId } from "@grida/svg-editor";
import { NativeEditorSelection } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";
import { WorkspaceSurfaceHost } from "./workspace-surface-host";

const file = WorkbenchTab.file;

const source =
  '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Before</text><text id="other">Other</text><text id="mixed">A<tspan>B</tspan></text></svg>';

function fixture() {
  const editor = createSvgEditor({ svg: source });
  const group = new EditorGroup();
  const owner = new WorkspaceSurfaceHost(async () => [], group);
  const close = owner.bindSvgEditor("poster.svg", "poster.svg", editor)!;
  group.open(file("poster.svg"));
  const select = (name: string) =>
    editor.commands.select(
      [...editor.tree().nodes.values()].find((node) => node.name === name)!.id
    );
  select("title");
  const call = (targetId: string, operation: NativeEditorSelection.Operation) =>
    owner.editorSelection.invoke({
      targetId,
      operation,
      expiresAtMs: Date.now() + 1000,
    });
  return { editor, group, owner, select, call, close };
}

it("inspects, reads, and replaces one captured SVG text run with ordinary undo", () => {
  const { editor, owner, call, close } = fixture();
  try {
    const target = owner.editorSelection.capture()!;
    expect(call(target, { kind: "inspect" })).toMatchObject({
      kind: "inspection",
      revision: target,
      targets: [{ tag: "text", id: "title" }],
    });
    expect(call(target, { kind: "read-text" })).toEqual({
      kind: "text",
      path: "/poster.svg",
      revision: target,
      text: "Before",
    });
    expect(
      call(target, {
        kind: "replace-text",
        revision: crypto.randomUUID(),
        text: "Wrong",
      })
    ).toEqual({ kind: "stale" });
    expect(
      call(target, {
        kind: "replace-text",
        revision: target,
        text: "After & only",
      })
    ).toEqual({ kind: "applied", path: "/poster.svg", saved: false });
    expect(editor.serialize()).toBe(
      source.replace("Before", "After &amp; only")
    );
    expect(call(target, { kind: "read-text" })).toEqual({ kind: "stale" });
    editor.commands.undo();
    expect(editor.serialize()).toBe(source);
    expect(owner.editorSelection.capture()).not.toBe(target);
  } finally {
    close();
  }
});

it("retires selection and tab changes even after returning to the same SVG", () => {
  const { group, editor, owner, select, call, close } = fixture();
  try {
    const target = owner.editorSelection.capture()!;
    select("other");
    select("title");
    expect(
      call(target, { kind: "replace-text", revision: target, text: "Wrong" })
    ).toEqual({ kind: "stale" });
    const next = owner.editorSelection.capture()!;
    group.open(file("other.svg"));
    group.activate(file("poster.svg"));
    expect(call(next, { kind: "read-text" })).toEqual({ kind: "stale" });
    select("mixed");
    const structured = owner.editorSelection.capture()!;
    expect(call(structured, { kind: "inspect" })).toMatchObject({
      kind: "inspection",
    });
    expect(call(structured, { kind: "read-text" })).toEqual({
      kind: "unsupported",
    });
    expect(editor.serialize()).toBe(source);
  } finally {
    close();
  }
});

it("observes changing SVG selection labels only in the active tab", () => {
  const { group, owner, select, call, close, editor } = fixture();
  const changes: (string | undefined)[] = [];
  const unsubscribe = owner.editorSelection.subscribe(() =>
    changes.push(owner.editorSelection.readLabel())
  );
  try {
    expect(owner.editorSelection.readLabel()).toBe("Before");
    const target = owner.editorSelection.capture()!;
    select("mixed");
    expect(call(target, { kind: "read-text" })).toEqual({ kind: "stale" });
    select("other");
    expect(changes).toEqual(["AB", "Other"]);
    editor.commands.select([]);
    select("title");
    group.open(file("other.svg"));
    group.activate(file("poster.svg"));
    close();
    expect(changes).toEqual([
      "AB",
      "Other",
      undefined,
      "Before",
      undefined,
      "Before",
      undefined,
    ]);
  } finally {
    unsubscribe();
    close();
  }
});

it("updates the selected text label when the text changes in the same editor", () => {
  const { editor, owner, close } = fixture();
  const changes: (string | undefined)[] = [];
  const unsubscribe = owner.editorSelection.subscribe(() =>
    changes.push(owner.editorSelection.readLabel())
  );
  try {
    expect(owner.editorSelection.readLabel()).toBe("Before");
    editor.commands.set_text("Updated  heading");
    expect(owner.editorSelection.readLabel()).toBe("Updated heading");
    editor.commands.set_opacity(0.5);
    expect(changes).toEqual(["Updated heading"]);
  } finally {
    unsubscribe();
    close();
    editor.dispose();
  }
});

it("clears the active SVG objects and retires their captures", () => {
  const { editor, group, owner, close, call, select } = fixture();
  const background = createSvgEditor({ svg: source });
  const closeBackground = owner.bindSvgEditor(
    "other.svg",
    "other.svg",
    background
  )!;
  const tree = background.tree();
  const [other] = tree.nodes.get(tree.root)!.children;
  background.commands.select(other);
  group.open(file("other.svg"));
  group.activate(file("poster.svg"));
  try {
    const target = owner.editorSelection.capture()!;
    const version = editor.state.content_version;
    owner.editorSelection.clear();
    expect(editor.state.selection).toEqual([]);
    expect(editor.state.content_version).toBe(version);
    expect(background.state.selection).toEqual([other]);
    expect(owner.editorSelection.hasSelection()).toBe(false);
    select("title");
    expect(call(target, { kind: "inspect" })).toEqual({ kind: "stale" });
  } finally {
    closeBackground();
    close();
    background.dispose();
    editor.dispose();
  }
});

it("publishes the mounted SVG separately from the canvas tab and checks its path before editing", () => {
  const { editor, group, owner, close } = fixture();
  const deck = "decks/portfolio.canvas";
  const slide = `${deck}/slides/intro.svg`;
  group.open(file(deck));
  const publish =
    vi.fn<Parameters<WorkspaceSurfaceHost["publishEditorSurfaces"]>[0]>();
  publish.mockResolvedValue(true);
  const unpublish = owner.publishEditorSurfaces(publish);
  const notify = vi.fn<() => void>();
  const unsubscribe = owner.subscribeToEditorSurfaces(notify);
  const unbind = owner.bindSvgEditor(deck, slide, editor)!;
  try {
    const tabs = {
      active: `/${deck}`,
      open: ["/poster.svg", `/${deck}`],
      truncated: false,
    };
    expect(owner.readEditorSurfaces()).toEqual({
      ...tabs,
      selection: { kind: "svg", path: `/${slide}` },
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith(tabs);
    expect(notify).toHaveBeenCalledOnce();
    const targetId = owner.editorSelection.capture()!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: {
        kind: "replace-text",
        revision: targetId,
        text: "After",
      } as const,
    };
    expect(
      owner.editorSelection.invoke({ ...request, path: "/poster.svg" })
    ).toEqual({
      kind: "stale",
    });
    expect(editor.serialize()).toBe(source);
    expect(
      owner.editorSelection.invoke({ ...request, path: `/${slide}` })
    ).toEqual({
      kind: "applied",
      path: `/${slide}`,
      saved: false,
    });
    editor.commands.undo();
    expect(editor.serialize()).toBe(source);
    unbind();
    expect(owner.readEditorSurfaces()).toEqual(tabs);
    expect(notify).toHaveBeenCalledTimes(2);
  } finally {
    unbind();
    unsubscribe();
    unpublish();
    close();
    editor.dispose();
  }
});

it("inspects mixed SVG objects and undoes one edit to the exact selection", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/><g id="box"/><image href="photo.png"/><circle/></svg>';
  const editor = createSvgEditor({ svg });
  const group = new EditorGroup();
  const owner = new WorkspaceSurfaceHost(async () => [], group);
  const close = owner.bindSvgEditor("mixed.svg", "mixed.svg", editor)!;
  group.open(file("mixed.svg"));
  const tree = editor.tree();
  const [rect, box, image] = tree.nodes.get(tree.root)!.children;
  const call = (targetId: string, operation: NativeEditorSelection.Operation) =>
    owner.editorSelection.invoke({
      targetId,
      operation,
      expiresAtMs: Date.now() + 1000,
    });
  try {
    expect(owner.editorSelection.capture()).toBeUndefined();
    editor.commands.select(rect);
    expect(owner.editorSelection.readLabel()).toBe("Rectangle");
    editor.commands.select(box);
    expect(owner.editorSelection.readLabel()).toBe("Group #box");
    editor.commands.select([rect, box, image]);
    expect(owner.editorSelection.readLabel()).toBe("3 elements");
    const target = owner.editorSelection.capture()!;
    const another = owner.editorSelection.capture()!;
    const read = call(target, { kind: "inspect" });
    expect(NativeEditorSelection.result(read)).toEqual({
      kind: "inspection",
      path: "/mixed.svg",
      revision: target,
      mode: "objects",
      total: 3,
      targets: [
        { kind: "element", elementPath: [0], tag: "rect" },
        { kind: "element", elementPath: [1], tag: "g", id: "box" },
        { kind: "element", elementPath: [2], tag: "image" },
      ],
      nextCursor: null,
    });
    expect(another).not.toBe(target);
    expect(call(another, { kind: "inspect" })).toMatchObject({
      kind: "inspection",
      revision: another,
    });
    expect(call(target, { kind: "read-text" })).toEqual({
      kind: "unsupported",
    });
    expect(
      call(target, { kind: "set-opacity", revision: another, opacity: 0.5 })
    ).toEqual({ kind: "stale" });
    expect(
      call(target, { kind: "set-opacity", revision: target, opacity: 0.5 })
    ).toEqual({
      kind: "applied",
      path: "/mixed.svg",
      saved: false,
    });
    expect(editor.serialize()).toMatch(
      /<rect opacity="0.5"\/><g id="box" opacity="0.5"\/><image href="photo.png" opacity="0.5"\/><circle\/>/
    );
    editor.commands.undo();
    expect(editor.serialize()).toBe(svg);
    expect(call(another, { kind: "inspect" })).toEqual({ kind: "stale" });

    const beforeSwitch = owner.editorSelection.capture()!;
    group.open(file("other.svg"));
    group.activate(file("mixed.svg"));
    expect(call(beforeSwitch, { kind: "inspect" })).toEqual({ kind: "stale" });
  } finally {
    close();
    editor.dispose();
  }
});

it("pages a large SVG selection within the encoded limit", () => {
  const labels = Array.from(
    { length: 80 },
    (_, i) => `${"函".repeat(254)}${i}`
  );
  const filePath = `${"workspace-folder/".repeat(220)}large.svg`;
  const editor = createSvgEditor({
    svg: `<svg xmlns="http://www.w3.org/2000/svg">${labels.map((id) => `<rect id="${id}"/>`).join("")}</svg>`,
  });
  const group = new EditorGroup();
  const owner = new WorkspaceSurfaceHost(async () => [], group);
  const close = owner.bindSvgEditor(filePath, filePath, editor)!;
  group.open(file(filePath));
  const tree = editor.tree();
  editor.commands.select(tree.nodes.get(tree.root)!.children);
  try {
    const targetId = owner.editorSelection.capture()!;
    let cursor: NativeEditorSelection.Cursor | null = null;
    const paths: number[][] = [];
    do {
      const result = NativeEditorSelection.result(
        owner.editorSelection.invoke({
          targetId,
          expiresAtMs: Date.now() + 1000,
          operation: cursor ? { kind: "inspect", cursor } : { kind: "inspect" },
        })
      );
      expect(result).toMatchObject({
        kind: "inspection",
        path: `/${filePath}`,
        total: labels.length,
      });
      if (result?.kind !== "inspection" || result.mode !== "objects")
        throw new Error("invalid fixture result");
      expect(result.targets.length).toBeLessThan(
        NativeEditorSelection.MAX_PAGE_ITEMS
      );
      paths.push(
        ...result.targets.map((target) =>
          target.kind === "element" ? [...target.elementPath] : []
        )
      );
      cursor = result.nextCursor;
    } while (cursor);
    expect(paths).toEqual(labels.map((_, i) => [i]));
  } finally {
    close();
    editor.dispose();
  }
});

it("keeps the original live capture through more Sends than the queue can accept", () => {
  const { editor, owner, close } = fixture();
  try {
    const ids = Array.from({ length: 260 }, () =>
      owner.editorSelection.capture()
    );
    expect(ids.every(NativeEditorSelection.isId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const targetId = ids[0]!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    };
    expect(owner.editorSelection.invoke(request)).toMatchObject({
      kind: "inspection",
      revision: targetId,
      total: 1,
    });
    expect(
      owner.editorSelection.invoke({
        ...request,
        targetId: targetId.slice(0, -8) + "ffffffff",
      })
    ).toEqual({ kind: "stale" });
  } finally {
    close();
    editor.dispose();
  }
});

it("keeps an element locator when an optional authored ID cannot cross the wire", () => {
  const editor = createSvgEditor({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="\ud800"/></svg>',
  });
  const group = new EditorGroup();
  const owner = new WorkspaceSurfaceHost(async () => [], group);
  const close = owner.bindSvgEditor("poster.svg", "poster.svg", editor)!;
  group.open(file("poster.svg"));
  const tree = editor.tree();
  const [rect] = tree.nodes.get(tree.root)!.children;
  editor.commands.select(rect);
  try {
    expect(tree.nodes.get(rect)?.name).toBe("\ud800");
    const result = owner.editorSelection.invoke({
      targetId: owner.editorSelection.capture()!,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" },
    });
    expect(NativeEditorSelection.result(result)).toMatchObject({
      kind: "inspection",
      targets: [{ kind: "element", elementPath: [0], tag: "rect" }],
    });
    expect(JSON.stringify(result)).not.toContain("\\ud800");
  } finally {
    close();
    editor.dispose();
  }
});

it("keeps a locator when sending its optional labels would exceed the page budget", () => {
  const editor = createSvgEditor({
    svg: `<svg xmlns="http://www.w3.org/2000/svg"><rect id="${"函".repeat(256)}"/></svg>`,
  });
  const group = new EditorGroup();
  const owner = new WorkspaceSurfaceHost(async () => [], group);
  const filePath = `${"workspace-folder/".repeat(140)}large.svg`;
  const close = owner.bindSvgEditor(filePath, filePath, editor)!;
  group.open(file(filePath));

  // Exercise the adapter's transport budget independently of XML parser depth.
  const tree = editor.tree();
  const root = tree.nodes.get(tree.root)!;
  const [rect] = root.children;
  const chain: NodeId[] = Array.from(
    { length: 13_000 },
    (_, i) => `nested-${i}`
  );
  const nodes = new Map(tree.nodes);
  nodes.set(tree.root, { ...root, children: [chain[0]] });
  chain.forEach((id, i) =>
    nodes.set(id, {
      id,
      tag: "g",
      parent: chain[i - 1] ?? tree.root,
      children: [chain[i + 1] ?? rect],
    })
  );
  nodes.set(rect, { ...nodes.get(rect)!, parent: chain.at(-1)! });
  vi.spyOn(editor, "tree").mockReturnValue({ ...tree, nodes });
  editor.commands.select(rect);
  try {
    const result = owner.editorSelection.invoke({
      targetId: owner.editorSelection.capture()!,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" },
    });
    expect(NativeEditorSelection.result(result)).toMatchObject({
      kind: "inspection",
      targets: [
        { kind: "element", elementPath: Array(chain.length + 1).fill(0) },
      ],
    });
    if (result.kind !== "inspection") throw new Error("invalid fixture result");
    expect(result.targets[0]).not.toHaveProperty("id");
  } finally {
    close();
    editor.dispose();
  }
});
