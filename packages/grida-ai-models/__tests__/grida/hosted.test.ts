import { models as facts } from "../../src";
import { catalog } from "../../src/grida";

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
const routes = [
  [
    "google/gemini-omni-1.1-flash",
    "google/gemini-omni-flash/v1.1/text-to-video",
  ],
  ["google/veo-3.1", "fal-ai/veo3.1"],
  ["google/veo-3.1-fast", "fal-ai/veo3.1/fast"],
  ["google/veo-3.1-lite", "fal-ai/veo3.1/lite"],
  ["alibaba/wan-3.0", "alibaba/wan-3.0/text-to-video"],
  ["bytedance/seedance-2.0", "bytedance/seedance-2.0/text-to-video"],
  ["bytedance/seedance-2.5", "bytedance/seedance-2.5/text-to-video"],
] as const;

describe("independent hosted media admission", () => {
  it.each(routes)(
    "resolves the verified %s text operation without replacing its image binding",
    (id, endpoint) => {
      const card = catalog.video.models[id]!;
      expect(catalog.video.hostedBinding(card)).toMatchObject({
        provider: "fal",
        id: endpoint,
        input: "text",
      });
      expect(catalog.video.binding(card, "fal")?.input).toBe("image");
      expect(catalog.video.binding(card, "fal")?.id).not.toBe(endpoint);
      expect(facts.video.models[id]).not.toHaveProperty("hosted");
    }
  );

  it("admits fal-only models without fake Vercel bindings", () => {
    for (const id of [
      "google/gemini-omni-1.1-flash",
      "bytedance/seedance-2.5",
      "bytedance/seedance-2.0",
    ]) {
      const card = catalog.video.models[id]!;
      expect(card.providers.vercel).toBeUndefined();
      expect(catalog.video.hostedBinding(card)?.provider).toBe("fal");
    }
  });

  it("keeps recommendations and legacy primary providers while selecting fal", () => {
    expect(catalog.image.default_id).toBe("openai/gpt-image-2.5-flare");
    expect(catalog.video.default_id).toBe("google/veo-3.1");
    for (const card of catalog.image.listed_models()) {
      expect(card.provider).toBe("vercel");
      expect(catalog.image.hostedBinding(card)?.provider).toBe("fal");
    }
    const card = catalog.image.models["openai/gpt-image-2.5-flare"]!;
    expect(
      catalog.image.supportsTransparentBackground(
        card,
        catalog.image.hostedBinding(card)!.provider
      )
    ).toBe(true);
  });

  it("preserves Vercel-only admission for old snapshots without hosted metadata", () => {
    const seed = wire(catalog.snapshot.seed());
    for (const card of Object.values(seed.image!.models)) delete card.hosted;
    for (const card of Object.values(seed.video!.models)) {
      delete card.hosted;
      delete card.text_to_video;
    }
    const view = catalog.snapshot.view(catalog.snapshot.parse(seed)!);
    expect(
      view.image.hostedBinding(view.image.models["openai/gpt-image-2.5-flare"]!)
        ?.provider
    ).toBe("vercel");
    expect(
      view.video.hostedBinding(view.video.models["google/veo-3.1"]!)?.provider
    ).toBe("vercel");
    expect(
      view.video.hostedBinding(view.video.models["bytedance/seedance-2.0"]!)
    ).toBeNull();
    expect(
      view.video.hostedBinding(
        view.video.models["google/gemini-omni-1.1-flash"]!
      )
    ).toBeNull();
  });

  it("preserves explicit hosted denial instead of reviving a legacy route", () => {
    const card = wire(catalog.video.models["google/veo-3.1"]!);
    card.hosted = null;
    expect(catalog.video.hostedBinding(card)).toBeNull();
    expect(
      catalog.video.hostedBinding(
        catalog.video.models["xai/grok-imagine-video-1.5"]!
      )
    ).toBeNull();
  });

  it.each([
    undefined,
    "fal",
    {},
    { provider: "future", id: "future/model" },
    { provider: "fal", id: "unknown/model" },
  ])(
    "isolates malformed hosted metadata %j without dropping cards or other sections",
    (hosted) => {
      const seed = wire(catalog.snapshot.seed());
      (seed.video!.models["google/veo-3.1"] as { hosted?: unknown }).hosted =
        hosted;
      (
        seed.image!.models["openai/gpt-image-2.5-flare"] as { hosted?: unknown }
      ).hosted = hosted;
      const parsed = catalog.snapshot.parse(seed)!;
      expect(Object.keys(parsed.video!.models)).toEqual(
        Object.keys(seed.video!.models)
      );
      expect(Object.keys(parsed.image!.models)).toEqual(
        Object.keys(seed.image!.models)
      );
      expect(parsed.video!.models["google/veo-3.1"]!.hosted).toBeNull();
      expect(
        parsed.image!.models["openai/gpt-image-2.5-flare"]!.hosted
      ).toBeNull();
      expect(
        catalog.video.hostedBinding(
          parsed.video!.models["google/veo-3.1-fast"]!
        )
      ).not.toBeNull();
    }
  );

  it("refuses removed facts and never synthesizes text endpoints", () => {
    const card = wire(catalog.video.models["google/veo-3.1"]!);
    delete card.text_to_video!.fal;
    expect(catalog.video.hostedBinding(card)).toBeNull();
    const image = wire(catalog.image.models["openai/gpt-image-2.5-flare"]!);
    image.providers.fal!.id = "example/replacement";
    expect(catalog.image.hostedBinding(image)).toBeNull();
  });

  it("uses current factual rates rather than a stale projected copy", () => {
    const card = wire(catalog.video.models["google/veo-3.1"]!);
    card.hosted!.pricing.usd_per_second["1080p"]!.audio = 999;
    expect(
      catalog.video.hostedBinding(card)!.pricing.usd_per_second["1080p"]!.audio
    ).toBe(0.4);
  });

  it("isolates malformed operation facts without losing the image binding", () => {
    const seed = wire(catalog.snapshot.seed());
    const card = seed.video!.models["bytedance/seedance-2.5"]!;
    card.text_to_video!.fal!.input = "image";
    const parsed = catalog.snapshot.parse(seed)!;
    expect(parsed.video).toBeDefined();
    expect(
      catalog.video.hostedBinding(parsed.video!.models[card.id]!)
    ).toBeNull();
    expect(
      catalog.video.binding(parsed.video!.models[card.id]!, "fal")?.input
    ).toBe("image");
  });

  it("round-trips schema 1 and resolves hosted operations through immutable views", () => {
    const seed = catalog.snapshot.seed();
    const parsed = catalog.snapshot.parse(wire(seed))!;
    expect(parsed).toEqual(seed);
    const view = catalog.snapshot.view(parsed);
    for (const [id, endpoint] of routes) {
      expect(view.video.hostedBinding(view.video.cardById(id)!)?.id).toBe(
        endpoint
      );
    }
    expect(
      Object.isFrozen(view.video.models["google/veo-3.1"]!.text_to_video)
    ).toBe(true);
  });
});
