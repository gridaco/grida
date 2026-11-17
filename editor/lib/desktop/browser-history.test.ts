import { describe, expect, it, vi } from "vitest";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserHistory } from "./browser-history";

const alpha = { url: "https://alpha.test/", title: "Alpha", lastVisitedAt: 2 };
const beta = { url: "https://beta.test/", title: "Beta", lastVisitedAt: 1 };
const snapshot = (
  revision: number,
  entries = [alpha, beta]
): DesktopBrowser.History.Snapshot => ({ version: 1, revision, entries });
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(limit = 8) {
  const listeners = new Set<(change: DesktopBrowser.History.Change) => void>();
  const order: string[] = [];
  const api: DesktopBrowser.History.Bridge = {
    version: 1,
    query: vi.fn<DesktopBrowser.History.Bridge["query"]>(async ({ query }) => {
      order.push("query");
      return snapshot(
        1,
        [alpha, beta].filter((entry) =>
          `${entry.url} ${entry.title}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        )
      );
    }),
    remove: vi.fn<DesktopBrowser.History.Bridge["remove"]>(async () => {}),
    subscribe: (listener) => {
      order.push("subscribe");
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const controller = new BrowserHistory.Controller(() => api, limit);
  return { api, controller, listeners, order };
}

describe("BrowserHistory.Controller", () => {
  it("subscribes before bounded local reads and supports the Settings limit", async () => {
    const { controller, api, order } = fixture(100);
    await controller.refresh();
    expect(order).toEqual(["subscribe", "query"]);
    expect(api.query).toHaveBeenCalledWith({ query: "", limit: 100 });
    expect(controller.read().entries).toEqual([alpha, beta]);
    controller.setQuery("Beta");
    await settle();
    expect(controller.read()).toMatchObject({
      query: "Beta",
      entries: [beta],
      loading: false,
      error: null,
    });
    controller.dispose();
  });

  it("ignores older query results and invalidated snapshots after a global clear", async () => {
    const { controller, api, listeners } = fixture();
    const pending: ((result: DesktopBrowser.History.Snapshot) => void)[] = [];
    api.query = () =>
      new Promise((resolve) => {
        pending.push(resolve);
      });
    const first = controller.refresh();
    controller.setQuery("Beta");
    pending[1](snapshot(1, [beta]));
    await settle();
    pending[0](snapshot(0, [alpha]));
    await first;
    expect(controller.read().entries).toEqual([beta]);
    for (const listener of listeners) listener({ revision: 2 });
    pending[2](snapshot(2, []));
    await settle();
    expect(controller.read().entries).toEqual([]);
    controller.dispose();
  });

  it("rejects snapshots below an already observed collection revision", async () => {
    const { controller, api, listeners } = fixture();
    await controller.refresh();
    api.query = async () => snapshot(1, [alpha]);
    for (const listener of listeners) listener({ revision: 4 });
    await settle();
    expect(controller.read().entries).toEqual([]);
    controller.cancel();
    await controller.refresh();
    expect(controller.read().entries).toEqual([]);
    controller.dispose();
  });

  it("deduplicates exact-URL removal and refreshes without deleting another URL", async () => {
    const { controller, api } = fixture();
    await controller.refresh();
    let finish!: () => void;
    const remove = vi.fn<DesktopBrowser.History.Bridge["remove"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    api.remove = remove;
    const deleting = controller.remove(alpha.url);
    await controller.remove(alpha.url);
    expect(controller.read().removing.has(alpha.url)).toBe(true);
    expect(remove.mock.calls).toEqual([[{ url: alpha.url }]]);
    api.query = async () => snapshot(2, [beta]);
    finish();
    await deleting;
    expect(controller.read().entries).toEqual([beta]);
    expect(controller.read().removing.size).toBe(0);
    await controller.remove("https://ALPHA.test");
    expect(remove).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("cancels observations and never lets a late removal unlock a newer one", async () => {
    const { controller, api } = fixture();
    const finish: (() => void)[] = [];
    api.remove = () =>
      new Promise((resolve) => {
        finish.push(resolve);
      });
    const old = controller.remove(alpha.url);
    controller.cancel();
    const current = controller.remove(alpha.url);
    finish[0]();
    await old;
    expect(controller.read().removing.has(alpha.url)).toBe(true);
    finish[1]();
    await current;
    expect(controller.read().removing.size).toBe(0);
    controller.dispose();
  });

  it("keeps optional-host, malformed and query failure handling local", async () => {
    const missing = new BrowserHistory.Controller(() => undefined);
    await missing.refresh();
    expect(missing.read().supported).toBe(false);
    missing.dispose();
    const { controller, api } = fixture();
    api.query = async () => {
      throw new Error("private history path");
    };
    await controller.refresh();
    expect(controller.read().error).toBe(
      "Couldn’t load browser history. Try again."
    );
    api.query = async () => ({
      version: 1,
      revision: 0,
      entries: [{ ...alpha, url: "file:///secret" }],
    });
    await controller.refresh();
    expect(controller.read().entries).toEqual([]);
    controller.setQuery("x".repeat(513));
    expect(controller.read().error).toBe("Enter a shorter history search.");
    controller.dispose();
  });

  it("unsubscribes and ignores delayed reads after cancellation or disposal", async () => {
    const { controller, api, listeners } = fixture();
    let finish!: (result: DesktopBrowser.History.Snapshot) => void;
    api.query = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const read = controller.refresh();
    controller.cancel();
    expect(listeners.size).toBe(0);
    finish(snapshot(1));
    await read;
    expect(controller.read().entries).toEqual([]);
    controller.dispose();
    await controller.refresh();
    expect(listeners.size).toBe(0);
  });
});
