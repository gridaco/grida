import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogFixture } from "./catalog-fixture";
import { ModelCatalogStore, catalogViewOnMiss } from "./model-catalog";

const stores: ModelCatalogStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function view(revision: string) {
  return Object.freeze({ ...CatalogFixture.view(), revision });
}
function setup(
  options: {
    fetch?: typeof fetch;
    parse?: (value: unknown) => ReturnType<typeof view> | null;
    on_change?: () => void;
    interval?: number | null;
    now?: () => number;
    url?: string;
  } = {}
) {
  const seed = view("seed");
  const parse =
    options.parse ??
    ((input: unknown) => (typeof input === "string" ? view(input) : null));
  const fetch =
    options.fetch ??
    vi.fn<typeof globalThis.fetch>(async () => Response.json("remote"));
  const store = new ModelCatalogStore({
    seed,
    source: {
      url: options.url ?? "https://catalog.example.invalid/catalog.json",
      fetch,
      parse,
    },
    on_change: options.on_change,
    refresh_interval_ms: options.interval,
    now: options.now,
  });
  stores.push(store);
  return { store, seed, fetch };
}

describe("host-owned catalog source", () => {
  it("keeps the supplied seed and its additional typed fields without network work", () => {
    const { store, seed, fetch } = setup();
    expect(store.view()).toBe(seed);
    expect(store.view().revision).toBe("seed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pins a seed when no source is supplied", async () => {
    const seed = view("pinned");
    const store = new ModelCatalogStore({ seed });
    stores.push(store);
    store.start();
    expect(store.refreshable).toBe(false);
    expect(await store.refresh("boot")).toBe(false);
    expect(store.view()).toBe(seed);
  });
  it.each(["invalid", "file:///catalog", "ftp://example.invalid/catalog"])(
    "refuses source URL %s",
    async (url) => {
      const { store, fetch } = setup({ url });
      expect(store.refreshable).toBe(false);
      expect(await store.refresh("boot")).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it("uses the exact host URL and delegates decoded data to its parser", async () => {
    const parsed = view("parsed");
    const parse = vi.fn<(input: unknown) => ReturnType<typeof view> | null>(
      () => parsed
    );
    const { store, fetch } = setup({ parse });
    expect(await store.refresh("boot")).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://catalog.example.invalid/catalog.json",
      expect.objectContaining({
        method: "GET",
        headers: { accept: "application/json" },
      })
    );
    expect(parse).toHaveBeenCalledWith("remote");
    expect(store.view()).toBe(parsed);
  });
  it.each(["rejected", "throws"])(
    "keeps the last good view when the host parser %s",
    async (kind) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const parse = vi.fn<(input: unknown) => ReturnType<typeof view> | null>(
        () => {
          if (kind === "throws") throw new Error("host detail");
          return null;
        }
      );
      parse.mockReturnValueOnce(view("good"));
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json("second")
      );
      fetch.mockResolvedValueOnce(Response.json("first"));
      const { store } = setup({ fetch, parse });
      await store.refresh("boot");
      const good = store.view();
      expect(await store.refresh("interval")).toBe(false);
      expect(store.view()).toBe(good);
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("host detail")
      );
    }
  );
  it("skips identical wire values and notifies only after applying a replacement", async () => {
    const parse = vi.fn<(input: unknown) => ReturnType<typeof view> | null>(
      () => view("good")
    );
    const on_change = vi.fn<() => void>();
    const { store } = setup({ parse, on_change });
    await store.refresh("boot");
    await store.refresh("interval");
    expect(parse).toHaveBeenCalledTimes(1);
    expect(on_change).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "status", "json", "declared-size", "streamed-size"])(
    "fails safely on %s",
    async (kind) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        if (kind === "network") throw new Error("private transport detail");
        if (kind === "status") return new Response("no", { status: 503 });
        if (kind === "json") return new Response("{");
        if (kind === "declared-size")
          return new Response("small", {
            headers: { "content-length": "1000001" },
          });
        return new Response("x".repeat(1_000_001));
      });
      const { store, seed } = setup({ fetch });
      expect(await store.refresh("boot")).toBe(false);
      expect(store.view()).toBe(seed);
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("private transport detail")
      );
    }
  );
  it("shares one in-flight refresh and rate-limits subsequent lookup misses", async () => {
    let resolve!: (response: Response) => void;
    let now = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { store } = setup({ fetch, now: () => now });
    const a = store.refreshOnMiss(),
      b = store.refreshOnMiss();
    resolve(Response.json("new"));
    await Promise.all([a, b]);
    await store.refreshOnMiss();
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 30_001;
    const c = store.refreshOnMiss();
    resolve(Response.json("newer"));
    await c;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("returns one coherent post-refresh view after a miss", async () => {
    const { store } = setup();
    const result = await catalogViewOnMiss(
      store,
      (current) => current.revision === "seed"
    );
    expect(result).toBe(store.view());
    expect(result.revision).toBe("remote");
  });
  it("starts once, refreshes periodically and stops on disposal", async () => {
    vi.useFakeTimers();
    const { store, fetch } = setup({ interval: 100 });
    store.start();
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    store.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await store.refresh("boot")).toBe(false);
  });
  it("does not apply a late result after disposal", async () => {
    let resolve!: (response: Response) => void;
    const { store, seed } = setup({
      fetch: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const pending = store.refresh("boot");
    store.dispose();
    resolve(Response.json("late"));
    expect(await pending).toBe(false);
    expect(store.view()).toBe(seed);
  });
});
