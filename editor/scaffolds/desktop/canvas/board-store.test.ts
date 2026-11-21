import { describe, expect, it } from "vitest";
import { NativeEditorSelection } from "@grida/desktop-bridge";
import { createSvgEditor } from "@grida/svg-editor";
import { dotcanvas } from "dotcanvas";
import { DocumentSurfaceHost } from "../file/document-surface-host";
import { EditorGroup } from "../workbench/editor-group";
import { WorkbenchTab } from "../workbench/workbench-tab";
import { WorkspaceSurfaceHost } from "../workbench/workspace-surface-host";
import { CanvasBoard, isUriSrc } from "./board-store";
import type { WorkspaceFsClient } from "./workspace-bundle-fs";

/** Map-backed stand-in for the desktop `workspaces` bridge (board needs only
 *  the read/write fs surface — no trash). */
class FakeWorkspace implements WorkspaceFsClient {
  files = new Map<string, string>();
  private mtime = 0;
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.files.set(k, v);
  }
  async readdir(_w: string, relPath?: string) {
    const prefix = relPath ? `${relPath}/` : "";
    const seen = new Set<string>();
    const out: { rel_path: string; kind: "file" | "directory" }[] = [];
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) out.push({ rel_path: k, kind: "file" });
      else {
        const dir = prefix + rest.slice(0, slash);
        if (!seen.has(dir)) {
          seen.add(dir);
          out.push({ rel_path: dir, kind: "directory" });
        }
      }
    }
    return out;
  }
  async readFile(_w: string, relPath: string) {
    const content = this.files.get(relPath);
    if (content === undefined) throw new Error(`ENOENT: ${relPath}`);
    return { content };
  }
  async writeFile(_w: string, relPath: string, content: string) {
    this.files.set(relPath, content);
    return { mtime: ++this.mtime };
  }
  manifest(): dotcanvas.Manifest {
    return JSON.parse(this.files.get(".canvas.json") ?? "{}");
  }
}

const URL = "https://cdn.example.com/library/ref.jpg";

describe("isUriSrc", () => {
  it("distinguishes a URL from a bundle path", () => {
    expect(isUriSrc(URL)).toBe(true);
    expect(isUriSrc("outputs/hero.png")).toBe(false);
    expect(isUriSrc("./a.svg")).toBe(false);
  });
});

describe("CanvasBoard", () => {
  it("adds a URI pin (manifest-only, no file authored) and a placed file pin", async () => {
    const ws = new FakeWorkspace({ "outputs/hero.png": "PNGBYTES" });
    const board = new CanvasBoard("w", ws);
    await board.load();

    await board.addFrame(URL, { x: 0, y: 0, w: 480, h: 320 });
    await board.addFrame("outputs/hero.png", { x: 520, y: 0, w: 768, h: 512 });
    await board.flush();

    const frames = board.getFrames();
    expect(frames.map((f) => f.src)).toEqual([URL, "outputs/hero.png"]);
    // a URI pin authors no file; only the manifest + the pre-existing output exist
    expect([...ws.files.keys()].sort()).toEqual([
      ".canvas.json",
      "outputs/hero.png",
    ]);
    expect(ws.manifest().editor).toBe("board");
  });

  it("places / moves a pin via setLayout and round-trips through reload", async () => {
    const ws = new FakeWorkspace();
    const board = new CanvasBoard("w", ws);
    await board.load();
    await board.addFrame(URL);
    await board.setLayout(URL, { x: 5, y: 6, w: 100, h: 80 });
    await board.flush();

    // a fresh store over the same disk sees the placement (persisted)
    const reopened = new CanvasBoard("w", ws);
    await reopened.load();
    expect(reopened.getFrames()).toEqual([
      { id: URL, src: URL, layout: { x: 5, y: 6, w: 100, h: 80 } },
    ]);
  });

  it("removes a pin from the manifest (file/URL left in place)", async () => {
    const ws = new FakeWorkspace({ "outputs/hero.png": "PNGBYTES" });
    const board = new CanvasBoard("w", ws);
    await board.load();
    await board.addFrame("outputs/hero.png");
    await board.removeFrame("outputs/hero.png");
    await board.flush();

    expect(board.getFrames()).toEqual([]);
    expect(ws.files.has("outputs/hero.png")).toBe(true); // not trashed
  });

  it("bundlePath rejects a traversal src but passes URIs and bundle-local files", () => {
    const board = new CanvasBoard("w", new FakeWorkspace(), "designs.canvas");
    // A hostile/garbled manifest src must not resolve outside the bundle root.
    expect(() => board.bundlePath("../../secrets.env")).toThrow(
      /non-bundle-local/
    );
    expect(() => board.bundlePath("/etc/passwd")).toThrow(/non-bundle-local/);
    // Legit inputs still resolve: a URI passes through, a file gets basePath.
    expect(board.bundlePath(URL)).toBe(URL);
    expect(board.bundlePath("outputs/hero.png")).toBe(
      "designs.canvas/outputs/hero.png"
    );
  });
});

