import { describe, expect, it, vi } from "vitest";
import { BrowserHistory } from "@/lib/desktop/browser-history";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserOmnibox } from "./browser-omnibox";

const visited = {
  url: "https://example.com/docs",
  title: "Example docs",
  lastVisitedAt: 1,
};
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(
  url: string | null = "https://current.test/path",
  supported = true
) {
  const listeners = new Set<(change: DesktopBrowser.History.Change) => void>();
  const api: DesktopBrowser.History.Bridge = {
    version: 1,
    query: vi.fn<DesktopBrowser.History.Bridge["query"]>(async () => ({
      version: 1,
      revision: 0,
      entries: [visited],
    })),
    remove: vi.fn<DesktopBrowser.History.Bridge["remove"]>(async () => {}),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const history = new BrowserHistory.Controller(() =>
    supported ? api : undefined
  );
  const commands = {
    navigate: vi.fn<BrowserOmnibox.Commands["navigate"]>(),
    focusPage: vi.fn<BrowserOmnibox.Commands["focusPage"]>(),
  };
  const controller = new BrowserOmnibox.Controller(url, history, commands);
  return { controller, history, commands, api, listeners };
}

describe("BrowserOmnibox.Controller", () => {
  it("offers recent pages on focus, then local matches only after typing", async () => {
    const { controller, api, listeners } = fixture();
    expect(listeners.size).toBe(0);
    controller.focus();
    await settle();
    expect(api.query).toHaveBeenCalledWith({ query: "", limit: 8 });
    expect(
      controller.read().options.some((option) => option.url === visited.url)
    ).toBe(true);
    controller.change("design patterns");
    await settle();
    expect(api.query).toHaveBeenLastCalledWith({
      query: "design patterns",
      limit: 8,
    });
    expect(controller.read().options[0]).toMatchObject({
      kind: "search",
      url: "https://www.google.com/search?q=design%20patterns",
    });
    controller.blur();
    expect(listeners.size).toBe(0);
    controller.dispose();
  });

  it("displays native generated locations without offering rejected navigation or Google/history suggestions", async () => {
    const { controller, api } = fixture("data:text/html,private content");
    controller.focus();
    await settle();
    expect(controller.read().draft).toBe("data:text/html,private content");
    expect(api.query).not.toHaveBeenCalled();
    expect(controller.read().options).toEqual([]);
    expect(controller.submit()).toBe(false);
    controller.dispose();
  });

  it("selects the first/last recent option correctly from no selection", async () => {
    const { controller, commands } = fixture(null);
    controller.focus();
    await settle();
    expect(controller.read().selected).toBe(-1);
    controller.key("ArrowUp");
    expect(controller.read().selected).toBe(0);
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledExactlyOnceWith(visited.url);
    controller.dispose();
  });

  it("leaves typing local and submits Google only on a deliberate Enter", async () => {
    const { controller, commands } = fixture(null, false);
    controller.focus();
    controller.change("typography & layout");
    expect(commands.navigate).not.toHaveBeenCalled();
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledWith(
      "https://www.google.com/search?q=typography%20%26%20layout"
    );
    controller.dispose();
  });

  it.each([
    ["wanted search", "https://www.google.com/search?q=wanted%20search"],
    ["https://wanted.test/app", "https://wanted.test/app"],
  ])("preserves edited input across guest navigation: %s", (draft, url) => {
    const { controller, commands, history } = fixture();
    controller.focus();
    controller.change(draft);
    controller.sync("https://current.test/#updated-by-site", true, 0);
    expect(controller.read().draft).toBe(draft);
    expect(history.read().query).toBe(draft);
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledExactlyOnceWith(url);
    controller.dispose();
  });

  it("retains an IME draft while keeping Escape's page location current", () => {
    const { controller, commands } = fixture();
    controller.focus();
    controller.composition(true);
    controller.sync("https://current.test/redirect", true, 0);
    expect(controller.read().draft).toBe("https://current.test/path");
    controller.change("한글");
    controller.sync("https://current.test/#updated-by-site", true, 0);
    expect(controller.read()).toMatchObject({
      draft: "한글",
      composing: true,
    });
    expect(controller.submit()).toBe(false);
    expect(commands.navigate).not.toHaveBeenCalled();
    controller.composition(false);
    controller.key("Escape");
    expect(controller.read().draft).toBe(
      "https://current.test/#updated-by-site"
    );
    expect(commands.focusPage).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("continues displaying page URL changes without an active edit", () => {
    const { controller, commands } = fixture();
    controller.focus();
    controller.sync("https://current.test/redirect", true, 0);
    expect(controller.read().draft).toBe("https://current.test/redirect");
    controller.change("unfinished query");
    controller.blur();
    controller.sync("https://current.test/background", true, 0);
    expect(controller.read().draft).toBe("https://current.test/background");
    controller.focus();
    controller.change("hidden edit");
    controller.sync("https://current.test/hidden", false, 0);
    expect(controller.read()).toMatchObject({
      draft: "https://current.test/hidden",
      focused: false,
      expanded: false,
    });
    expect(commands.navigate).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("keeps IME Enter/Escape and composition updates out of navigation", () => {
    const { controller, commands } = fixture(null, false);
    controller.focus();
    controller.composition(true);
    controller.change("한글");
    expect(controller.key("Enter")).toBeNull();
    expect(controller.key("Escape", true)).toBeNull();
    expect(controller.submit()).toBe(false);
    expect(commands.navigate).not.toHaveBeenCalled();
    controller.composition(false);
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledWith(
      "https://www.google.com/search?q=%ED%95%9C%EA%B8%80"
    );
    controller.dispose();
  });

  it("rejects explicit unsafe input without a Google suggestion", () => {
    const { controller, commands } = fixture(null, false);
    controller.focus();
    controller.change("javascript:alert(1)");
    expect(controller.read().options).toEqual([]);
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledWith("javascript:alert(1)");
    expect(
      commands.navigate.mock.calls.some(([value]) =>
        value.includes("google.com")
      )
    ).toBe(false);
    controller.dispose();
  });

  it("restores full current URL on Escape and cancels hidden-pane observation", async () => {
    const { controller, commands, listeners } = fixture();
    controller.focus();
    await settle();
    controller.change("unfinished query");
    controller.key("Escape");
    expect(controller.read()).toMatchObject({
      draft: "https://current.test/path",
      expanded: false,
    });
    expect(commands.focusPage).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    controller.focus();
    controller.sync("https://next.test/", false, 0);
    expect(controller.read().expanded).toBe(false);
    expect(listeners.size).toBe(0);
    controller.dispose();
  });

  it("binds pointer selection/removal to the original URL across changed results", async () => {
    const { controller, history, commands, api } = fixture(null);
    controller.focus();
    await settle();
    const clicked = controller.read().options[0];
    history.setQuery("other");
    controller.choose(clicked);
    expect(commands.navigate).toHaveBeenCalledWith(visited.url);
    await history.remove(visited.url);
    expect(api.remove).toHaveBeenCalledWith({ url: visited.url });
    controller.dispose();
  });

  it("submits long valid input while skipping the smaller history query bound", async () => {
    const { controller, api, commands } = fixture(null);
    controller.focus();
    await settle();
    const query = "design ".repeat(100);
    controller.change(query);
    expect(controller.read().error).toBeNull();
    expect(controller.read().options[0].kind).toBe("search");
    expect(api.query).toHaveBeenCalledTimes(1);
    controller.key("Enter");
    expect(commands.navigate).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
