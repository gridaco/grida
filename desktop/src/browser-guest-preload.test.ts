/** GRIDA-SEC-016 — the private preload admits only trusted ordinary anchor intents. */
import fs from "node:fs/promises";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
import ts from "typescript";
async function fixture() {
  const handlers = new Map<string, (event: unknown) => void>();
  const sendSync = vi.fn<(channel: string, payload: unknown) => void>();
  class Anchor {
    href = "https://other.example/";
    target = "_blank";
    relList = { contains: vi.fn<() => boolean>(() => false) };
    hasAttribute = vi.fn<() => boolean>(() => false);
  }
  const source = await fs.readFile(
    new URL("./browser-guest-preload.ts", import.meta.url),
    "utf8"
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const context = vm.createContext({
    require: () => ({ ipcRenderer: { sendSync } }),
    exports: {},
    HTMLAnchorElement: Anchor,
    HTMLAreaElement: Anchor,
    location: { href: "https://source.example/" },
    window: {
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
    },
  });
  vm.runInContext(code, context);
  const anchor = new Anchor();
  const event = {
    type: "click",
    isTrusted: true,
    defaultPrevented: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    button: 0,
    composedPath: () => [anchor],
  };
  return {
    sendSync,
    anchor,
    event,
    dispatch: (extra = {}) =>
      handlers.get((extra && (extra as { type?: string }).type) || "click")!({
        ...event,
        ...extra,
      }),
  };
}
it("records a foreground link intent without exposing a page API or suppressing native window-open metadata", async () => {
  const f = await fixture();
  f.dispatch();
  expect(f.sendSync).toHaveBeenCalledWith("grida:browser-guest:link", {
    url: f.anchor.href,
    documentUrl: "https://source.example/",
    disposition: "foreground",
  });
});
it.each([{ isTrusted: false }, { defaultPrevented: true }, { altKey: true }])(
  "ignores synthetic, cancelled and alternate native actions: %j",
  async (event) => {
    const f = await fixture();
    f.dispatch(event);
    expect(f.sendSync).not.toHaveBeenCalled();
  }
);
it("preserves native opener-dependent links and download actions", async () => {
  const f = await fixture();
  f.anchor.relList.contains.mockReturnValueOnce(true);
  f.dispatch();
  f.anchor.hasAttribute.mockReturnValueOnce(true);
  f.dispatch();
  expect(f.sendSync).not.toHaveBeenCalled();
});
it("routes modifier/middle clicks to background and Shift-modified clicks to foreground", async () => {
  const f = await fixture();
  f.anchor.target = "";
  f.dispatch({ metaKey: true });
  expect(f.sendSync).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ disposition: "background" })
  );
  f.dispatch({ type: "auxclick", button: 1, shiftKey: true });
  expect(f.sendSync).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ disposition: "foreground" })
  );
});
it("captures an explicit OS-link click without changing ordinary generated-page links", async () => {
  const f = await fixture();
  const preventDefault = vi.fn<() => void>();
  f.anchor.target = "";
  f.anchor.href = "mailto:person@example.test";
  f.dispatch({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(f.sendSync).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ url: f.anchor.href })
  );
  f.sendSync.mockClear();
  preventDefault.mockClear();
  f.anchor.href = "blob:https://source.example/generated";
  f.dispatch({ preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(f.sendSync).not.toHaveBeenCalled();
});
