import models, { TIER_MODEL_IDS } from "..";

const snapshot = models.snapshot;

/** A minimal valid spec — every optional field absent. */
function spec(
  id: string,
  over: Partial<models.text.ModelSpec> = {}
): models.text.ModelSpec {
  return {
    id,
    label: `Label for ${id}`,
    multimodal: false,
    imageInputMimes: [],
    tool_call: true,
    contextWindow: 100_000,
    outputLimit: 8_000,
    cost: { input: 1, output: 2 },
    ...over,
  };
}

/** A whole snapshot whose four tiers all point at `ids[0]`. */
function snapshotOf(specs: models.text.ModelSpec[]): unknown {
  const catalog: Record<string, models.text.ModelSpec> = {};
  for (const s of specs) catalog[s.id] = s;
  const first = specs[0]!.id;
  return {
    schema: snapshot.SCHEMA,
    version: "test",
    text: {
      catalog,
      tier_model_ids: { nano: first, mini: first, pro: first, max: first },
    },
  };
}

/** Round-trip through JSON the way a real payload arrives. */
function wire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("models.snapshot.seed", () => {
  it("expresses the bundled catalogue verbatim", () => {
    const s = snapshot.seed();
    expect(s.schema).toBe(snapshot.SCHEMA);
    expect(s.version).toBe("seed");
    expect(s.text.catalog).toEqual(models.text.catalog);
    expect(s.text.tier_model_ids).toEqual(TIER_MODEL_IDS);
  });

  it("takes a publisher version", () => {
    expect(snapshot.seed({ version: "abc123" }).version).toBe("abc123");
  });

  it("does not alias the live catalogue tables", () => {
    const s = snapshot.seed();
    expect(s.text.catalog).not.toBe(models.text.catalog);
    expect(s.text.tier_model_ids).not.toBe(TIER_MODEL_IDS);
  });
});

describe("models.snapshot round-trip", () => {
  // The contract between the publisher and every client: what `seed()`
  // serializes, `parse()` must reconstruct exactly. This also guards the
  // real drift risk — a field added to `ModelSpec` but not to `parse`
  // would be silently dropped in transit, and this test catches it
  // without anyone remembering to update a field list.
  it("parse(wire(seed())) reconstructs seed() exactly", () => {
    const seeded = snapshot.seed({ version: "deadbeef" });
    const parsed = snapshot.parse(wire(seeded));
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(seeded);
  });

  it("carries every catalogue entry, including deprecated ones", () => {
    const parsed = snapshot.parse(wire(snapshot.seed()))!;
    expect(Object.keys(parsed.text.catalog).sort()).toEqual(
      Object.keys(models.text.catalog).sort()
    );
  });
});

