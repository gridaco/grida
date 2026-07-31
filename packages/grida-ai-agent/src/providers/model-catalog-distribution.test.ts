// GRIDA-GG: gateway — catalogue distribution, see docs/wg/platform/hosted-ai.md
/**
 * The end-to-end capability, not the store in isolation: a model added or
 * a tier retargeted on the server must reach a host whose BUNDLED
 * catalogue predates it, without a release.
 *
 * Every test here would fail against the pre-store code — that is the
 * point. `model-catalog.test.ts` covers the store's own failure modes.
 */
import { describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import { ModelCatalogStore } from "./model-catalog";
import { resolveProvider, type ResolveDeps } from "./index";
import { GridaGatewaySessionStore } from "./gg-session";
import { parseRunBody, type ParseRunBodyDeps } from "../runtime/run-input";
import { baseCostUsdFromMessageUsage } from "../session/cost";
import { resolveModelLimits } from "../session/compaction";
import type { SecretsStore } from "@grida/daemon/server";
import type { ChatModel } from "../session/rows";

/** A model no bundled catalogue has ever carried. */
const NEW_MODEL = "acme/published-after-release";

const BASE_URL = "https://grida.test";

function spec(id: string): models.text.ModelSpec {
  return {
    id,
    label: "Published After Release",
    multimodal: false,
    imageInputMimes: [],
    tool_call: true,
    contextWindow: 64_000,
    outputLimit: 4_000,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  };
}

/**
 * A catalogue that keeps the real models AND adds `NEW_MODEL`, with
 * `nano` retargeted onto it — the two changes a release used to be
 * required for.
 */
function publishedCatalogue(): models.snapshot.Snapshot {
  const seeded = models.snapshot.seed({ version: "published" });
  return {
    ...seeded,
    text: {
      catalog: { ...seeded.text.catalog, [NEW_MODEL]: spec(NEW_MODEL) },
      tier_model_ids: { ...seeded.text.tier_model_ids, nano: NEW_MODEL },
    },
  };
}

/** A store that has already fetched the published catalogue. */
async function fetchedStore(): Promise<ModelCatalogStore> {
  const store = new ModelCatalogStore({
    base_url: BASE_URL,
    fetch: (async () =>
      new Response(JSON.stringify(publishedCatalogue()), {
        status: 200,
      })) as unknown as typeof globalThis.fetch,
  });
  expect(await store.refresh("boot")).toBe(true);
  return store;
}

const noSecrets = {
  _getKey: async () => undefined,
} as unknown as SecretsStore;

/** A signed-in hosted session, so the `gg` provider resolves. */
function liveGgSession(): GridaGatewaySessionStore {
  const session = new GridaGatewaySessionStore();
  session.set({ access_token: "tok", expires_at: Date.now() + 900_000 });
  return session;
}

function runDeps(catalog?: ModelCatalogStore): ParseRunBodyDeps {
  return {
    workspace_registry: {
      findById: async () => null,
    } as unknown as ParseRunBodyDeps["workspace_registry"],
    catalog,
  };
}

async function runGate(
  modelId: string,
  deps: ParseRunBodyDeps
): Promise<Response | { model_id?: string }> {
  return parseRunBody(
    {
      messages: [{ role: "user", content: "hi" }],
      model_id: modelId,
    },
    deps
  );
}

describe("a model published after this binary shipped", () => {
  it("is rejected by the run gate on the bundled catalogue", async () => {
    // The status quo the mechanism exists to fix.
    const result = await runGate(NEW_MODEL, runDeps());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });

  it("is admitted once the published catalogue is applied", async () => {
    const result = await runGate(NEW_MODEL, runDeps(await fetchedStore()));
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { model_id?: string }).model_id).toBe(NEW_MODEL);
  });

  it("is admitted on its FIRST run, by refreshing on the gate miss", async () => {
    // The real sequence: the host booted before the model was published,
    // so its catalogue is stale at the moment the request arrives. Without
    // the in-request refresh the user watches their own picker's model get
    // rejected as unknown.
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(publishedCatalogue()), { status: 200 })
    ) as unknown as typeof globalThis.fetch;
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: fetchImpl,
    });
    // Deliberately NOT pre-fetched.
    expect(store.view().modelSpecById(NEW_MODEL)).toBeUndefined();

    const result = await runGate(NEW_MODEL, runDeps(store));
    expect(result).not.toBeInstanceOf(Response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("still 400s when the published catalogue does not have it either", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: (async () =>
        new Response(JSON.stringify(models.snapshot.seed()), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
    });
    const result = await runGate("acme/never-existed", runDeps(store));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    store.dispose();
    vi.restoreAllMocks();
  });

  it("resolves through the hosted provider tuple gate", async () => {
    const store = await fetchedStore();
    const result = await parseRunBody(
      {
        messages: [{ role: "user", content: "hi" }],
        model_id: NEW_MODEL,
        provider_id: "gg",
      },
      runDeps(store)
    );
    expect(result).not.toBeInstanceOf(Response);
    store.dispose();
  });

  it("is priced at its real rates instead of costing nothing", async () => {
    const store = await fetchedStore();
    const usage = { input: 1_000_000, output: 1_000_000 };
    const costModel: ChatModel = { provider_id: "gg", model_id: NEW_MODEL };

    // Bundled: unknown id ⇒ no estimate at all.
    expect(baseCostUsdFromMessageUsage(costModel, usage)).toBeUndefined();

    // Published: the model's own rate card.
    expect(
      baseCostUsdFromMessageUsage(costModel, usage, store.view())
    ).toBeCloseTo(3 + 15, 10);
    store.dispose();
  });

  it("is compacted against its real window, not the frontier default", async () => {
    const store = await fetchedStore();
    const model: ChatModel = { provider_id: "gg", model_id: NEW_MODEL };

    // Bundled: unknown id falls through to the pro tier's frontier-sized
    // window — a 64k model treated as 1M never compacts and dies on
    // overflow. This is the bug the published window prevents.
    expect(resolveModelLimits(model).context_window).toBe(
      models.text.byTier.pro.contextWindow
    );
    expect(
      resolveModelLimits(model, undefined, store.view()).context_window
    ).toBe(64_000);
    store.dispose();
  });
});

