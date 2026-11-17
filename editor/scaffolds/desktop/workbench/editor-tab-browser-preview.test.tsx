// DOM-only hover lifecycle evidence; no native browser or website interaction.
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { DesktopBrowser } from "@grida/desktop-bridge";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { BrowserThumbnailFixtures } from "./browser-thumbnail.fixtures";

const dom = await vi.hoisted(async () => {
  // Match existing DOM component tests: canvas is an unused optional peer.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const environmentRequire = createRequire(
    require.resolve("vitest/package.json")
  );
  const jsdomPath = environmentRequire.resolve("jsdom");
  const domRequire = createRequire(jsdomPath);
  let canvasPath: string | undefined;
  let canvasEntry: NodeJS.Module | undefined;
  try {
    canvasPath = domRequire.resolve("canvas");
    canvasEntry = require.cache[canvasPath];
    require.cache[canvasPath] = {
      exports: { createCanvas: undefined },
      loaded: true,
    } as unknown as NodeJS.Module;
  } catch {
    /* Some installations omit the optional peer. */
  }
  const { JSDOM } = domRequire(jsdomPath);
  if (canvasPath) {
    if (canvasEntry) require.cache[canvasPath] = canvasEntry;
    else delete require.cache[canvasPath];
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "navigator",
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  return dom;
});
afterAll(() => dom.window.close());
vi.mock("./editor-tab-preview-content", () => ({
  EditorTabPreviewContent: () => null,
}));
import {
  BrowserTabPreview,
  BrowserTabPreviewContent,
} from "./editor-tab-preview";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function entry(
  overrides: Partial<DesktopBrowser.Page> = {}
): WorkspaceBrowserTabs.Entry {
  return {
    id: "tab",
    url: "https://example.com/",
    storageScope: "workspace",
    error: null,
    locationRevision: 0,
    page: {
      id: "page",
      revision: 1,
      url: "https://example.com/",
      title: "Example",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      focused: false,
      storageScope: "workspace",
      failure: null,
      ...overrides,
    },
  };
}
const source = (
  thumbnail: (id: string) => Promise<DesktopBrowser.Thumbnail | null>
) => ({ thumbnail }) as WorkspaceBrowserTabs;

describe("browser tab hover preview", () => {
  it("shares one lazy read across StrictMode effect replay and renders its result", async () => {
    let resolve!: (image: DesktopBrowser.Thumbnail) => void;
    const read = vi.fn<WorkspaceBrowserTabs["thumbnail"]>(
      () =>
        new Promise<DesktopBrowser.Thumbnail>((done) => {
          resolve = done;
        })
    );
    const tabs = source(read);
    await act(async () =>
      root.render(
        <StrictMode>
          <BrowserTabPreview tabs={tabs} entry={entry()} />
        </StrictMode>
      )
    );
    expect(read).toHaveBeenCalledExactlyOnceWith("tab");
    await act(async () => {
      resolve(BrowserThumbnailFixtures.solid);
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      BrowserThumbnailFixtures.solid.dataUrl
    );
    expect(container.textContent).toContain("Example");
    expect(container.textContent).toContain("example.com");
  });

  it("keeps unavailable captures compact and removes a decode failure", async () => {
    await act(async () =>
      root.render(
        <BrowserTabPreviewContent
          title="Example"
          url="https://example.com/?private=value"
          thumbnail={null}
        />
      )
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".aspect-video")).toBeNull();
    expect(container.textContent).toBe("Exampleexample.com");
    await act(async () =>
      root.render(
        <BrowserTabPreviewContent
          title="Example"
          url="https://example.com/"
          thumbnail={BrowserThumbnailFixtures.solid}
        />
      )
    );
    expect(container.querySelector("img")).not.toBeNull();
    await act(async () => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".aspect-video")).toBeNull();
  });

  it("discards settled pixels across a same-URL reload without another capture", async () => {
    const read = vi.fn<WorkspaceBrowserTabs["thumbnail"]>(
      async () => BrowserThumbnailFixtures.solid
    );
    const tabs = source(read);
    await act(async () =>
      root.render(<BrowserTabPreview tabs={tabs} entry={entry()} />)
    );
    expect(container.querySelector("img")).not.toBeNull();
    await act(async () =>
      root.render(
        <BrowserTabPreview
          tabs={tabs}
          entry={{ ...entry({ loading: true }), previewRevision: 1 }}
        />
      )
    );
    expect(container.querySelector("img")).toBeNull();
    await act(async () =>
      root.render(
        <BrowserTabPreview
          tabs={tabs}
          entry={{ ...entry(), previewRevision: 1 }}
        />
      )
    );
    expect(container.querySelector("img")).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("ignores a late capture when the pointer moves to another tab", async () => {
    let resolve!: (image: DesktopBrowser.Thumbnail) => void;
    const read = vi.fn<WorkspaceBrowserTabs["thumbnail"]>((id: string) =>
      id === "tab"
        ? new Promise<DesktopBrowser.Thumbnail>((done) => {
            resolve = done;
          })
        : Promise.resolve(null)
    );
    const tabs = source(read);
    await act(async () =>
      root.render(<BrowserTabPreview key="tab" tabs={tabs} entry={entry()} />)
    );
    await act(async () =>
      root.render(
        <BrowserTabPreview
          key="second"
          tabs={tabs}
          entry={{ ...entry({ title: "Second" }), id: "second" }}
        />
      )
    );
    await act(async () => {
      resolve(BrowserThumbnailFixtures.solid);
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Second");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
