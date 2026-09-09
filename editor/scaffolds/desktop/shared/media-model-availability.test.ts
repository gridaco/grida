import { describe, expect, it, vi } from "vitest";
import { MediaModelAvailability } from "./media-model-availability";
import { catalog as models } from "@app/ai-catalog";
import type { DesktopBridge } from "@/lib/desktop/bridge";

const catalogue = Object.freeze([
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
]);

describe("MediaModelAvailability.select", () => {
  const legacy = { id: "legacy", deprecated: true };
  const active = { id: "active" };
  const recommended = { id: "recommended" };
  const choices = [legacy, active, recommended];

  it("uses the service recommendation regardless of incidental input order", () => {
    expect(
      MediaModelAvailability.select(choices, undefined, "recommended")
    ).toBe(recommended);
  });

  it("preserves an explicit legacy choice over an active recommendation", () => {
    expect(
      MediaModelAvailability.select(choices, "legacy", "recommended")
    ).toBe(legacy);
  });

  it("cannot choose a recommendation outside the caller's allowed models", () => {
    expect(
      MediaModelAvailability.select([active], "legacy", "recommended")
    ).toBe(active);
    expect(
      MediaModelAvailability.select([], "legacy", "recommended")
    ).toBeUndefined();
  });

  it("prefers an active fallback while keeping a legacy-only route usable", () => {
    expect(MediaModelAvailability.select(choices)).toBe(active);
    expect(MediaModelAvailability.select([legacy])).toBe(legacy);
  });
});

describe("MediaModelAvailability.filter", () => {
  it("uses the full catalogue only when no restriction was provided", () => {
    expect(MediaModelAvailability.filter(catalogue)).toBe(catalogue);
  });

  it("keeps an explicit empty restriction empty", () => {
    expect(MediaModelAvailability.filter(catalogue, [])).toEqual([]);
  });

  it("returns an honest empty projection when no requested id exists", () => {
    expect(MediaModelAvailability.filter(catalogue, ["unknown"])).toEqual([]);
  });

  it("preserves catalogue order for the exact allowed ids", () => {
    expect(
      MediaModelAvailability.filter(catalogue, ["beta", "alpha", "beta"])
    ).toEqual(catalogue);
  });
});

