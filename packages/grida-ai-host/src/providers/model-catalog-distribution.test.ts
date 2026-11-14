// GRIDA-GG: gateway — catalogue distribution, see docs/wg/platform/hosted-ai.md
/**
 * The end-to-end capability, not the store in isolation: a media model added
 * or withdrawn on the server must reach a host whose BUNDLED catalogue
 * predates it, without a release.
 *
 * `@grida/ai`'s model-catalog tests cover the store's own failure modes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog as models } from "@grida/ai/catalogue";
import { ModelCatalogStore } from "./model-catalog";
import { ImageModelUnavailableError, resolveImageModel } from "./resolve-image";
import { VideoModelUnavailableError, resolveVideoModel } from "./resolve-video";
import type { SecretsStore } from "@grida/daemon/server";

// A spy restored only on the happy path stays live for the REST of the file
// if an assertion throws — silencing warnings a later test may depend on.
afterEach(() => {
  vi.restoreAllMocks();
});

const BASE_URL = "https://grida.test";

function serve(body: () => unknown): typeof fetch {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body()), { status: 200 })
  );
}

/** A secrets store holding a key for exactly one provider. */
function keyFor(provider: string): SecretsStore {
  return {
    _getKey: async (id: string) => (id === provider ? "test-key" : undefined),
  } as unknown as SecretsStore;
}

// openrouter is the image provider that carries `references` bindings.
const fakeImageKey = () => keyFor("openrouter");
const fakeVideoKey = () => keyFor("vercel");

/** Media models no bundled catalogue has ever carried. */
const NEW_IMAGE = "acme/published-image";
const NEW_VIDEO = "acme/published-video";

/** The seed's media, with one added model each and the rest intact. */
function publishedMedia(): models.snapshot.Snapshot {
  const seeded = models.snapshot.seed({ version: "media" });
  const image = { ...seeded.image!.models };
  const video = { ...seeded.video!.models };
  image[NEW_IMAGE] = {
    ...image["openai/gpt-image-2"]!,
    id: NEW_IMAGE,
    label: "Published Image",
  };
  video[NEW_VIDEO] = {
    ...video["google/veo-3.1"]!,
    id: NEW_VIDEO,
    label: "Published Video",
  };
  return {
    ...seeded,
    image: { models: image },
    video: { models: video },
  };
}

async function mediaStore(): Promise<ModelCatalogStore> {
  const store = new ModelCatalogStore({
    base_url: BASE_URL,
    fetch: serve(() => publishedMedia()),
  });
  expect(await store.refresh("boot")).toBe(true);
  return store;
}

describe("an image model published after this binary shipped", () => {
  it("is unresolvable on the bundled catalogue", async () => {
    await expect(
      resolveImageModel({ secrets: fakeImageKey() }, NEW_IMAGE)
    ).rejects.toThrow(ImageModelUnavailableError);
  });

  it("resolves once the published catalogue is applied", async () => {
    const store = await mediaStore();
    const resolved = await resolveImageModel(
      { secrets: fakeImageKey(), catalog: store },
      NEW_IMAGE
    );
    expect(resolved.model_id).toBe(NEW_IMAGE);
    expect(resolved.provider_id).toBe("openrouter");
    store.dispose();
  });

  it("resolves on its FIRST use, by refreshing on the miss", async () => {
    // The renderer builds the media tool's model list from its own
    // deploy-fresh catalogue, so the model the agent was just handed can
    // postdate this host's boot fetch. Text self-heals at the run gate;
    // media has to self-heal here or the first generation 400s.
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(publishedMedia()), {
          status: 200,
        })
    );
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: fetchImpl,
    });
    // Deliberately NOT pre-fetched.
    expect(store.view().image.cardById(NEW_IMAGE)).toBeUndefined();

    const resolved = await resolveImageModel(
      { secrets: fakeImageKey(), catalog: store },
      NEW_IMAGE
    );
    expect(resolved.model_id).toBe(NEW_IMAGE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("keeps image-to-image routing across the wire", async () => {
    // `binding.references` is the field whose loss is silent: i2i would
    // simply stop being offered, with no error anywhere.
    const store = await mediaStore();
    const resolved = await resolveImageModel(
      { secrets: fakeImageKey(), catalog: store },
      NEW_IMAGE,
      { references: true }
    );
    expect(resolved.references_max).toBe(16);
    store.dispose();
  });
});

describe("a video model published after this binary shipped", () => {
  it("is unresolvable on the bundled catalogue", async () => {
    await expect(
      resolveVideoModel({ secrets: fakeVideoKey() }, NEW_VIDEO)
    ).rejects.toThrow(VideoModelUnavailableError);
  });

  it("resolves on its FIRST use, by refreshing on the miss", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(publishedMedia()), {
          status: 200,
        })
    );
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: fetchImpl,
    });
    expect(store.view().video.cardById(NEW_VIDEO)).toBeUndefined();

    const resolved = await resolveVideoModel(
      { secrets: fakeVideoKey(), catalog: store },
      NEW_VIDEO
    );
    expect(resolved.model_id).toBe(NEW_VIDEO);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("resolves once the published catalogue is applied", async () => {
    const store = await mediaStore();
    const resolved = await resolveVideoModel(
      { secrets: fakeVideoKey(), catalog: store },
      NEW_VIDEO
    );
    expect(resolved.model_id).toBe(NEW_VIDEO);
    // The provider-specific call id survived the wire.
    expect(resolved.binding_id).toBe("google/veo-3.1-generate-001");
    store.dispose();
  });
});

describe("a media model withdrawn from the published catalogue", () => {
  it("stops resolving — removal is the kill switch for media too", async () => {
    const seeded = models.snapshot.seed();
    const image = { ...seeded.image!.models };
    delete image["openai/gpt-image-2"];
    const store = new ModelCatalogStore({
      base_url: BASE_URL,
      fetch: serve(() => ({ ...seeded, image: { models: image } })),
    });
    await store.refresh("boot");
    await expect(
      resolveImageModel(
        { secrets: fakeImageKey(), catalog: store },
        "openai/gpt-image-2"
      )
    ).rejects.toThrow(ImageModelUnavailableError);
    store.dispose();
  });
});