describe("a tier retargeted after this binary shipped", () => {
  it("moves the hosted factory's model for that tier", async () => {
    const store = await fetchedStore();
    const deps: ResolveDeps = {
      secrets: noSecrets,
      gg: liveGgSession(),
      gg_base_url: BASE_URL,
      catalog: store,
    };
    const resolved = await resolveProvider(deps, {});
    expect(resolved.kind).toBe("gg");
    // `nano` is what every background titler/compactor asks for.
    expect(
      (resolved.model_factory("nano") as { modelId: string }).modelId
    ).toBe(NEW_MODEL);
    // A tier the publisher left alone still resolves to the catalogue's.
    expect((resolved.model_factory("pro") as { modelId: string }).modelId).toBe(
      models.snapshot.view().tier_model_ids.pro
    );
    store.dispose();
  });

  it("takes effect on a factory built BEFORE the refresh", async () => {
    // Background subagents resolve their tier long after the provider was
    // chosen. A factory that captured the tier table at build time would
    // keep sending the old model for the rest of the session.
    let body: unknown = models.snapshot.seed();
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: (async () =>
        new Response(JSON.stringify(body), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
    });
    await store.refresh("boot");

    const resolved = await resolveProvider(
      {
        secrets: noSecrets,
        gg: liveGgSession(),
        gg_base_url: BASE_URL,
        catalog: store,
      },
      {}
    );
    expect(
      (resolved.model_factory("nano") as { modelId: string }).modelId
    ).not.toBe(NEW_MODEL);

    body = publishedCatalogue();
    expect(await store.refresh("interval")).toBe(true);
    expect(
      (resolved.model_factory("nano") as { modelId: string }).modelId
    ).toBe(NEW_MODEL);
    store.dispose();
  });
});

describe("a model withdrawn from the published catalogue", () => {
  /** The real catalogue minus `luna`, tiers moved off it. */
  function withoutLuna(): models.snapshot.Snapshot {
    const seeded = models.snapshot.seed({ version: "withdrawn" });
    const catalog = { ...seeded.text.catalog };
    delete catalog["openai/gpt-5.6-luna"];
    const fallback = seeded.text.tier_model_ids.pro;
    return {
      ...seeded,
      text: {
        catalog,
        tier_model_ids: {
          nano: fallback,
          mini: fallback,
          pro: fallback,
          max: seeded.text.tier_model_ids.max,
        },
      },
    };
  }

  it("stops being admitted by the run gate", async () => {
    // Removal from the catalogue is the kill switch. A merge with the
    // bundled seed would defeat it on every installed client.
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: (async () =>
        new Response(JSON.stringify(withoutLuna()), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
    });
    await store.refresh("boot");

    const result = await runGate("openai/gpt-5.6-luna", runDeps(store));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
    store.dispose();
  });

  it("stays pinned to the ChatGPT subscription when it is subscription-servable", async () => {
    // The `!isCatalogModel` subtraction in the resolver: an id the
    // subscription serves but the catalogue no longer carries must NOT
    // silently fall through to another provider. Withdrawing Luna from
    // the catalogue flips it into that class — by design.
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: (async () =>
        new Response(JSON.stringify(withoutLuna()), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
    });
    await store.refresh("boot");

    await expect(
      resolveProvider(
        { secrets: noSecrets, catalog: store },
        { model_id: "openai/gpt-5.6-luna" }
      )
    ).rejects.toMatchObject({ provider_id: "chatgpt" });
    store.dispose();
  });
});