describe("MediaModelAvailability.image", () => {
  const gpt2 = models.image.models["openai/gpt-image-2"]!;
  const flare: models.image.ImageModelCard = {
    ...models.image.models["openai/gpt-image-2.5-flare"]!,
    provider: "fal",
    providers: {
      fal: models.image.models["openai/gpt-image-2.5-flare"]!.providers.fal,
    },
  };
  const ready: MediaModelAvailability.ImageProviderState = {
    loaded: true,
    images: true,
    desktopVersion: "0.0.22",
    configured: ["fal"],
    hosted: false,
  };

  it("requires an actual connected binding, not just a listed card", () => {
    expect(MediaModelAvailability.image(flare, ready).available).toBe(true);
    for (const configured of [[], ["openrouter"], ["vercel"]] as const) {
      expect(
        MediaModelAvailability.image(flare, { ...ready, configured })
      ).toEqual({
        available: false,
        reason: "Connect a fal key to use this model",
      });
    }
  });

  it.each([
    "openai/gpt-image-2.5-flare",
    "openai/gpt-image-2.5-sunburst",
  ] as const)("uses the verified provider capabilities for %s", (id) => {
    const card = models.image.models[id]!;
    for (const provider of models.image.providers) {
      expect(
        MediaModelAvailability.image(card, {
          ...ready,
          configured: [provider],
        }).available
      ).toBe(true);
    }
    expect(
      MediaModelAvailability.image(
        card,
        { ...ready, configured: ["openrouter"] },
        true
      ).available
    ).toBe(false);
    expect(
      MediaModelAvailability.image(
        card,
        { ...ready, configured: [], hosted: true },
        true
      ).available
    ).toBe(true);
  });

  it("only offers hosted readiness on models with a Vercel binding", () => {
    const hosted = { ...ready, configured: [], hosted: true };
    expect(MediaModelAvailability.image(gpt2, hosted).available).toBe(true);
    expect(MediaModelAvailability.image(flare, hosted).available).toBe(false);
    expect(MediaModelAvailability.image(gpt2, hosted, true).available).toBe(
      false
    );
  });

  it("requires a verified transparent route even when an ordinary route is connected", () => {
    const ordinary = {
      ...ready,
      configured: ["openrouter", "vercel"] as const,
    };
    expect(MediaModelAvailability.image(gpt2, ordinary).available).toBe(true);
    expect(MediaModelAvailability.image(gpt2, ordinary, true)).toEqual({
      available: false,
      reason: "Connect a fal key for transparent backgrounds",
    });
    expect(
      MediaModelAvailability.image(
        gpt2,
        {
          ...ordinary,
          configured: ["openrouter", "fal"],
        },
        true
      ).available
    ).toBe(true);
  });

  it("permits hosted transparency only when the Vercel binding verifies it", () => {
    const hosted = { ...ready, configured: [], hosted: true };
    const verified: models.image.ImageModelCard = {
      ...gpt2,
      providers: {
        ...gpt2.providers,
        vercel: { ...gpt2.providers.vercel!, transparent_background: true },
      },
    };
    expect(MediaModelAvailability.image(verified, hosted, true).available).toBe(
      true
    );
    expect(
      MediaModelAvailability.image(
        verified,
        { ...hosted, desktopVersion: "0.0.21" },
        true
      ).available
    ).toBe(false);
    expect(MediaModelAvailability.image(gpt2, hosted, true).available).toBe(
      false
    );
  });

  it("does not downgrade transparent intent when the fal key disappears", () => {
    expect(MediaModelAvailability.image(flare, ready, true).available).toBe(
      true
    );
    expect(
      MediaModelAvailability.image(flare, { ...ready, configured: [] }, true)
        .available
    ).toBe(false);
  });

  it("gates background fields on the new native runtime even for older universal cards", () => {
    const old = { ...ready, desktopVersion: "0.0.21" };
    expect(MediaModelAvailability.image(gpt2, old).available).toBe(true);
    expect(MediaModelAvailability.image(gpt2, old, true)).toEqual({
      available: false,
      reason: MediaModelAvailability.imageUpdateMessage,
    });
    expect(MediaModelAvailability.image(flare, old).available).toBe(false);
  });

  it("fails closed until readiness is loaded or when the image bridge is absent", () => {
    expect(
      MediaModelAvailability.image(gpt2, { ...ready, loaded: false }).available
    ).toBe(false);
    expect(
      MediaModelAvailability.image(gpt2, { ...ready, images: false }).available
    ).toBe(false);
  });
});