describe("models.snapshot.parse — acceptance", () => {
  it("keeps an optional generated_at", () => {
    const base = snapshotOf([spec("acme/one")]) as Record<string, unknown>;
    const parsed = snapshot.parse({
      ...base,
      generated_at: "2026-07-31T00:00:00.000Z",
    });
    expect(parsed?.generated_at).toBe("2026-07-31T00:00:00.000Z");
  });

  it("ignores unknown fields so a newer publisher stays readable", () => {
    const base = snapshotOf([spec("acme/one")]) as Record<string, unknown>;
    const parsed = snapshot.parse({
      ...base,
      something_from_the_future: [1, 2, 3],
      another: { nested: true },
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("something_from_the_future");
    expect(parsed).not.toHaveProperty("another");
  });

  it("drops an unusable media section without losing the text catalogue", () => {
    // Sections are independently fallible on purpose: a broken image
    // catalogue must not cost a host its text catalogue — or its ability
    // to run a turn at all.
    const base = snapshotOf([spec("acme/one")]) as Record<string, unknown>;
    const parsed = snapshot.parse({
      ...base,
      image: { models: { "acme/img": { nonsense: true } } },
      video: { models: {} },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.text.catalog["acme/one"]).toBeDefined();
    expect(parsed!.image).toBeUndefined();
    expect(parsed!.video).toBeUndefined();
    // And the view falls back to the bundled media catalogue for that
    // modality rather than serving nothing.
    expect(snapshot.view(parsed!).image.models).toEqual(models.image.models);
  });

  it("accepts every optional spec and cost field", () => {
    const rich = spec("acme/rich", {
      short_label: "Rich",
      deprecated: true,
      multimodal: true,
      imageInputMimes: ["image/png", "image/webp"],
      cost: {
        input: 2,
        output: 12,
        cacheRead: 0.2,
        cacheWrite: 2.5,
        longContext: {
          inputTokensAbove: 272_000,
          inputMultiplier: 2,
          outputMultiplier: 1.5,
        },
      },
    });
    const parsed = snapshot.parse(wire(snapshotOf([rich])));
    expect(parsed?.text.catalog["acme/rich"]).toEqual(rich);
  });

  it("accepts a zero-cost (free) model", () => {
    const free = spec("acme/free", { cost: { input: 0, output: 0 } });
    expect(snapshot.parse(wire(snapshotOf([free])))).not.toBeNull();
  });
});

describe("models.snapshot.parse — rejection", () => {
  const base = () => snapshotOf([spec("acme/one")]) as Record<string, unknown>;

  function mutateSpec(over: Record<string, unknown>): unknown {
    const s = base();
    const text = s.text as { catalog: Record<string, unknown> };
    text.catalog["acme/one"] = {
      ...(text.catalog["acme/one"] as Record<string, unknown>),
      ...over,
    };
    return s;
  }

  it.each([
    ["not an object", 42],
    ["null", null],
    ["an array", []],
    ["a wrong schema major", { ...base(), schema: 2 }],
    ["a missing schema", { ...base(), schema: undefined }],
    ["a string schema", { ...base(), schema: "1" }],
    ["a missing version", { ...base(), version: undefined }],
    ["an empty version", { ...base(), version: "" }],
    ["a missing text section", { schema: 1, version: "v" }],
    ["a non-object catalog", { ...base(), text: { catalog: [] } }],
  ])("rejects %s", (_label, value) => {
    expect(snapshot.parse(value)).toBeNull();
  });

  it("rejects an empty catalogue", () => {
    const s = base();
    (s.text as { catalog: Record<string, unknown> }).catalog = {};
    expect(snapshot.parse(s)).toBeNull();
  });

  it("rejects a catalogue past the entry bound", () => {
    const many = Array.from({ length: 257 }, (_, i) => spec(`acme/m${i}`));
    expect(snapshot.parse(wire(snapshotOf(many)))).toBeNull();
    // One under the bound still parses, so the rejection is the bound
    // and not something else about the fixture.
    expect(snapshot.parse(wire(snapshotOf(many.slice(0, 256))))).not.toBeNull();
  });

  it("rejects a key that disagrees with its entry's id", () => {
    const s = base();
    const text = s.text as { catalog: Record<string, unknown> };
    text.catalog["acme/one"] = spec("acme/two");
    expect(snapshot.parse(s)).toBeNull();
  });

  it("rejects a prototype-polluting key smuggled beside a real model", () => {
    // The payload is built with JSON.parse on purpose. An object literal
    // would SET the prototype rather than create an own `__proto__` key,
    // so a literal-based fixture proves nothing. A real body arrives
    // through JSON.parse, which does create the own key — and copying
    // that key onto a plain object replaces the object's prototype
    // instead of adding an entry.
    //
    // The tiers point at a legitimate model, so every other check passes:
    // without an id-shape guard, `parse` would return a snapshot whose
    // catalogue silently carries an attacker-supplied prototype.
    const real = spec("acme/one");
    const hostile = JSON.parse(
      `{"schema":1,"version":"v","text":{"catalog":{` +
        `"acme/one":${JSON.stringify(real)},` +
        `"__proto__":${JSON.stringify(spec("__proto__"))}},` +
        `"tier_model_ids":{"nano":"acme/one","mini":"acme/one",` +
        `"pro":"acme/one","max":"acme/one"}}}`
    ) as { text: { catalog: Record<string, unknown> } };

    // The fixture really does carry the own key (guards the guard).
    expect(Object.keys(hostile.text.catalog).sort()).toEqual([
      "__proto__",
      "acme/one",
    ]);

    expect(snapshot.parse(hostile)).toBeNull();
  });

  it.each([
    ["a leading underscore", "_internal/model"],
    ["a space", "acme/model one"],
    ["a newline", "acme/model\n"],
    ["an empty id", ""],
    ["an id past the length bound", `acme/${"m".repeat(200)}`],
  ])("rejects %s as a catalogue key", (_label, id) => {
    expect(snapshot.parse(wire(snapshotOf([spec(id)])))).toBeNull();
  });

  it.each([
    ["a missing label", { label: undefined }],
    ["an empty label", { label: "" }],
    ["a non-boolean multimodal", { multimodal: "yes" }],
    ["a missing tool_call", { tool_call: undefined }],
    ["a zero context window", { contextWindow: 0 }],
    ["a negative context window", { contextWindow: -1 }],
    ["a fractional context window", { contextWindow: 1.5 }],
    ["a zero output limit", { outputLimit: 0 }],
    ["missing imageInputMimes", { imageInputMimes: undefined }],
    ["a non-image mime", { imageInputMimes: ["application/pdf"] }],
    ["a missing cost", { cost: undefined }],
    ["a negative rate", { cost: { input: -1, output: 2 } }],
    ["a non-finite rate", { cost: { input: 1, output: Infinity } }],
    ["a bad cacheRead", { cost: { input: 1, output: 2, cacheRead: "free" } }],
    [
      "a malformed longContext",
      { cost: { input: 1, output: 2, longContext: { inputMultiplier: 2 } } },
    ],
    ["a non-boolean deprecated", { deprecated: 1 }],
    ["an empty short_label", { short_label: "" }],
  ])("rejects a spec with %s", (_label, over) => {
    expect(
      snapshot.parse(mutateSpec(over as Record<string, unknown>))
    ).toBeNull();
  });

  it.each([
    ["a missing tier", { nano: undefined }],
    ["a tier outside the catalogue", { pro: "acme/absent" }],
    ["a tier naming an inherited key", { max: "constructor" }],
    ["a non-string tier value", { mini: 7 }],
  ])("rejects tier_model_ids with %s", (_label, over) => {
    const s = base();
    const text = s.text as { tier_model_ids: Record<string, unknown> };
    text.tier_model_ids = { ...text.tier_model_ids, ...over };
    expect(snapshot.parse(s)).toBeNull();
  });

  it("rejects a missing tier_model_ids entirely", () => {
    const s = base();
    delete (s.text as Record<string, unknown>).tier_model_ids;
    expect(snapshot.parse(s)).toBeNull();
  });
});

describe("models.snapshot.view", () => {
  it("memoizes the seed view and mirrors the static tables", () => {
    const a = snapshot.view();
    const b = snapshot.view();
    expect(a).toBe(b);
    expect(a.catalog).toEqual(models.text.catalog);
    expect(a.tier_model_ids).toEqual(TIER_MODEL_IDS);
    expect(a.by_tier).toEqual(models.text.byTier);
  });

  it("matches modelSpecById's rules — exact, bare, and date-suffixed", () => {
    const view = snapshot.view();
    for (const id of [
      "openai/gpt-5.6-luna",
      "gpt-5.6-luna",
      "gpt-5.6-luna-2026-07-30",
    ]) {
      expect(view.modelSpecById(id)).toBe(models.text.modelSpecById(id));
    }
    expect(view.modelSpecById("acme/nope")).toBeUndefined();
  });

  it("separates EXACT membership from the fuzzy lookup", () => {
    // Two questions, deliberately not the same one. `modelSpecById` says
    // "which model is this id about" — right for limits and rates, where
    // a bare or date-suffixed id is still that model. `has` says "is this
    // id in the catalogue" — the question a gate asks, because whatever
    // passes a gate is handed to a provider verbatim, and a provider only
    // knows the exact id.
    const view = snapshot.view();
    expect(view.has("openai/gpt-5.6-luna")).toBe(true);
    for (const nearMiss of ["gpt-5.6-luna", "gpt-5.6-luna-2026-07-30"]) {
      expect(view.modelSpecById(nearMiss)).toBeDefined();
      expect(view.has(nearMiss)).toBe(false);
    }
    expect(view.has("acme/nope")).toBe(false);
  });

  it("resolves a model the bundled catalogue has never heard of", () => {
    // The whole point: a published snapshot reaches an installed binary.
    const fresh = spec("acme/brand-new", { contextWindow: 42_000 });
    const view = snapshot.view(snapshot.parse(wire(snapshotOf([fresh])))!);
    expect(models.text.modelSpecById("acme/brand-new")).toBeUndefined();
    expect(view.modelSpecById("acme/brand-new")?.contextWindow).toBe(42_000);
  });

  it("replaces the catalogue wholesale — removal is the kill switch", () => {
    const view = snapshot.view(
      snapshot.parse(wire(snapshotOf([spec("acme/only")])))!
    );
    // A seed model absent from the snapshot must NOT resolve. Merging
    // would resurrect a model the publisher deliberately withdrew.
    expect(models.text.modelSpecById("openai/gpt-5.6-luna")).toBeDefined();
    expect(view.modelSpecById("openai/gpt-5.6-luna")).toBeUndefined();
  });

  it("retargets tiers", () => {
    const view = snapshot.view(
      snapshot.parse(wire(snapshotOf([spec("acme/only")])))!
    );
    expect(view.tier_model_ids.nano).toBe("acme/only");
    expect(view.by_tier.nano.contextWindow).toBe(100_000);
  });

  it("keeps registry precedence: the view's catalogue wins over custom", () => {
    const view = snapshot.view(
      snapshot.parse(wire(snapshotOf([spec("acme/only")])))!
    );
    const custom = [{ id: "acme/only", contextWindow: 8_192 }];
    const resolved = view.resolve("acme/only", custom);
    expect(resolved?.custom).toBe(false);
    expect(resolved?.contextWindow).toBe(100_000);
  });

  it("still resolves registered custom models below the catalogue (#806)", () => {
    const view = snapshot.view(
      snapshot.parse(wire(snapshotOf([spec("acme/only")])))!
    );
    const resolved = view.resolve("llama3.1:8b", [
      { id: "llama3.1:8b", contextWindow: 8_192, outputLimit: 2_048 },
    ]);
    expect(resolved?.custom).toBe(true);
    expect(resolved?.contextWindow).toBe(8_192);
    expect(view.resolve("llama3.1:8b")).toBeUndefined();
  });

  it("agrees with models.text.registry.resolve on the seed", () => {
    const view = snapshot.view();
    const custom = [{ id: "llama3.1:8b" }];
    for (const id of ["openai/gpt-5.6-terra", "llama3.1:8b", "acme/nope"]) {
      expect(view.resolve(id, custom)).toEqual(
        models.text.registry.resolve(id, custom)
      );
    }
  });
});

// ── media sections ──────────────────────────────────────────────────

/** The seed's own image/video cards, as the wire delivers them. */
function seedMedia(): {
  image: Record<string, models.image.ImageModelCard>;
  video: Record<string, models.video.VideoModelCard>;
} {
  const s = wire(snapshot.seed()) as {
    image: { models: Record<string, models.image.ImageModelCard> };
    video: { models: Record<string, models.video.VideoModelCard> };
  };
  return { image: s.image.models, video: s.video.models };
}

/** A whole snapshot with the given media models spliced in. */
function withMedia(over: {
  image?: Record<string, unknown>;
  video?: Record<string, unknown>;
}): unknown {
  const base = wire(snapshot.seed()) as Record<string, unknown>;
  if (over.image) base.image = { models: over.image };
  if (over.video) base.video = { models: over.video };
  return base;
}

describe("models.snapshot media — seed and round-trip", () => {
  it("seed() publishes the bundled image and video catalogues", () => {
    const s = snapshot.seed();
    expect(s.image!.models).toEqual(models.image.models);
    expect(s.video!.models).toEqual(models.video.models);
    expect(s.image!.models).not.toBe(models.image.models);
  });

  it("parse(wire(seed())) reconstructs both media sections exactly", () => {
    // Same anti-drift guard as the text round-trip: a field added to a
    // card but not to its parser is silently dropped in transit, and this
    // catches it without anyone maintaining a field list.
    const seeded = snapshot.seed({ version: "media" });
    const parsed = snapshot.parse(wire(seeded));
    expect(parsed).not.toBeNull();
    expect(parsed!.image).toEqual(seeded.image);
    expect(parsed!.video).toEqual(seeded.video);
  });

  it("preserves the fields whose loss would be silent", () => {
    const parsed = snapshot.parse(wire(snapshot.seed()))!;
    const gpt = parsed.image!.models["openai/gpt-image-2"]!;
    // references drives image-to-image routing; dropping it disables i2i
    // without any error.
    expect(gpt.providers.openrouter!.references).toEqual({
      id: "openai/gpt-image-2",
      max: 16,
    });
    expect(gpt.listed).toBe(true);
    expect(gpt.providers.vercel!.id).toBe("openai/gpt-image-2");
    const veo = parsed.video!.models["google/veo-3.1"]!;
    expect(veo.providers.fal!.id).toBe("fal-ai/veo3.1/image-to-video");
    expect(veo.providers.fal!.pricing.usd_per_second["4k"]).toEqual({
      audio: 0.6,
      silent: 0.4,
    });
  });
});

describe("models.snapshot media — image validation", () => {
  const seedImage = () => seedMedia().image;

  function mutateCard(id: string, over: Record<string, unknown>): unknown {
    const image = seedImage();
    image[id] = { ...(image[id] as object), ...over } as never;
    return withMedia({ image });
  }

  it("accepts the catalogue as-is", () => {
    expect(
      snapshot.parse(withMedia({ image: seedImage() }))!.image
    ).toBeDefined();
  });

  it.each([
    ["a key/id mismatch", { id: "acme/other" }],
    ["a missing label", { label: "" }],
    ["a non-boolean listed", { listed: "yes" }],
    ["a non-boolean deprecated", { deprecated: 1 }],
    ["a negative avg_cost_usd", { avg_cost_usd: -1 }],
    ["a missing styles key", { styles: undefined }],
    ["a missing sizes key", { sizes: undefined }],
    ["a missing constraints key", { constraints: undefined }],
    ["a malformed size tuple", { sizes: [[1024, 1024]] }],
    [
      "a bad aspect ratio in default",
      { default: { width: 1, height: 1, aspect_ratio: "square" } },
    ],
    ["an unknown pricing arm", { pricing: { type: "per_furlong", usd: 1 } }],
    ["no provider bindings", { providers: {} }],
  ])("rejects %s", (_label, over) => {
    const parsed = snapshot.parse(mutateCard("openai/gpt-image-2", over));
    // The text catalogue survives; only the media section is dropped.
    expect(parsed!.text.catalog).toBeDefined();
    expect(parsed!.image).toBeUndefined();
  });

  it("rejects a listed card missing a binding — the one-key promise", () => {
    // A curated card is servable by EVERY provider, so one connected key
    // serves the whole list. resolve-image.ts relies on it.
    const image = seedImage();
    const card = image["openai/gpt-image-2"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    delete providers.fal;
    image["openai/gpt-image-2"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ image }))!.image).toBeUndefined();
  });

  it("allows an UNLISTED card to be missing bindings", () => {
    const image = seedImage();
    const card = image["openai/gpt-image-2"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    delete providers.fal;
    image["openai/gpt-image-2"] = {
      ...card,
      listed: false,
      providers,
    } as never;
    expect(snapshot.parse(withMedia({ image }))!.image).toBeDefined();
  });

  it("rejects a card whose primary provider has no binding", () => {
    const image = seedImage();
    const card = image["bfl/flux-kontext-max"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    delete providers.vercel;
    image["bfl/flux-kontext-max"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ image }))!.image).toBeUndefined();
  });

  it("rejects a binding whose provider field disagrees with its key", () => {
    const image = seedImage();
    const card = image["openai/gpt-image-2"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    providers.fal = { ...(providers.fal as object), provider: "vercel" };
    image["openai/gpt-image-2"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ image }))!.image).toBeUndefined();
  });

  it("drops an unknown provider binding instead of rejecting the card", () => {
    // A provider this client has no adapter for is a route it cannot
    // take, not an error. Rejecting would make adding a provider a
    // breaking publish — the failure mode this whole system exists to
    // remove.
    const image = seedImage();
    const card = image["openai/gpt-image-2"] as Record<string, unknown>;
    image["openai/gpt-image-2"] = {
      ...card,
      providers: {
        ...(card.providers as object),
        futureprovider: {
          provider: "futureprovider",
          id: "x",
          pricing: { type: "per_image_flat", usd: 1 },
          avg_cost_usd: 1,
        },
      },
    } as never;
    const parsed = snapshot.parse(withMedia({ image }));
    const out = parsed!.image!.models["openai/gpt-image-2"]!;
    expect(Object.keys(out.providers).sort()).toEqual([
      "fal",
      "openrouter",
      "vercel",
    ]);
  });

  it("accepts a new vendor without a client release", () => {
    // `vendor` and `speed_label` are closed unions in TypeScript but are
    // validated as text on the wire — publishing a model from a vendor
    // this binary has never heard of must not require shipping one.
    const image = seedImage();
    const card = image["openai/gpt-image-2"] as Record<string, unknown>;
    image["openai/gpt-image-2"] = { ...card, vendor: "midjourney" } as never;
    const parsed = snapshot.parse(withMedia({ image }));
    expect(parsed!.image!.models["openai/gpt-image-2"]!.vendor).toBe(
      "midjourney"
    );
  });
});

