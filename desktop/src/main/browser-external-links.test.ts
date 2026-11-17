/** GRIDA-SEC-016 — OS links require actual owned document intent/confirmation. */
import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents } from "electron";
const native = vi.hoisted(() => ({
  prompt: vi.fn<(...args: unknown[]) => Promise<{ response: number }>>(),
  open: vi.fn<(url: string) => Promise<void>>(),
}));
vi.mock("electron", () => ({
  dialog: { showMessageBox: native.prompt },
  shell: { openExternal: native.open },
}));
import { BrowserExternalLinks } from "./browser-external-links";
beforeEach(() => {
  native.prompt.mockReset().mockResolvedValue({ response: 1 });
  native.open.mockReset().mockResolvedValue();
});
function fixture(helper = new BrowserExternalLinks()) {
  let live = true;
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {
      url: "https://site.test/page",
      origin: "https://site.test",
      detached: false,
    },
    isDestroyed: () => false,
  });
  const options = {
    contents: contents as unknown as WebContents,
    parent: { isDestroyed: () => false } as BrowserWindow,
    trustedClick: true,
    isLive: () => live,
  };
  return {
    helper,
    contents,
    options,
    revoke: () => {
      live = false;
    },
  };
}
it.each([
  "file:///secret",
  "data:text/html,x",
  "blob:https://site.test/x",
  "about:blank",
  "javascript:run()",
  "shell:run",
  "grida://native/secret",
  "grida-workspace://private/file",
  "chrome://settings",
  "electron://private",
  "custom:bad%zz",
  "custom:with space",
  "custom:\\local",
  "custom:bad\nurl",
  "custom://user:password@host/",
])("refuses native/private/malformed OS URLs: %s", (url) => {
  expect(BrowserExternalLinks.parse(url)).toBeNull();
});
it("opens a trusted visible mailto intent without a custom-app prompt", async () => {
  const f = fixture();
  await expect(
    f.helper.open("mailto:person@example.test?subject=Hello", f.options)
  ).resolves.toBe(true);
  expect(native.prompt).not.toHaveBeenCalled();
  expect(native.open).toHaveBeenCalledWith(
    "mailto:person@example.test?subject=Hello"
  );
});
it("asks once for trusted custom links per actual origin/scheme, but always asks for script/native requests", async () => {
  const f = fixture();
  await f.helper.open("customapp://open/one", f.options);
  await f.helper.open("customapp://open/two", f.options);
  expect(native.prompt).toHaveBeenCalledOnce();
  await f.helper.open("customapp://open/three", {
    ...f.options,
    trustedClick: false,
  });
  expect(native.prompt).toHaveBeenCalledTimes(2);
  f.helper.reset();
  await f.helper.open("customapp://open/four", f.options);
  expect(native.prompt).toHaveBeenCalledTimes(3);
});
it("rechecks exact document and caller lifetime after native confirmation", async () => {
  const f = fixture();
  let resolve!: (value: { response: number }) => void;
  native.prompt.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const opening = f.helper.open("customapp://open/one", f.options);
  f.contents.emit("did-start-navigation", { isMainFrame: true });
  resolve({ response: 1 });
  await expect(opening).resolves.toBe(false);
  expect(native.open).not.toHaveBeenCalled();
});
it("pins an identified subframe request and bounds concurrent confirmation", async () => {
  const f = fixture();
  let resolve!: (value: { response: number }) => void;
  let current = true;
  native.prompt.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const opening = f.helper.open("customapp://open/one", {
    ...f.options,
    trustedClick: false,
    source: { origin: "https://frame.test", isCurrent: () => current },
  });
  await expect(f.helper.open("customapp://open/two", f.options)).resolves.toBe(
    false
  );
  expect(native.prompt).toHaveBeenCalledWith(
    f.options.parent,
    expect.objectContaining({
      detail: expect.stringContaining("https://frame.test"),
    })
  );
  current = false;
  f.contents.emit("did-start-navigation", { isMainFrame: false });
  expect(
    (native.prompt.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted
  ).toBe(true);
  resolve({ response: 1 });
  await expect(opening).resolves.toBe(false);
  expect(native.open).not.toHaveBeenCalled();
});
it("does not launch rejected or unsupported applications and never throws into guest callbacks", async () => {
  const f = fixture();
  native.prompt.mockResolvedValueOnce({ response: 0 });
  await expect(f.helper.open("customapp://open/one", f.options)).resolves.toBe(
    false
  );
  expect(native.open).not.toHaveBeenCalled();
  native.open.mockRejectedValueOnce(new Error("unregistered"));
  await expect(
    f.helper.open("mailto:person@example.test", f.options)
  ).resolves.toBe(false);
});

it("bounds canonical percent-expanded URIs as well as raw text", () => {
  expect(BrowserExternalLinks.parse("custom:" + "é".repeat(4000))).toBeNull();
  expect(BrowserExternalLinks.parse("app://open/item")).toEqual({
    url: "app://open/item",
    scheme: "app",
  });
});
it("retires a pending prompt when an iframe is removed without a navigation event", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    let current = true;
    let finish!: (value: { response: number }) => void;
    native.prompt.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const pending = f.helper.open("custom://open", {
      ...f.options,
      trustedClick: false,
      source: { origin: "https://frame.test", isCurrent: () => current },
    });
    current = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(
      (native.prompt.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted
    ).toBe(true);
    finish({ response: 1 });
    await expect(pending).resolves.toBe(false);
    expect(native.open).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
