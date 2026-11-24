import { createRequire } from "node:module";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorGroup } from "./editor-group";
import { EditorPane, type EditorPaneProps } from "./editor-pane";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkbenchTab } from "./workbench-tab";

vi.mock("./editor-pane-tab", () => ({
  EditorPaneTab: ({
    relPath,
    active,
  }: {
    relPath: string;
    active: boolean;
  }) => <textarea aria-label={relPath} aria-hidden={!active} />,
}));
vi.mock("./browser-pane", () => ({ BrowserPane: () => null }));
vi.mock("./editor-tab-preview", () => ({ EditorTabPreview: () => null }));

it("keeps a single dirty editor through restore, Start, and a chat with the same file", () => {
  const require = createRequire(import.meta.url);
  const fromVitest = createRequire(require.resolve("vitest/package.json"));
  const jsdomPath = fromVitest.resolve("jsdom");
  const fromJsdom = createRequire(jsdomPath);
  // The workbench fixture needs a DOM, independent of the optional canvas peer.
  let canvasPath: string | undefined;
  let originalCanvas: NodeJS.Module | undefined;
  try {
    canvasPath = fromJsdom.resolve("canvas");
    originalCanvas = require.cache[canvasPath];
    require.cache[canvasPath] = {
      exports: { createCanvas: undefined },
      loaded: true,
    } as NodeJS.Module;
  } catch {
    // Some installs omit optional dependencies.
  }
  const { JSDOM } = fromVitest("jsdom");
  if (canvasPath) {
    if (originalCanvas) require.cache[canvasPath] = originalCanvas;
    else delete require.cache[canvasPath];
  }

  const dom = new JSDOM("<!doctype html>", { url: "http://localhost" });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
  ])
    vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const path = "design.svg";
  const file = WorkbenchTab.file(path);
  const noop = () => {};
  const props: EditorPaneProps = {
    workspace: {
      id: "workspace",
      root: "/workspace",
      name: "Workspace",
      opened_at: 0,
      pinned: false,
    },
    panels: new WorkbenchPanels(new EditorGroup()),
    openTabs: [file],
    activeTab: file,
    dirtyPaths: new Set([path]),
    onTabDirtyChange: noop,
    onSelectTab: noop,
    onMoveTab: noop,
    onCloseTab: noop,
    onReopenClosedTab: noop,
    showStart: false,
    onOpenFileExplorer: noop,
    onCreateCanvas: async () => {},
    treeVisible: false,
    onToggleTree: noop,
  };
  const render = (override: Partial<EditorPaneProps> = {}) =>
    act(() => root.render(<EditorPane {...props} {...override} />));

  try {
    render();
    const editor = container.querySelector("textarea")!;
    editor.value = "unsaved";

    render({ openTabs: [], activeTab: null });
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.getAttribute("aria-hidden")).toBe("true");

    render({ openTabs: [], activeTab: null, showStart: true });
    expect(
      container.querySelector('[aria-label="Quick Start"]')
    ).not.toBeNull();
    expect(container.querySelector("textarea")).toBe(editor);

    render();
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.getAttribute("aria-hidden")).toBe("false");
    expect(editor.value).toBe("unsaved");

    render({
      openTabs: [],
      activeTab: null,
      showStart: true,
      dirtyPaths: new Set(),
      retainedFilePaths: new Set([path]),
    });
    expect(container.querySelector("textarea")).toBe(editor);

    render({
      openTabs: [],
      activeTab: null,
      showStart: true,
      dirtyPaths: new Set(),
    });
    expect(container.querySelector("textarea")).toBeNull();
  } finally {
    act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
