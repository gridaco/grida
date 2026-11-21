import { createRequire } from "node:module";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SvgEditorProvider, useSvgEditor } from "@grida/svg-editor/react";
import { expect, it, vi } from "vitest";
import { DocumentSurfaceHost } from "../file/document-surface-host";
import { SlideSurface, type BindSlideEditor } from "./slide-surface";

const writeFile = vi.hoisted(() =>
  vi.fn<() => Promise<{ mtime: number }>>(async () => ({ mtime: 11 }))
);

vi.mock("@/lib/desktop/bridge", () => ({
  workspaces: { writeFile },
}));

// Camera attachment needs Chromium's SVG layout. The editor and save path
// remain real so the test observes changes from the document buffer.
vi.mock("@grida/svg-editor/presets", () => ({
  keynote: { attach: () => ({ detach: () => {} }) },
}));

const original =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const edited = original.replace('width="10"', 'width="20"');
const relPath = "deck.canvas/slide.svg";

function createDom() {
  const require = createRequire(import.meta.url);
  const vitestRequire = createRequire(require.resolve("vitest/package.json"));
  const jsdomPath = vitestRequire.resolve("jsdom");
  const jsdomRequire = createRequire(jsdomPath);
  // As in the other Desktop component tests, jsdom's optional canvas
  // dependency is present but its native binary is not built.
  let canvasPath: string | undefined;
  let canvasEntry: NodeJS.Module | undefined;
  try {
    canvasPath = jsdomRequire.resolve("canvas");
    canvasEntry = require.cache[canvasPath];
    require.cache[canvasPath] = {
      exports: { createCanvas: undefined },
      loaded: true,
    } as unknown as NodeJS.Module;
  } catch {
    // Some installs omit the optional dependency entirely.
  }
  try {
    const { JSDOM } = jsdomRequire(jsdomPath);
    return new JSDOM("<!doctype html><body></body>");
  } finally {
    if (canvasPath && canvasEntry) require.cache[canvasPath] = canvasEntry;
    else if (canvasPath) delete require.cache[canvasPath];
  }
}

it("expires the selection on a same-file slide switch and saves the live buffer", async () => {
  const dom = createDom();
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("DOMParser", dom.window.DOMParser);
  vi.stubGlobal("XMLSerializer", dom.window.XMLSerializer);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const report = vi.fn<(dirty: boolean) => void>();
  const surface = new DocumentSurfaceHost();
  const bindEditor: BindSlideEditor = (editor, slide) =>
    surface.bindEditor(editor, `/${slide.src}`);
  let editor!: ReturnType<typeof useSvgEditor>;
  function TestSlide({ id, active }: { id: string; active: boolean }) {
    editor = useSvgEditor();
    return (
      <SlideSurface
        workspaceId="workspace"
        relPath={relPath}
        initialMtime={10}
        active={active}
        onDirtyChange={report}
        binding={{ slide: { id, src: "slide.svg" }, bindEditor }}
      />
    );
  }

  try {
    const render = (id: string, active = true) => {
      root.render(
        <SvgEditorProvider initialSvg={original}>
          <TestSlide id={id} active={active} />
        </SvgEditorProvider>
      );
    };
    await act(async () => render("first"));
    expect(report).toHaveBeenLastCalledWith(false);

    await act(async () => {
      const tree = editor.tree();
      editor.commands.select(tree.nodes.get(tree.root)!.children);
    });
    const targetId = surface.editorSelection.capture()!;
    const request = {
      targetId,
      path: "/slide.svg",
      expiresAtMs: Date.now() + 1000,
      operation: { kind: "inspect" } as const,
    };
    expect(surface.editorSelection.invoke(request)).toMatchObject({
      kind: "inspection",
    });
    const previousEditor = editor;
    await act(async () => render("second"));
    expect(editor).toBe(previousEditor);
    expect(surface.readEditorSurfaces().selection).toEqual({
      kind: "svg",
      path: "/slide.svg",
    });
    expect(surface.editorSelection.invoke(request)).toEqual({ kind: "stale" });
    expect(surface.editorSelection.capture()).toBeDefined();

    await act(async () => editor.load(edited));
    expect(report).toHaveBeenLastCalledWith(true);

    await act(async () => render("second", false));
    expect(surface.readEditorSurfaces().selection).toBeUndefined();
    expect(editor.serialize()).toBe(edited);
    window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "s", metaKey: true })
    );
    expect(writeFile).not.toHaveBeenCalled();

    await act(async () => render("second"));
    await act(async () => {
      window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "s", metaKey: true })
      );
    });
    expect(writeFile).toHaveBeenCalledWith(
      "workspace",
      relPath,
      expect.stringContaining('width="20"'),
      10
    );
    expect(report).toHaveBeenLastCalledWith(false);

    await act(async () => editor.load(original));
    expect(report).toHaveBeenLastCalledWith(true);
    await act(async () => root.render(null));
    expect(report).toHaveBeenLastCalledWith(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    dom.window.close();
  }
});