describe("models.snapshot media — video validation", () => {
  const seedVideo = () => seedMedia().video;

  it("accepts the catalogue as-is", () => {
    expect(
      snapshot.parse(withMedia({ video: seedVideo() }))!.video
    ).toBeDefined();
  });

  it("rejects a binding that cannot price the model's default config", () => {
    // Provider selection is deferred, so the contract is route-agnostic:
    // whichever provider the runtime later picks must serve the default.
    const video = seedVideo();
    const card = video["google/veo-3.1"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    const fal = providers.fal as { pricing: { usd_per_second: object } };
    providers.fal = {
      ...fal,
      pricing: {
        type: "per_second",
        usd_per_second: { "480p": { audio: 0.1 } },
      },
    };
    video["google/veo-3.1"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ video }))!.video).toBeUndefined();
  });

  it("rejects a zero rate at the default config", () => {
    const video = seedVideo();
    const card = video["google/veo-3.1"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    providers.vercel = {
      ...(providers.vercel as object),
      pricing: {
        type: "per_second",
        // 1080p IS the card's default resolution.
        usd_per_second: { "720p": { audio: 0.4 }, "1080p": { audio: 0 } },
      },
    };
    video["google/veo-3.1"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ video }))!.video).toBeUndefined();
  });

  it("does NOT require every provider — the video ecosystem is fragmented", () => {
    const video = seedVideo();
    const card = video["google/veo-3.1"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    delete providers.openrouter;
    delete providers.fal;
    video["google/veo-3.1"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ video }))!.video).toBeDefined();
  });

  it.each([
    ["min_duration above max_duration", { min_duration: 20, max_duration: 4 }],
    [
      "a default duration outside the bounds",
      {
        min_duration: 4,
        max_duration: 6,
        default: {
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 99,
          audio: true,
        },
      },
    ],
    ["a missing url", { url: "" }],
    ["a bad aspect ratio", { aspect_ratios: ["wide"] }],
    ["a non-boolean audio", { audio: "yes" }],
  ])("rejects %s", (_label, over) => {
    const video = seedVideo();
    video["google/veo-3.1"] = {
      ...(video["google/veo-3.1"] as object),
      ...over,
    } as never;
    expect(snapshot.parse(withMedia({ video }))!.video).toBeUndefined();
  });
});

