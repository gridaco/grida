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
      // The reserved media keys and anything else a later schema adds.
      image: { models: { "acme/img": { nonsense: true } } },
      video: { models: {} },
      something_from_the_future: [1, 2, 3],
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("image");
    expect(parsed).not.toHaveProperty("video");
    expect(parsed).not.toHaveProperty("something_from_the_future");
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
