// DOM-only music lifecycle check; no provider calls or canvas rendering.
import { act } from "react";
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
import type { CurrentGGModel } from "@/lib/desktop/gg-models";

const dom = await vi.hoisted(async () => {
  // jsdom's optional canvas adapter is not used by this form test. Do not load
  // a platform-specific native graphics binary just to create a DOM test window.
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
    /* optional peer is absent in some installations */
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
    "DocumentFragment",
    "HTMLSelectElement",
    "HTMLOptionElement",
    "HTMLElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "HTMLFormElement",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "FormData",
    "File",
    "FileList",
    "navigator",
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  }
  return dom;
});
afterAll(() => dom.window.close());

const discovery = vi.hoisted(() => ({
  models: [] as readonly CurrentGGModel[] | null,
}));
const generate = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/lib/desktop/gg-models", () => ({
  useGGModels: () => discovery.models,
}));
vi.mock("@/lib/desktop/bridge", () => ({
  audio: { music: { isSupported: () => true, generate } },
}));
vi.mock("@/lib/desktop/gg-session", () => ({
  ensureFresh: vi.fn<() => Promise<void>>(),
  forceRefresh: vi.fn<() => Promise<void>>(),
}));
import { MusicGenerationControls } from "./music-generation-controls";

const model: CurrentGGModel = {
  id: "fixture/new-music",
  label: "Fixture music",
  kind: "music",
  created: 0,
  owned_by: "fixture",
  interfaces: ["endpoints"],
  input_modalities: ["text"],
  output_modalities: ["audio"],
  operation_ids: [],
  capabilities: {},
  limits: {},
};
let container: HTMLDivElement;
let root: Root;
const props = { initialModelId: model.id, onGenerated: vi.fn<() => void>() };
async function render() {
  await act(async () => {
    root.render(<MusicGenerationControls {...props} />);
  });
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  discovery.models = [model];
  generate.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("music draft and explicit model preservation", () => {
  it("keeps the same draft composer through an outage and recovery", async () => {
    await render();
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!;
      setter.call(textarea, "Keep this music draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    discovery.models = [];
    await render();
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(textarea.value).toBe("Keep this music draft");
    expect(container.textContent).toContain("Your draft is kept");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(true);
    discovery.models = [model];
    await render();
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(textarea.value).toBe("Keep this music draft");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it("does not substitute a different model or clear an unavailable submission", async () => {
    discovery.models = [
      { ...model, id: "fixture/other-music", label: "Other music" },
    ];
    await render();
    expect(container.textContent).toContain("Select another model");
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(textarea, "Still my draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(textarea.value).toBe("Still my draft");
    expect(generate).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Generate music"]'
      )!.disabled
    ).toBe(true);
  });
});