describe("Board editor selection", () => {
  const boardRelPath = "boards/design.canvas";
  const localSvg = "art/logo.svg";
  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const documents = [
    {
      id: "original",
      src: localSvg,
      layout: { x: 10, y: 15, custom: "legacy" },
    },
    { id: "copy", src: localSvg, layout: { y: 50 } },
    { id: "remote", src: "https://example.test/remote.svg" },
    { id: "bitmap", src: "photo.png" },
  ];

  function fixture() {
    const workspace = new FakeWorkspace({
      [`${boardRelPath}/.canvas.json`]: JSON.stringify({
        editor: "board",
        documents,
      }),
      [`${boardRelPath}/${localSvg}`]: svgSource,
      [`${boardRelPath}/photo.png`]: "PNG",
    });
    return new CanvasBoard("workspace", workspace, boardRelPath);
  }

  it("pins a whole SVG by frame, revoking captures on layout changes, deselection, and tab switches", async () => {
    const board = fixture();
    await board.load();
    const group = new EditorGroup();
    const host = new WorkspaceSurfaceHost(async () => [], group);
    const selection = host.editorSelection;
    group.open(WorkbenchTab.file(boardRelPath));
    const close = host.bindBoardSelection(boardRelPath, board)!;
    const boardPath = `/${boardRelPath}`;
    const path = `${boardPath}/${localSvg}`;
    const capture = () => ({
      targetId: selection.capture()!,
      subject: selection.readSubject()!,
      path,
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    });
    try {
      expect(selection.hasSelection()).toBe(false);
      board.selectFrame("original");
      expect(selection.readLabel()).toBe("Selection");
      const first = capture();
      expect(host.readEditorSurfaces()).toEqual({
        active: boardPath,
        open: [boardPath],
        truncated: false,
        selection: {
          kind: "document",
          path,
          placement: { boardPath, pinId: "original" },
        },
      });
      expect(NativeEditorSelection.result(selection.invoke(first))).toEqual({
        kind: "inspection",
        mode: "document",
        path,
        revision: first.targetId,
        total: 1,
        nextCursor: null,
        targets: [
          {
            kind: "document",
            placement: {
              boardPath,
              pinId: "original",
              layout: { x: 10, y: 15 },
            },
          },
        ],
      });
      expect(selection.invoke({ ...first, subject: undefined })).toEqual({
        kind: "stale",
      });
      expect(
        selection.invoke({
          ...first,
          operation: {
            kind: "set-opacity",
            revision: first.targetId,
            opacity: 0.5,
          },
        })
      ).toEqual({ kind: "unsupported" });
      expect(
        selection.invoke({ ...first, operation: { kind: "read-text" } })
      ).toEqual({
        kind: "unsupported",
      });

      board.selectFrame("copy");
      const second = capture();
      expect(selection.invoke(first)).toEqual({ kind: "stale" });
      expect(selection.invoke({ ...second, subject: first.subject })).toEqual({
        kind: "stale",
      });
      expect(selection.invoke(second)).toMatchObject({
        mode: "document",
        targets: [{ placement: { pinId: "copy", layout: null } }],
      });

      await board.setLayout("copy", { x: 30, y: -20, z: 3 });
      const moved = capture();
      expect(selection.invoke(second)).toEqual({ kind: "stale" });
      expect(selection.invoke(moved)).toMatchObject({
        mode: "document",
        targets: [
          { placement: { pinId: "copy", layout: { x: 30, y: -20, z: 3 } } },
        ],
      });
      selection.clear();
      expect(board.getSelectedId()).toBeNull();
      expect(selection.capture()).toBeUndefined();
      board.selectFrame("copy");
      expect(selection.invoke(moved)).toEqual({ kind: "stale" });
      const reselected = capture();
      expect(selection.invoke(reselected)).toMatchObject({
        targets: [
          { placement: { pinId: "copy", layout: { x: 30, y: -20, z: 3 } } },
        ],
      });

      group.open(WorkbenchTab.file("other.svg"));
      expect(selection.readSubject()).toBeUndefined();
      group.activate(WorkbenchTab.file(boardRelPath));
      expect(selection.invoke(reselected)).toEqual({ kind: "stale" });
    } finally {
      close();
      await board.flush();
    }
  });

  it("limits dedicated board context to a local SVG pin without listing a tab", async () => {
    const board = fixture();
    await board.load();
    const host = new DocumentSurfaceHost();
    const close = host.bindBoardSelection(board);
    try {
      for (const id of ["remote", "bitmap"]) {
        board.selectFrame(id);
        expect(board.getSelectedId()).toBe(id);
        expect(host.editorSelection.hasSelection()).toBe(false);
      }
      board.selectFrame("original");
      expect(host.readEditorSurfaces()).toEqual({
        active: null,
        open: [],
        truncated: false,
        selection: {
          kind: "document",
          path: `/${localSvg}`,
          placement: { boardPath: "/", pinId: "original" },
        },
      });
      const targetId = host.editorSelection.capture()!;
      await board.removeFrame("original");
      expect(board.getSelectedId()).toBeNull();
      board.selectFrame("copy");
      expect(
        host.editorSelection.invoke({
          targetId,
          subject: host.editorSelection.readSubject(),
          expiresAtMs: Date.now() + 1000,
          operation: { kind: "inspect" },
        })
      ).toEqual({ kind: "stale" });
    } finally {
      close();
      await board.flush();
    }
  });

  it("notifies availability subscribers when the kind of active selection changes", async () => {
    const board = fixture();
    await board.load();
    board.selectFrame("copy");
    const editor = createSvgEditor({ svg: svgSource });
    const tree = editor.tree();
    editor.commands.select(tree.nodes.get(tree.root)!.children);
    const group = new EditorGroup();
    const host = new WorkspaceSurfaceHost(async () => [], group);
    const closeSvg = host.bindSvgEditor("art.svg", "art.svg", editor)!;
    const closeBoard = host.bindBoardSelection(boardRelPath, board)!;
    group.open(WorkbenchTab.file("art.svg"));
    const kinds: (NativeEditorSelection.Subject["kind"] | undefined)[] = [];
    const unsubscribe = host.editorSelection.subscribe(() => {
      kinds.push(host.editorSelection.readSubject()?.kind);
    });
    try {
      expect(host.editorSelection.hasSelection()).toBe(true);
      group.open(WorkbenchTab.file(boardRelPath));
      expect(host.editorSelection.hasSelection()).toBe(true);
      group.activate(WorkbenchTab.file("art.svg"));
      expect(kinds).toEqual(["document", "svg"]);
    } finally {
      unsubscribe();
      closeBoard();
      closeSvg();
      editor.dispose();
    }
  });
});
