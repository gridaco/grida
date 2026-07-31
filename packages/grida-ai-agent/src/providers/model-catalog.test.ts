// GRIDA-GG: gateway — catalogue distribution, see docs/wg/platform/hosted-ai.md
/**
 * The store's contract: it must NEVER stop answering. Every failure mode
 * degrades to the last good catalogue (the seed at worst), and no failure
 * escapes to a caller.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import { CATALOG_PATH, ModelCatalogStore } from "./model-catalog";

const BASE_URL = "https://grida.test";

function spec(
  id: string,
  over: Partial<models.text.ModelSpec> = {}
): models.text.ModelSpec {
  return {
    id,
    label: `Label ${id}`,
    multimodal: false,
    imageInputMimes: [],
    tool_call: true,
    contextWindow: 123_456,
    outputLimit: 8_000,
    cost: { input: 1, output: 2 },
    ...over,
  };
}

/** A published catalogue containing exactly `ids`, all tiers on the first. */
function published(ids: string[], version = "v1"): models.snapshot.Snapshot {
  const catalog: Record<string, models.text.ModelSpec> = {};
  for (const id of ids) catalog[id] = spec(id);
  const first = ids[0]!;
  return {
    schema: models.snapshot.SCHEMA,
    version,
    text: {
      catalog,
      tier_model_ids: { nano: first, mini: first, pro: first, max: first },
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch stub that serves `bodies` in order, repeating the last. */
function serving(...bodies: unknown[]) {
  return vi.fn<typeof fetch>(async () => {
    const next = bodies.length > 1 ? bodies.shift() : bodies[0];
    return jsonResponse(next);
  });
}

/** A fetch stub built from a bare handler. */
function fetching(handler: () => Promise<Response>) {
  return vi.fn<typeof fetch>(handler);
}

const stores: ModelCatalogStore[] = [];
function make(
  options: ConstructorParameters<typeof ModelCatalogStore>[0] = {}
): ModelCatalogStore {
  const store = new ModelCatalogStore(options);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.restoreAllMocks();
});

describe("ModelCatalogStore — before any fetch", () => {
  it("answers from the bundled catalogue immediately", () => {
    const view = make({ base_url: BASE_URL, fetch: serving() }).view();
    expect(view.catalog).toEqual(models.text.catalog);
    expect(view.modelSpecById("openai/gpt-5.6-luna")).toBeDefined();
  });

  it("is not refreshable without a base url", async () => {
    const fetchImpl = serving(published(["acme/one"]));
    const store = make({ fetch: fetchImpl });
    expect(store.refreshable).toBe(false);
    store.start();
    expect(await store.refresh("boot")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is not refreshable on a non-http base url", () => {
    expect(
      make({ base_url: "file:///etc", fetch: serving() }).refreshable
    ).toBe(false);
    expect(make({ base_url: "not a url", fetch: serving() }).refreshable).toBe(
      false
    );
  });
});

describe("ModelCatalogStore — applying a published catalogue", () => {
  it("requests the catalogue path on the configured base url", async () => {
    const fetchImpl = serving(published(["acme/one"]));
    await make({ base_url: BASE_URL, fetch: fetchImpl }).refresh("boot");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(url).toBe(`${BASE_URL}${CATALOG_PATH}`);
    expect((init as RequestInit).method).toBe("GET");
  });

  it("resolves a model the bundled catalogue has never heard of", async () => {
    // The reason the whole mechanism exists.
    const store = make({
      base_url: BASE_URL,
      fetch: serving(published(["acme/brand-new"])),
    });
    expect(store.view().modelSpecById("acme/brand-new")).toBeUndefined();
    expect(await store.refresh("boot")).toBe(true);
    expect(store.view().modelSpecById("acme/brand-new")?.contextWindow).toBe(
      123_456
    );
  });

  it("retargets tiers", async () => {
    const store = make({
      base_url: BASE_URL,
      fetch: serving(published(["acme/one"])),
    });
    await store.refresh("boot");
    expect(store.view().tier_model_ids.nano).toBe("acme/one");
    expect(store.view().by_tier.nano.id).toBe("acme/one");
  });

  it("replaces wholesale — a withdrawn model stops resolving", async () => {
    const store = make({
      base_url: BASE_URL,
      fetch: serving(published(["acme/one"])),
    });
    await store.refresh("boot");
    // Merging would resurrect a model the publisher deliberately removed,
    // defeating the catalogue's kill switch.
    expect(store.view().modelSpecById("openai/gpt-5.6-luna")).toBeUndefined();
  });

  it("notifies on change, and only on change", async () => {
    const onChange = vi.fn<() => void>();
    const body = published(["acme/one"]);
    const store = make({
      base_url: BASE_URL,
      fetch: serving(body),
      on_change: onChange,
    });
    expect(await store.refresh("boot")).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Byte-identical body: no swap, no notification.
    expect(await store.refresh("interval")).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies a later, different catalogue", async () => {
    const store = make({
      base_url: BASE_URL,
      fetch: serving(
        published(["acme/one"], "v1"),
        published(["acme/two"], "v2")
      ),
    });
    await store.refresh("boot");
    expect(store.view().modelSpecById("acme/one")).toBeDefined();
    expect(await store.refresh("interval")).toBe(true);
    expect(store.view().modelSpecById("acme/one")).toBeUndefined();
    expect(store.view().modelSpecById("acme/two")).toBeDefined();
  });
});

describe("ModelCatalogStore — failure is never fatal", () => {
  const warn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it.each([
    [
      "a network error",
      fetching(async () => {
        throw new Error("offline");
      }),
    ],
    ["a 404", fetching(async () => new Response("", { status: 404 }))],
    ["a 500", fetching(async () => new Response("", { status: 500 }))],
    [
      "a non-JSON body",
      fetching(async () => new Response("<!doctype html>", { status: 200 })),
    ],
  ])("keeps the bundled catalogue on %s", async (_label, fetchImpl) => {
    warn();
    const store = make({ base_url: BASE_URL, fetch: fetchImpl });
    await expect(store.refresh("boot")).resolves.toBe(false);
    expect(store.view().catalog).toEqual(models.text.catalog);
  });

  it.each([
    ["a wrong schema major", { ...published(["acme/one"]), schema: 2 }],
    [
      "a dangling tier id",
      {
        ...published(["acme/one"]),
        text: {
          catalog: { "acme/one": spec("acme/one") },
          tier_model_ids: {
            nano: "acme/absent",
            mini: "acme/one",
            pro: "acme/one",
            max: "acme/one",
          },
        },
      },
    ],
    [
      "an empty catalogue",
      {
        schema: 1,
        version: "v",
        text: { catalog: {}, tier_model_ids: {} },
      },
    ],
  ])("never half-applies %s", async (_label, body) => {
    warn();
    const store = make({ base_url: BASE_URL, fetch: serving(body) });
    expect(await store.refresh("boot")).toBe(false);
    expect(store.view().catalog).toEqual(models.text.catalog);
  });

  it("keeps the LAST GOOD catalogue when a later fetch fails", async () => {
    warn();
    const good = published(["acme/one"]);
    let fail = false;
    const store = make({
      base_url: BASE_URL,
      fetch: fetching(async () => {
        if (fail) throw new Error("offline");
        return jsonResponse(good);
      }),
    });
    await store.refresh("boot");
    fail = true;
    expect(await store.refresh("interval")).toBe(false);
    // Not the seed — the published catalogue it already had.
    expect(store.view().modelSpecById("acme/one")).toBeDefined();
  });

  it("rejects an oversized body", async () => {
    warn();
    const store = make({
      base_url: BASE_URL,
      fetch: fetching(
        async () => new Response("x".repeat(1_000_001), { status: 200 })
      ),
    });
    expect(await store.refresh("boot")).toBe(false);
  });

  it("warns once per failure kind, not once per attempt", async () => {
    const spy = warn();
    const store = make({
      base_url: BASE_URL,
      fetch: fetching(async () => {
        throw new Error("offline");
      }),
    });
    await store.refresh("boot");
    await store.refresh("boot");
    await store.refresh("boot");
    expect(
      spy.mock.calls.filter((c) => String(c[0]).includes("catalogue"))
    ).toHaveLength(1);
  });
});

describe("ModelCatalogStore — single-flight and rate limiting", () => {
  it("collapses concurrent refreshes into one request", async () => {
    let resolve!: (r: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>(
      () => new Promise<Response>((r) => (resolve = r))
    );
    const store = make({ base_url: BASE_URL, fetch: fetchImpl });

    const all = Promise.all([
      store.refresh("boot"),
      store.refresh("interval"),
      store.refresh("gate-miss"),
    ]);
    resolve(jsonResponse(published(["acme/one"])));
    expect(await all).toEqual([true, true, true]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gate-miss self-heals: the model resolves after the awaited refresh", async () => {
    const store = make({
      base_url: BASE_URL,
      fetch: serving(published(["acme/brand-new"])),
    });
    await store.refreshOnMiss("acme/brand-new");
    expect(store.view().modelSpecById("acme/brand-new")).toBeDefined();
  });

  it("skips the network when the id is already known", async () => {
    const fetchImpl = serving(published(["acme/one"]));
    const store = make({ base_url: BASE_URL, fetch: fetchImpl });
    await store.refreshOnMiss("openai/gpt-5.6-luna");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rate-limits repeated misses on a genuinely unknown id", async () => {
    let clock = 0;
    const fetchImpl = serving(published(["acme/one"]));
    const store = make({
      base_url: BASE_URL,
      fetch: fetchImpl,
      now: () => clock,
    });
    await store.refreshOnMiss("acme/never");
    await store.refreshOnMiss("acme/never");
    await store.refreshOnMiss("acme/never");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 30_000;
    await store.refreshOnMiss("acme/never");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("ModelCatalogStore — pinned by the host", () => {
  it("serves a supplied catalogue and never fetches", async () => {
    const fetchImpl = serving(published(["acme/remote"]));
    const store = make({
      base_url: BASE_URL,
      fetch: fetchImpl,
      snapshot: published(["acme/pinned"]),
    });
    store.start();
    expect(store.refreshable).toBe(false);
    expect(await store.refresh("boot")).toBe(false);
    await store.refreshOnMiss("acme/remote");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.view().modelSpecById("acme/pinned")).toBeDefined();
    expect(store.view().modelSpecById("acme/remote")).toBeUndefined();
  });
});

describe("ModelCatalogStore — lifecycle", () => {
  it("start() fetches once and is idempotent", async () => {
    const fetchImpl = serving(published(["acme/one"]));
    const store = make({
      base_url: BASE_URL,
      fetch: fetchImpl,
      refresh_interval_ms: null,
    });
    store.start();
    store.start();
    await vi.waitFor(() =>
      expect(store.view().modelSpecById("acme/one")).toBeDefined()
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("start() never throws when the fetch fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = make({
      base_url: BASE_URL,
      fetch: fetching(async () => {
        throw new Error("offline");
      }),
      refresh_interval_ms: null,
    });
    expect(() => store.start()).not.toThrow();
    await vi.waitFor(() =>
      expect(store.view().catalog).toEqual(models.text.catalog)
    );
  });

  it("refreshes on the interval", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = serving(
        published(["acme/one"], "v1"),
        published(["acme/two"], "v2")
      );
      const store = make({
        base_url: BASE_URL,
        fetch: fetchImpl,
        refresh_interval_ms: 1_000,
      });
      store.start();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() stops the interval and further refreshes", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = serving(published(["acme/one"]));
      const store = make({
        base_url: BASE_URL,
        fetch: fetchImpl,
        refresh_interval_ms: 1_000,
      });
      store.start();
      store.dispose();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await store.refresh("interval")).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1); // the boot fetch only
    } finally {
      vi.useRealTimers();
    }
  });
});
