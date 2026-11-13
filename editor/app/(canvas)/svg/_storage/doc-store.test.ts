import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SvgEditor } from "@grida/svg-editor";
import { MemoryBackend } from "./backend";
import { SvgDocStore } from "./doc-store";

// SvgDocStore persists a `.canvas` bundle over a BundleBackend. These pin the
// persistence contract without a browser: what is written, when, and that a
// fresh store over the same backend recovers it.

const DEFAULT_SVG = "<svg id='default'/>";

/** The slice of `SvgEditor` the store touches. */
class FakeEditor {
  state = { version: 0 };
  private svg: string;
  private readonly listeners = new Set<() => void>();
  constructor(svg: string) {
    this.svg = svg;
  }
  serialize = () => this.svg;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  edit(svg: string) {
    this.svg = svg;
    this.state = { version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }
  asEditor(): SvgEditor {
    return this as unknown as SvgEditor;
  }
}

function open(backend: MemoryBackend) {
  return new SvgDocStore({
    opfsBase: [],
    defaultSvg: DEFAULT_SVG,
    commitDebounceMs: 10,
    backend,
  });
}

describe("SvgDocStore persistence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("seeds one document into an empty bundle and writes it with a manifest", async () => {
    const backend = new MemoryBackend();
    const store = open(backend);
    await store.hydrate();
    await store.settled();

    const [doc] = store.getDocs();
    expect(store.getDocs()).toHaveLength(1);
    expect(await backend.read(`/${doc.id}.svg`)).toBe(DEFAULT_SVG);
    expect(await backend.read("/.canvas.json")).not.toBeNull();
  });

  it("writes active-editor edits after the debounce and recovers them on reopen", async () => {
    const backend = new MemoryBackend();
    const store = open(backend);
    await store.hydrate();
    const editor = new FakeEditor(store.getActiveSvg());
    store.attachEditor(editor.asEditor());

    editor.edit("<svg id='edited'/>");
    const id = store.getActiveId()!;
    expect(await backend.read(`/${id}.svg`)).toBe(DEFAULT_SVG);
    vi.advanceTimersByTime(10);
    await store.settled();
    expect(await backend.read(`/${id}.svg`)).toBe("<svg id='edited'/>");

    const second = store.appendDoc("<svg id='second'/>", "Second");
    store.dispose();
    await store.settled();

    const reopened = open(backend);
    await reopened.hydrate();
    expect(reopened.getDocs().map((d) => d.id)).toEqual([id, second]);
    expect(reopened.getActiveId()).toBe(second);
    reopened.setActiveId(id);
    expect(reopened.getActiveSvg()).toBe("<svg id='edited'/>");
  });

  it("flushes a pending edit when the editor detaches", async () => {
    const backend = new MemoryBackend();
    const store = open(backend);
    await store.hydrate();
    const editor = new FakeEditor(store.getActiveSvg());
    store.attachEditor(editor.asEditor());

    editor.edit("<svg id='pending'/>");
    store.detachEditor();
    await store.settled();
    expect(await backend.read(`/${store.getActiveId()}.svg`)).toBe(
      "<svg id='pending'/>"
    );
  });

  it("deletes a removed document's file", async () => {
    const backend = new MemoryBackend();
    const store = open(backend);
    await store.hydrate();
    const first = store.getActiveId()!;
    store.appendDoc();
    store.removeDoc(first);
    await store.settled();

    expect(await backend.read(`/${first}.svg`)).toBeNull();
    expect(store.getDocs().map((d) => d.id)).not.toContain(first);
  });
});
