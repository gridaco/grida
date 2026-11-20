import { createRequire } from "node:module";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SvgEditorProvider, useSvgEditor } from "@grida/svg-editor/react";
import { expect, it, vi } from "vitest";
import { SlideSurface } from "./slide-surface";

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

it("reports a dirty slide and clears the report on save or unmount", async () => {
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
  let editor: ReturnType<typeof useSvgEditor>;
  function TestSlide() {
    editor = useSvgEditor();
    return (
      <SlideSurface
        workspaceId="workspace"
        relPath={relPath}
        initialMtime={10}
        onDirtyChange={report}
      />
    );
  }

  try {
    await act(async () => {
      root.render(
        <SvgEditorProvider initialSvg={original}>
          <TestSlide />
        </SvgEditorProvider>
      );
    });
    expect(report).toHaveBeenLastCalledWith(false);

    await act(async () => editor.load(edited));
    expect(report).toHaveBeenLastCalledWith(true);

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
