/** GRIDA-SEC-016 — native utility identity, result projection and cancellation. */
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents } from "electron";
import { BrowserPageTools } from "./browser-page-tools";
function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    findInPage: vi.fn<() => number>(() => 7),
    stopFindInPage: vi.fn<() => void>(),
    getZoomFactor: vi.fn<() => number>(() => 1),
    setZoomFactor: vi.fn<(factor: number) => void>(),
    print: vi.fn<
      (
        options: unknown,
        callback: (success: boolean, reason: string) => void
      ) => void
    >((_options, callback) => callback(false, "Print job canceled")),
    openDevTools: vi.fn<() => void>(),
  });
  let live = true;
  const tools = new BrowserPageTools(
    contents as unknown as WebContents,
    { isDestroyed: () => false } as BrowserWindow,
    () => live
  );
  return {
    contents,
    tools,
    revoke: () => {
      live = false;
    },
  };
}
const target = { attachmentId: "attachment", pageId: "page" };
it("returns final matching native counts without exposing native request IDs or geometry", async () => {
  const { contents, tools } = fixture();
  const found = tools.find({
    ...target,
    text: "hello",
    forward: true,
    findNext: false,
    matchCase: false,
  });
  contents.emit(
    "found-in-page",
    {},
    { requestId: 8, finalUpdate: true, matches: 12, activeMatchOrdinal: 1 }
  );
  contents.emit(
    "found-in-page",
    {},
    { requestId: 7, finalUpdate: false, matches: 2, activeMatchOrdinal: 1 }
  );
  contents.emit(
    "found-in-page",
    {},
    {
      requestId: 7,
      finalUpdate: true,
      matches: 3,
      activeMatchOrdinal: 2,
      selectionArea: { x: 1 },
    }
  );
  await expect(found).resolves.toEqual({ matches: 3, activeMatchOrdinal: 2 });
  expect(contents.listenerCount("found-in-page")).toBe(0);
});
it.each(["destroyed", "did-start-navigation"])(
  "expires find on %s and removes native listeners",
  async (event) => {
    const { contents, tools } = fixture();
    const found = tools.find({
      ...target,
      text: "hello",
      forward: true,
      findNext: false,
      matchCase: false,
    });
    contents.emit(event, { isMainFrame: true, isSameDocument: false });
    await expect(found).rejects.toThrow("browser_find_expired");
    expect(contents.listenerCount("found-in-page")).toBe(0);
  }
);
it("rejects stale identities and invalid utility input before calling Chromium", () => {
  const { contents, tools, revoke } = fixture();
  expect(() => tools.setZoom({ ...target, factor: 100 })).toThrow(
    "browser_zoom_invalid"
  );
  expect(contents.setZoomFactor).not.toHaveBeenCalled();
  revoke();
  expect(() => tools.inspect()).toThrow("browser_guest_unavailable");
  expect(contents.openDevTools).not.toHaveBeenCalled();
});
it("supports bounded zoom, native inspection and clearing find selection", () => {
  const { contents, tools } = fixture();
  expect(tools.setZoom({ ...target, factor: 0.25 })).toBe(1);
  expect(contents.setZoomFactor).toHaveBeenCalledWith(0.25);
  tools.inspect();
  expect(contents.openDevTools).toHaveBeenCalledWith({ mode: "detach" });
  tools.stopFind();
  expect(contents.stopFindInPage).toHaveBeenCalledWith("clearSelection");
});
it("treats native print cancellation as an ordinary outcome", async () => {
  await expect(fixture().tools.print()).resolves.toBeUndefined();
});
it("bounds an unavailable find result and ignores later native callbacks", async () => {
  vi.useFakeTimers();
  try {
    const { contents, tools } = fixture();
    const found = tools.find({
      ...target,
      text: "hello",
      forward: true,
      findNext: false,
      matchCase: false,
    });
    const outcome = found.catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await outcome).toMatchObject({ message: "browser_find_expired" });
    expect(contents.listenerCount("found-in-page")).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("supersedes an earlier find without allowing its later result to replace the current one", async () => {
  const { contents, tools } = fixture();
  const first = tools.find({
    ...target,
    text: "first",
    forward: true,
    findNext: false,
    matchCase: false,
  });
  const cancelled = first.catch((error: Error) => error);
  contents.findInPage.mockReturnValueOnce(8);
  const second = tools.find({
    ...target,
    text: "second",
    forward: true,
    findNext: false,
    matchCase: false,
  });
  contents.emit(
    "found-in-page",
    {},
    { requestId: 7, finalUpdate: true, matches: 10, activeMatchOrdinal: 1 }
  );
  contents.emit(
    "found-in-page",
    {},
    { requestId: 8, finalUpdate: true, matches: 1, activeMatchOrdinal: 1 }
  );
  expect(await cancelled).toMatchObject({ message: "browser_find_expired" });
  await expect(second).resolves.toEqual({ matches: 1, activeMatchOrdinal: 1 });
});
