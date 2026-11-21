import { createSvgEditor, type NodeId } from "@grida/svg-editor";
import {
  NativeEditorSvgSelection,
  type NativeEditorSvgText,
} from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

const file = WorkbenchTab.file;
import { WorkspaceSvgText } from "./workspace-svg-text";

const source =
  '<svg xmlns="http://www.w3.org/2000/svg"><text id="title">Before</text><text id="other">Other</text><text id="mixed">A<tspan>B</tspan></text></svg>';

function fixture() {
  const editor = createSvgEditor({ svg: source });
  const group = new EditorGroup();
  const owner = new WorkspaceSvgText(group);
  const close = owner.register("poster.svg", editor);
  group.open(file("poster.svg"));
  const select = (name: string) =>
    editor.commands.select(
      [...editor.tree().nodes.values()].find((node) => node.name === name)!.id
    );
  select("title");
  const call = (targetId: string, operation: NativeEditorSvgText.Operation) =>
    owner.invoke({ targetId, operation, expiresAtMs: Date.now() + 1000 });
  return { editor, group, owner, select, call, close };
}

it("reads and replaces exactly one selected SVG text run with ordinary undo", () => {
  const { editor, owner, call, close } = fixture();
  try {
    const target = owner.capture()!;
    expect(call(target, { kind: "read" })).toEqual({
      kind: "read",
      path: "/poster.svg",
      revision: target,
      text: "Before",
    });
    expect(
      call(target, {
        kind: "replace",
        revision: crypto.randomUUID(),
        text: "Wrong",
      })
    ).toEqual({ kind: "stale" });
    expect(
      call(target, { kind: "replace", revision: target, text: "After & only" })
    ).toEqual({ kind: "applied", path: "/poster.svg", saved: false });
    expect(editor.serialize()).toBe(
      source.replace("Before", "After &amp; only")
    );
    expect(call(target, { kind: "read" })).toEqual({ kind: "unavailable" });
    editor.commands.undo();
    expect(editor.serialize()).toBe(source);
    expect(owner.capture()).not.toBe(target);
  } finally {
    close();
  }
});

it("retires selection and tab changes even after returning to the same SVG", () => {
  const { group, editor, owner, select, call, close } = fixture();
  try {
    const target = owner.capture()!;
    select("other");
    select("title");
    expect(
      call(target, { kind: "replace", revision: target, text: "Wrong" })
    ).toEqual({ kind: "unavailable" });
    const next = owner.capture()!;
    group.open(file("other.svg"));
    group.activate(file("poster.svg"));
    expect(call(next, { kind: "read" })).toEqual({ kind: "unavailable" });
    select("mixed");
    expect(owner.capture()).toBeUndefined();
    expect(editor.serialize()).toBe(source);
  } finally {
    close();
  }
});

it("observes eligible SVG text only in the active tab", () => {
  const { group, owner, select, call, close } = fixture();
  const changes: boolean[] = [];
  const unsubscribe = owner.subscribe(() => changes.push(owner.hasSelection()));
  try {
    expect(owner.hasSelection()).toBe(true);
    const target = owner.capture()!;
    select("mixed");
    expect(call(target, { kind: "read" })).toEqual({ kind: "unavailable" });
    select("other");
    select("title");
    group.open(file("other.svg"));
    group.activate(file("poster.svg"));
    close();
    expect(changes).toEqual([false, true, false, true, false]);
  } finally {
    unsubscribe();
    close();
  }
});

it("inspects mixed SVG objects and undoes one edit to the exact selection", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/><g id="box"/><image href="photo.png"/><circle/></svg>';
  const editor = createSvgEditor({ svg });
  const group = new EditorGroup();
  const owner = new WorkspaceSvgText(group);
  const close = owner.register("mixed.svg", editor);
  group.open(file("mixed.svg"));
  const tree = editor.tree();
  const [rect, box, image] = tree.nodes.get(tree.root)!.children;
  const call = (
    targetId: string,
    operation: NativeEditorSvgSelection.Operation
  ) =>
    owner.svgSelection.invoke({
      targetId,
      operation,
      expiresAtMs: Date.now() + 1000,
    });
  try {
    expect(owner.svgSelection.capture()).toBeUndefined();
    editor.commands.select([rect, box, image]);
    const target = owner.svgSelection.capture()!;
    const another = owner.svgSelection.capture()!;
    const read = call(target, { kind: "inspect" });
    expect(NativeEditorSvgSelection.result(read)).toEqual({
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
    expect(owner.capture()).toBeUndefined();
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

    const beforeSwitch = owner.svgSelection.capture()!;
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
  const owner = new WorkspaceSvgText(group);
  const close = owner.register(filePath, editor);
  group.open(file(filePath));
  const tree = editor.tree();
  editor.commands.select(tree.nodes.get(tree.root)!.children);
  try {
    const targetId = owner.svgSelection.capture()!;
    let cursor: NativeEditorSvgSelection.Cursor | null = null;
    const paths: number[][] = [];
    do {
      const result = NativeEditorSvgSelection.result(
        owner.svgSelection.invoke({
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
        NativeEditorSvgSelection.MAX_PAGE_ITEMS
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
    const ids = Array.from({ length: 260 }, () => owner.svgSelection.capture());
    expect(ids.every(NativeEditorSvgSelection.isId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const targetId = ids[0]!;
    const request = {
      targetId,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    };
    expect(owner.svgSelection.invoke(request)).toMatchObject({
      kind: "inspection",
      revision: targetId,
      total: 1,
    });
    expect(
      owner.svgSelection.invoke({
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
  const owner = new WorkspaceSvgText(group);
  const close = owner.register("poster.svg", editor);
  group.open(file("poster.svg"));
  const tree = editor.tree();
  const [rect] = tree.nodes.get(tree.root)!.children;
  editor.commands.select(rect);
  try {
    expect(tree.nodes.get(rect)?.name).toBe("\ud800");
    const result = owner.svgSelection.invoke({
      targetId: owner.svgSelection.capture()!,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" },
    });
    expect(NativeEditorSvgSelection.result(result)).toMatchObject({
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
  const owner = new WorkspaceSvgText(group);
  const filePath = `${"workspace-folder/".repeat(140)}large.svg`;
  const close = owner.register(filePath, editor);
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
    const result = owner.svgSelection.invoke({
      targetId: owner.svgSelection.capture()!,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" },
    });
    expect(NativeEditorSvgSelection.result(result)).toMatchObject({
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
