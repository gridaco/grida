import { catalog as models } from "../src";

const video = models.video;
type Card = models.video.VideoModelCard;

function copy(id = "google/veo-3.1"): Card {
  return JSON.parse(JSON.stringify(video.models[id]));
}

function published(card: Card): models.snapshot.View {
  const seed = models.snapshot.seed();
  if (seed.preferences) delete seed.preferences.video;
  seed.video = { models: { [card.id]: card } };
  return models.snapshot.view(models.snapshot.parse(seed)!);
}

describe("video binding input facts", () => {
  // Provider sources and verification date are recorded in the package README.
  const facts = [
    ["google/veo-3.1", "vercel", "text-or-image"],
    ["google/veo-3.1", "fal", "image"],
    ["google/veo-3.1", "openrouter", "text-or-image"],
    ["google/veo-3.1-fast", "vercel", "text-or-image"],
    ["google/veo-3.1-fast", "fal", "image"],
    ["google/veo-3.1-lite", "vercel", "text-or-image"],
    ["google/veo-3.1-lite", "fal", "image"],
    ["alibaba/wan-3.0", "vercel", "text-or-image"],
    ["alibaba/wan-3.0", "fal", "image"],
    ["bytedance/seedance-2.0", "fal", "image"],
    ["bytedance/seedance-2.0", "openrouter", "text-or-image"],
    ["bytedance/seedance-2.5", "fal", "image"],
    ["xai/grok-imagine-video-1.5", "vercel", "image"],
    ["xai/grok-imagine-video-1.5", "fal", "image"],
  ] as const;

  it.each(facts)("%s on %s accepts %s", (id, provider, input) => {
    const card = video.models[id]!;
    expect(card.providers[provider]?.input).toBe(input);
    expect(video.input(card, provider)).toBe(input);
  });

  it("every bundled binding carries an explicit verified fact", () => {
    for (const card of Object.values(video.models)) {
      if (!card) continue;
      for (const provider of video.providers) {
        const binding = card.providers[provider];
        if (!binding) continue;
        expect(binding.input).toBeDefined();
        expect(video.input(card, provider)).not.toBeNull();
      }
    }
  });

  it("old snapshots borrow facts only for their exact surviving bindings", () => {
    const seed: ReturnType<typeof models.snapshot.seed> = JSON.parse(
      JSON.stringify(models.snapshot.seed())
    );
    for (const card of Object.values(seed.video!.models)) {
      for (const binding of Object.values(card.providers)) {
        delete binding.input;
      }
    }
    const parsed = models.snapshot.parse(JSON.parse(JSON.stringify(seed)))!;
    for (const [id, provider, expected] of facts) {
      const card = parsed.video!.models[id]!;
      expect(card.providers[provider]).not.toHaveProperty("input");
      expect(video.input(card, provider)).toBe(expected);
    }
  });

  it.each(["text", "image", "text-or-image", null] as const)(
    "preserves an explicit current %s fact over a bundled fact",
    (input) => {
      const card = copy();
      card.providers.vercel!.input = input;
      const current = published(card).video.models[card.id]!;
      expect(current.providers.vercel!.input).toBe(input);
      expect(video.input(current, "vercel")).toBe(input);
    }
  );

  it("accepts an explicit fact for a replacement binding", () => {
    const card = copy();
    card.providers.vercel!.id = "example/replacement";
    card.providers.vercel!.input = "text";
    expect(video.input(published(card).video.models[card.id]!, "vercel")).toBe(
      "text"
    );
  });

  it("does not infer an omitted fact for a replacement binding", () => {
    const card = copy();
    card.providers.vercel!.id = "example/image-to-video";
    delete card.providers.vercel!.input;
    expect(
      video.input(published(card).video.models[card.id]!, "vercel")
    ).toBeNull();
  });

  it("does not borrow a fact under a different canonical model id", () => {
    const card = copy();
    card.id = "example/new-model";
    delete card.providers.vercel!.input;
    expect(
      video.input(published(card).video.models[card.id]!, "vercel")
    ).toBeNull();
  });

  it.each(["__proto__", "toString", "constructor"])(
    "does not treat inherited catalogue key %s as a bundled model",
    (id) => {
      const card = copy();
      card.id = id;
      delete card.providers.vercel!.input;
      expect(video.input(card, "vercel")).toBeNull();
    }
  );

  it("does not restore a removed provider or any other removed model", () => {
    const card = copy();
    delete card.providers.vercel;
    const view = published(card);
    expect(Object.keys(view.video.models)).toEqual([card.id]);
    expect(view.video.models["google/veo-3.1-fast"]).toBeUndefined();
    expect(video.input(view.video.models[card.id]!, "vercel")).toBeNull();
  });

  it("does not borrow a fact across provider identities", () => {
    const card = copy();
    card.providers.vercel!.provider = "fal";
    delete card.providers.vercel!.input;
    expect(video.input(card, "vercel")).toBeNull();
  });

  it.each(
    [undefined, "unknown", "", false, 1, [], {}].map((input) => ({ input }))
  )(
    "keeps malformed present input $input unknown without restoring the catalogue",
    ({ input }) => {
      const card = copy();
      const binding = card.providers.vercel! as { input?: unknown };
      binding.input = input;
      // A malformed fact on a known binding must not trigger the legacy path.
      expect(video.input(card, "vercel")).toBeNull();
      const view = published(card);
      const current = view.video.models[card.id]!;
      expect(Object.keys(view.video.models)).toEqual([card.id]);
      expect(current.providers.vercel!.input).toBeNull();
      expect(video.input(current, "vercel")).toBeNull();
      // The usable sibling is preserved; this is not a whole-section fallback.
      expect(video.input(current, "fal")).toBe("image");
    }
  );
});