describe("models.snapshot media — prototype-safe price maps", () => {
  // MODEL_ID_PATTERN guards the CARD-key position. Media pricing adds two
  // free-form key maps it does not cover: image `tiers` and video
  // `usd_per_second`. Copying a JSON-parsed `__proto__` key onto a plain
  // object replaces that object's prototype, so a later lookup resolves
  // through the chain — `tiers["anything"]` returns an attacker-chosen
  // number while Object.keys() still looks clean. `image-cost.ts` bills on
  // exactly that lookup behind a `!== undefined` guard.
  it("rejects a polluting key in image pricing tiers", () => {
    const image = seedMedia().image;
    const hostile = JSON.parse(
      `{"type":"per_image_tiered","tiers":{"__proto__":{"medium/1024x1024":999},"low/1024x1024":2}}`
    ) as Record<string, unknown>;
    expect(Object.hasOwn(hostile.tiers as object, "__proto__")).toBe(true);
    image["openai/gpt-image-2"] = {
      ...(image["openai/gpt-image-2"] as object),
      pricing: hostile,
    } as never;
    expect(snapshot.parse(withMedia({ image }))!.image).toBeUndefined();
  });

  it("rejects a polluting resolution key in video pricing", () => {
    const video = seedMedia().video;
    const card = video["google/veo-3.1"] as Record<string, unknown>;
    const providers = { ...(card.providers as object) } as Record<
      string,
      unknown
    >;
    providers.vercel = {
      ...(providers.vercel as object),
      pricing: JSON.parse(
        `{"type":"per_second","usd_per_second":{"__proto__":{"audio":9},"720p":{"audio":0.4}}}`
      ),
    };
    video["google/veo-3.1"] = { ...card, providers } as never;
    expect(snapshot.parse(withMedia({ video }))!.video).toBeUndefined();
  });

  it("never lets a parsed price map inherit a rate", () => {
    const parsed = snapshot.parse(wire(snapshot.seed()))!;
    const gpt = parsed.image!.models["openai/gpt-image-2"]!;
    const tiers = (gpt.pricing as models.image.PerImageTieredPricing).tiers;
    expect(tiers["no/such-tier"]).toBeUndefined();
    expect((tiers as Record<string, unknown>).toString).toBeDefined();
  });
});

