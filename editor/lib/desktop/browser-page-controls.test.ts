import { describe, expect, it, vi } from "vitest";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserPageControls } from "./browser-page-controls";

function fixture() {
  let factor = 1;
  const api: DesktopBrowser.Utilities.Bridge = {
    version: 1,
    find: vi.fn<DesktopBrowser.Utilities.Bridge["find"]>(async () => ({
      matches: 3,
      activeMatchOrdinal: 1,
    })),
    stopFind: vi.fn<DesktopBrowser.Utilities.Bridge["stopFind"]>(
      async () => {}
    ),
    getZoom: vi.fn<DesktopBrowser.Utilities.Bridge["getZoom"]>(
      async () => factor
    ),
    setZoom: vi.fn<DesktopBrowser.Utilities.Bridge["setZoom"]>(
      async (request) => (factor = request.factor)
    ),
    print: vi.fn<DesktopBrowser.Utilities.Bridge["print"]>(async () => {}),
    inspect: vi.fn<DesktopBrowser.Utilities.Bridge["inspect"]>(async () => {}),
  };
  let binding: BrowserPageControls.Binding | null = {
    api,
    target: { attachmentId: "owner", pageId: "page" },
    revision: 0,
  };
  const controller = new BrowserPageControls.Controller(() => binding);
  return {
    api,
    controller,
    bind(next: BrowserPageControls.Binding | null) {
      binding = next;
      controller.sync();
    },
    target: binding.target,
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("BrowserPageControls.Controller", () => {
  it("does not let a stale or overlapping zoom observation replace a command", async () => {
    const { api, controller } = fixture();
    let finishRead!: (value: number) => void;
    const read = vi.mocked(api.getZoom).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      })
    );
    const refreshing = controller.refreshZoom();
    let finishWrite!: (value: number) => void;
    vi.mocked(api.setZoom).mockReturnValueOnce(
      new Promise((resolve) => {
        finishWrite = resolve;
      })
    );
    const changing = controller.zoom("in");
    await settle();
    await controller.refreshZoom();
    expect(read).toHaveBeenCalledTimes(2);
    finishWrite(1.2);
    await changing;
    finishRead(1);
    await refreshing;
    expect(controller.read().zoom).toBe(1.2);
    await controller.refreshZoom();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("finds with an owned target, supports previous/match-case and stops on close", async () => {
    const { api, controller, target } = fixture();
    expect(api.find).not.toHaveBeenCalled();
    expect(controller.openFind()).toBe(true);
    controller.setText("Design");
    await settle();
    expect(api.find).toHaveBeenLastCalledWith({
      ...target,
      text: "Design",
      forward: true,
      findNext: false,
      matchCase: false,
    });
    expect(controller.read().result).toEqual({
      matches: 3,
      activeMatchOrdinal: 1,
    });
    controller.setMatchCase(true);
    await settle();
    await controller.next(false);
    expect(api.find).toHaveBeenLastCalledWith({
      ...target,
      text: "Design",
      forward: false,
      findNext: true,
      matchCase: true,
    });
    controller.closeFind();
    expect(api.stopFind).toHaveBeenLastCalledWith(target);
    expect(controller.read()).toMatchObject({
      findOpen: false,
      finding: false,
      result: null,
    });
  });

  it("rejects stale find replies across text changes, navigation and inactive targets", async () => {
    const { api, controller, target, bind } = fixture();
    const pending: ((value: DesktopBrowser.Utilities.FindResult) => void)[] =
      [];
    api.find = vi.fn<DesktopBrowser.Utilities.Bridge["find"]>(
      () => new Promise((resolve) => pending.push(resolve))
    );
    controller.openFind();
    controller.setText("old");
    controller.setText("new");
    pending[1]({ matches: 2, activeMatchOrdinal: 2 });
    await settle();
    pending[0]({ matches: 9, activeMatchOrdinal: 1 });
    await settle();
    expect(controller.read().result).toEqual({
      matches: 2,
      activeMatchOrdinal: 2,
    });
    controller.setText("pending");
    bind({ api, target, revision: 1 });
    pending[2]({ matches: 7, activeMatchOrdinal: 1 });
    await settle();
    expect(controller.read()).toMatchObject({ findOpen: false, result: null });
    expect(api.stopFind).toHaveBeenCalledWith(target);
    bind(null);
    expect(controller.openFind()).toBe(false);
    expect(controller.read().supported).toBe(false);
  });

  it("validates bounded find text and malformed outcomes without exposing native errors", async () => {
    const { api, controller } = fixture();
    controller.openFind();
    controller.setText("x".repeat(1025));
    expect(api.find).not.toHaveBeenCalled();
    expect(controller.read().error).toContain("shorter");
    api.find = async () => ({ matches: -1, activeMatchOrdinal: 1 });
    controller.setText("valid");
    await settle();
    expect(controller.read().error).toContain("Couldn’t find");
    controller.setText("");
    expect(controller.read()).toMatchObject({ result: null, finding: false });
  });

  it("serializes zoom, clamps at native bounds, and prints/inspects only its page", async () => {
    const { api, controller, target } = fixture();
    await Promise.all([controller.zoom("in"), controller.zoom("in")]);
    expect(controller.read().zoom).toBe(1.44);
    await controller.zoom("reset");
    expect(controller.read().zoom).toBe(1);
    api.getZoom = async () => 5;
    await controller.zoom("in");
    expect(controller.read().zoom).toBe(5);
    api.getZoom = async () => 0.25;
    await controller.zoom("out");
    expect(controller.read().zoom).toBe(0.25);
    await controller.print();
    await controller.inspect();
    expect(api.print).toHaveBeenCalledExactlyOnceWith(target);
    expect(api.inspect).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("does not send queued zoom to a replacement target or resurrect a disposed controller", async () => {
    const { api, controller, bind } = fixture();
    let finish!: (value: number) => void;
    api.getZoom = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const first = controller.zoom("in");
    const second = controller.zoom("in");
    await settle();
    bind(null);
    finish(1);
    await Promise.all([first, second]);
    expect(api.setZoom).not.toHaveBeenCalled();
    bind({
      api,
      target: { attachmentId: "next", pageId: "next" },
      revision: 0,
    });
    controller.dispose();
    expect(controller.openFind()).toBe(false);
    await controller.inspect();
    expect(api.inspect).not.toHaveBeenCalled();
  });
});