describe("MediaModelAvailability.ImageProviders", () => {
  function bridge(has: (id: string) => Promise<boolean>): DesktopBridge {
    return {
      app: { version: "0.0.22" },
      images: {
        generate: vi.fn<NonNullable<DesktopBridge["images"]>["generate"]>(),
      },
      secrets: { has },
    } as unknown as DesktopBridge;
  }

  it("refreshes safe key presence and replaces stale readiness after removal", async () => {
    let connected = true;
    const has = vi.fn<(id: string) => Promise<boolean>>(
      async (id) => id === "fal" && connected
    );
    const store = new MediaModelAvailability.ImageProviders(
      bridge(has),
      async () => false
    );
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    expect(store.getSnapshot().loaded).toBe(false);
    expect((await store.refresh()).configured).toEqual(["fal"]);
    connected = false;
    expect((await store.refresh()).configured).toEqual([]);
    expect(has).toHaveBeenCalledTimes(6);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("treats failed key and hosted-session checks as unavailable", async () => {
    const store = new MediaModelAvailability.ImageProviders(
      bridge(async () => {
        throw new Error("unavailable");
      }),
      async () => {
        throw new Error("unavailable");
      }
    );
    expect(await store.refresh()).toMatchObject({
      loaded: true,
      configured: [],
      hosted: false,
    });
  });

  it("does not block a connected BYOK picker or submit on a slow hosted mint", async () => {
    let finishHosted: (value: boolean) => void = () => {};
    const hosted = new Promise<boolean>((resolve) => {
      finishHosted = resolve;
    });
    const store = new MediaModelAvailability.ImageProviders(
      bridge(async (id) => id === "fal"),
      () => hosted
    );
    const gpt2 = models.image.models["openai/gpt-image-2"]!;
    expect(await store.refresh(gpt2)).toMatchObject({
      loaded: true,
      configured: ["fal"],
      hosted: false,
    });
    expect(
      MediaModelAvailability.image(gpt2, store.getSnapshot()).available
    ).toBe(true);
    finishHosted(true);
    await vi.waitFor(() => expect(store.getSnapshot().hosted).toBe(true));
  });

  it("awaits hosted readiness for a hosted-only submit", async () => {
    const store = new MediaModelAvailability.ImageProviders(
      bridge(async () => false),
      async () => true
    );
    const gpt2 = models.image.models["openai/gpt-image-2"]!;
    expect(await store.refresh(gpt2)).toMatchObject({
      loaded: true,
      configured: [],
      hosted: true,
    });
  });

  it("awaits hosted transparency when no eligible BYOK route is connected", async () => {
    const store = new MediaModelAvailability.ImageProviders(
      bridge(async (id) => id === "openrouter"),
      async () => true
    );
    const base = models.image.models["openai/gpt-image-2"]!;
    const verified: models.image.ImageModelCard = {
      ...base,
      providers: {
        ...base.providers,
        vercel: { ...base.providers.vercel!, transparent_background: true },
      },
    };
    const refreshed = await store.refresh(verified, true);
    expect(refreshed.hosted).toBe(true);
    expect(
      MediaModelAvailability.image(verified, refreshed, true).available
    ).toBe(true);
  });

  it("does not probe or mint without an image bridge", async () => {
    const hosted = vi.fn<() => Promise<boolean>>(async () => true);
    const store = new MediaModelAvailability.ImageProviders(null, hosted);
    expect(await store.refresh()).toMatchObject({
      loaded: true,
      images: false,
      configured: [],
      hosted: false,
    });
    expect(hosted).not.toHaveBeenCalled();
  });

  it("prevents a late readiness response from resurrecting a removed key", async () => {
    let finishFirst: (value: boolean) => void = () => {};
    const firstFal = new Promise<boolean>((resolve) => {
      finishFirst = resolve;
    });
    let first = true;
    const store = new MediaModelAvailability.ImageProviders(
      bridge(async (id) => {
        if (id === "fal" && first) {
          first = false;
          return firstFal;
        }
        return false;
      }),
      async () => false
    );
    const pending = store.refresh();
    await store.refresh();
    finishFirst(true);
    expect(await pending).toMatchObject({ loaded: false, configured: [] });
    expect(store.getSnapshot().configured).toEqual([]);
  });
});

describe("MediaModelAvailability.requiresImageUpdate", () => {
  const universal = models.image.models["openai/gpt-image-2"]!;
  const falOnly = {
    id: universal.id,
    provider: "fal" as const,
    providers: { fal: universal.providers.fal },
  };

  it("keeps universal cards usable on existing clients", () => {
    expect(
      MediaModelAvailability.requiresImageUpdate(universal, "0.0.21")
    ).toBe(false);
  });

  it.each([
    "openai/gpt-image-2.5-flare",
    "openai/gpt-image-2.5-sunburst",
  ] as const)(
    "keeps %s gated even after every provider binding becomes available",
    (id) => {
      const multiProvider = { ...universal, id };
      expect(
        MediaModelAvailability.requiresImageUpdate(multiProvider, "0.0.21")
      ).toBe(true);
      expect(
        MediaModelAvailability.requiresImageUpdate(multiProvider, "0.0.22")
      ).toBe(false);
    }
  );

  it.each([undefined, "unknown", "0.0.21", "0.0.9"])(
    "blocks partial provider coverage on an unsupported client (%s)",
    (version) => {
      expect(MediaModelAvailability.requiresImageUpdate(falOnly, version)).toBe(
        true
      );
    }
  );

  it.each(["0.0.22", "0.0.22-insiders.1", "0.0.23", "0.1.0", "1.0.0"])(
    "accepts partial provider coverage on a compatible client (%s)",
    (version) => {
      expect(MediaModelAvailability.requiresImageUpdate(falOnly, version)).toBe(
        false
      );
    }
  );

  it("checks coverage instead of the model name or primary provider alone", () => {
    const partial = {
      ...universal,
      providers: { vercel: universal.providers.vercel },
    };
    expect(MediaModelAvailability.requiresImageUpdate(partial, "0.0.21")).toBe(
      true
    );
  });
});