describe("models.snapshot media — the view", () => {
  it("mirrors the bundled lookups on the seed", () => {
    const view = snapshot.view();
    expect(view.image.models).toEqual(models.image.models);
    expect(
      view.image
        .listed()
        .map((c) => c.id)
        .sort()
    ).toEqual(
      models.image
        .listed_models()
        .map((c) => c.id)
        .sort()
    );
    expect(
      view.video
        .listed()
        .map((c) => c.id)
        .sort()
    ).toEqual(
      models.video
        .listed_models()
        .map((c) => c.id)
        .sort()
    );
  });

  it("matches findImageModelCard's id rules — exact and bare, no prefix", () => {
    const view = snapshot.view();
    expect(view.image.cardById("openai/gpt-image-2")?.id).toBe(
      "openai/gpt-image-2"
    );
    expect(view.image.cardById("gpt-image-2")?.id).toBe("openai/gpt-image-2");
    // "must refuse rather than guess"
    expect(view.image.cardById("gpt-image")).toBeUndefined();
    expect(view.image.cardById("acme/nope")).toBeUndefined();
    expect(view.image.cardById("")).toBeUndefined();
  });

  it("resolves bindings", () => {
    const view = snapshot.view();
    const card = view.image.cardById("openai/gpt-image-2")!;
    expect(view.image.binding(card, "fal")?.id).toBe("fal-ai/gpt-image-2");
    const kontext = view.image.cardById("bfl/flux-kontext-max")!;
    expect(view.image.binding(kontext, "openrouter")).toBeNull();
  });

  it("serves a media catalogue the bundle has never seen", () => {
    // The point of the whole mechanism, for media.
    const image = seedMedia().image;
    const fresh = {
      ...(image["openai/gpt-image-2"] as object),
      id: "acme/brand-new-image",
    };
    const parsed = snapshot.parse(
      withMedia({ image: { "acme/brand-new-image": fresh } })
    )!;
    const view = snapshot.view(parsed);
    expect(
      models.image.models["acme/brand-new-image" as never]
    ).toBeUndefined();
    expect(view.image.cardById("acme/brand-new-image")).toBeDefined();
    // Wholesale replacement: a withdrawn model stops resolving.
    expect(view.image.cardById("openai/gpt-image-2")).toBeUndefined();
  });

  it("memoizes listed() per view, not on the bundled catalogue", () => {
    // models.image.listed_models() memoizes over the bundled dict and can
    // never observe a published one — the memo has to live on the view.
    const image = seedMedia().image;
    const only = { "bfl/flux-2-pro": image["bfl/flux-2-pro"]! };
    const view = snapshot.view(snapshot.parse(withMedia({ image: only }))!);
    expect(view.image.listed()).toBe(view.image.listed());
    expect(view.image.listed().map((c) => c.id)).toEqual(["bfl/flux-2-pro"]);
    expect(models.image.listed_models().length).toBeGreaterThan(1);
  });
});
