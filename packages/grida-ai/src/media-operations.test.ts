// GRIDA-SEC-004 / GRIDA-SEC-006 — credential-free executable descriptions and shared input rules.
// GRIDA-GG: provider — discovery describes routes, never scoped access or credit eligibility.
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalog as models } from "@grida/ai-models/grida";
import { MediaOperations } from "./index";

const music = {
  kind: "music",
  model_id: "google/lyria-3",
  provider: "gg",
} as const;
const sound = {
  kind: "sound-effect",
  model_id: "eleven_text_to_sound_v2",
  provider: "elevenlabs",
} as const;
const speech = {
  kind: "text-to-speech",
  model_id: "eleven_v3",
  provider: "elevenlabs",
} as const;
const video = {
  kind: "video",
  model_id: "google/veo-3.1",
  provider: "vercel",
} as const;
const threeDText = {
  kind: "three-d",
  model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
  provider: "fal",
} as const;
const threeDImage = {
  kind: "three-d",
  model_id: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
  provider: "fal",
} as const;
const trellis = {
  kind: "three-d",
  model_id: "fal-ai/trellis-2",
  provider: "fal",
} as const;
// This input contract accepts seed; the recommended GPT Image 2.5 routes do not.
const imageCard = models.snapshot.view().image.models["openai/gpt-image-2"]!;
const image = {
  kind: "image",
  model_id: imageCard.id,
  provider: "openrouter",
} as const;
const inline = "data:image/png;base64,iVBORw0KGgo=";
const frame = "https://assets.example.invalid/frame.png";

function properties(descriptor: MediaOperations.Descriptor) {
  return descriptor.input_schema.properties as Record<
    string,
    Record<string, unknown>
  >;
}

function rejects(
  action: () => unknown,
  code: "invalid_input" | "operation_unavailable" = "invalid_input"
) {
  let failure: unknown;
  try {
    action();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(MediaOperations.Failure);
  expect(JSON.parse(JSON.stringify(failure))).toEqual({ code, message: code });
  expect(failure).not.toHaveProperty("cause");
}

afterEach(() => vi.restoreAllMocks());

describe("MediaOperations discovery", () => {
  it("lists every existing operation family without constructing authority or contacting a service", () => {
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Discovery must not fetch");
    });
    const operations = new MediaOperations();
    const descriptors = operations.list();
    expect(new Set(descriptors.map((entry) => entry.kind))).toEqual(
      new Set([
        "image",
        "video",
        "music",
        "sound-effect",
        "text-to-speech",
        "three-d",
      ])
    );
    expect(descriptors.length).toBeGreaterThan(10);
    expect(
      new Set(
        descriptors.map(
          (entry) =>
            `${entry.kind}/${entry.model_id}/${entry.provider_id}/${entry.variant}`
        )
      ).size
    ).toBe(descriptors.length);
    expect(operations.inspect(music)).toMatchObject({
      kind: "music",
      model_id: music.model_id,
      provider_id: "gg",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("returns deeply immutable schemas and honest native byte output descriptions", () => {
    const operations = new MediaOperations();
    const descriptors = operations.list();
    expect(Object.isFrozen(descriptors)).toBe(true);
    for (const descriptor of descriptors) {
      expect(Object.keys(descriptor).sort()).toEqual(
        [
          "kind",
          "model_id",
          "provider_id",
          "binding_id",
          "variant",
          "status",
          "input_schema",
          "output",
          ...(descriptor.native_background ? ["native_background"] : []),
          ...(descriptor.deprecated ? ["deprecated"] : []),
          ...(descriptor.references_max === undefined
            ? []
            : ["references_max"]),
        ].sort()
      );
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.input_schema)).toBe(true);
      expect(Object.isFrozen(descriptor.input_schema.properties)).toBe(true);
      expect(Object.isFrozen(descriptor.output)).toBe(true);
      expect(descriptor.input_schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
      });
      expect(descriptor.output).toMatchObject({
        representation: "native",
        data: "Uint8Array",
      });
      expect(properties(descriptor)).not.toHaveProperty("signal");
      expect(descriptor).not.toHaveProperty("ready");
      expect(descriptor).not.toHaveProperty("credits");
      expect(descriptor).not.toHaveProperty("endpoint");
    }
    expect(operations.inspect(music).output).toEqual({
      representation: "native",
      field: "audio",
      cardinality: "one",
      data: "Uint8Array",
      media_types: ["audio/mpeg"],
      max_items: 1,
      max_total_bytes: 32 * 1024 * 1024,
    });
    expect(operations.inspect(trellis).output).toMatchObject({
      field: "glb",
      media_types: ["model/gltf-binary"],
    });
    expect(JSON.stringify(descriptors)).not.toContain("AbortSignal");
  });

  it("keeps staged executable bindings visible without promoting catalogue status", () => {
    const operations = new MediaOperations();
    expect(operations.inspect(sound).status).toBe("staged");
    expect(operations.inspect(speech).status).toBe("staged");
    expect(
      operations
        .list({ kind: "three-d" })
        .map((entry) => entry.model_id)
        .sort()
    ).toEqual(
      [threeDText.model_id, threeDImage.model_id, trellis.model_id].sort()
    );
    expect(
      operations
        .list({ kind: "music" })
        .map((entry) => entry.model_id)
        .sort()
    ).toEqual(["google/lyria-3", "google/lyria-3-pro"]);
    expect(operations.list({ kind: "music", provider: "fal" })).toEqual([]);
    expect(operations.list({ kind: "sound-effect", provider: "gg" })).toEqual(
      []
    );
  });

  it("separates concrete image reference and video start-frame variants", () => {
    const operations = new MediaOperations();
    const text = operations.inspect(image);
    const references = operations.inspect({ ...image, variant: "references" });
    const binding = models.image.binding(imageCard, "openrouter")!;
    expect(text.variant).toBe("text");
    expect(properties(text)).not.toHaveProperty("references");
    expect(references).toMatchObject({
      variant: "references",
      references_max: binding.references!.max,
      binding_id: binding.references!.id,
    });
    expect(properties(references).references).toMatchObject({
      minItems: 1,
      maxItems: binding.references!.max,
    });
    expect(operations.inspect(video).variant).toBe("text");
    expect(operations.inspect({ ...video, variant: "image" }).variant).toBe(
      "image"
    );
    rejects(
      () => operations.inspect({ ...video, provider: "fal" }),
      "operation_unavailable"
    );
    expect(
      operations.inspect({ ...video, provider: "fal", variant: "image" })
        .variant
    ).toBe("image");
    rejects(
      () => operations.inspect({ ...video, provider: "gg", variant: "image" }),
      "operation_unavailable"
    );
    expect(operations.inspect(threeDImage).variant).toBe("image");
    expect(operations.inspect(trellis).variant).toBe("image");
  });

  it("distinguishes invalid selectors from absent routes", () => {
    expect.hasAssertions();
    const operations = new MediaOperations();
    rejects(
      () => operations.inspect({ ...music, model_id: "unknown/model" }),
      "operation_unavailable"
    );
    rejects(() =>
      operations.inspect({
        ...music,
        provider: "auto" as MediaOperations.Provider,
      })
    );
    rejects(() =>
      operations.list({ provider: "custom" as MediaOperations.Provider })
    );
    rejects(() => operations.list({ kind: "agent" as MediaOperations.Kind }));
    rejects(() =>
      operations.inspect({ ...music, extra: true } as MediaOperations.Selector)
    );
    rejects(
      () =>
        new MediaOperations({ keys: {} } as ConstructorParameters<
          typeof MediaOperations
        >[0])
    );
  });

  it("owns a pinned snapshot and never restores a removed image or video binding", () => {
    const snapshot = JSON.parse(JSON.stringify(models.snapshot.seed()));
    delete snapshot.image.models[image.model_id];
    delete snapshot.video.models[video.model_id].providers.vercel;
    const operations = new MediaOperations({ snapshot });
    snapshot.image = models.snapshot.seed().image;
    snapshot.video = models.snapshot.seed().video;
    expect(
      operations.list({ kind: "image", model_id: image.model_id })
    ).toEqual([]);
    rejects(() => operations.inspect(video), "operation_unavailable");
    rejects(
      () => operations.inspect({ ...video, provider: "gg" }),
      "operation_unavailable"
    );
    expect(
      operations.inspect({ ...video, provider: "fal", variant: "image" })
    ).toBeDefined();
  });

  it("inherits only exact legacy video facts and refuses changed or explicitly unknown bindings", () => {
    const snapshot = JSON.parse(JSON.stringify(models.snapshot.seed()));
    const binding = snapshot.video.models[video.model_id].providers.vercel;
    delete binding.input;
    expect(new MediaOperations({ snapshot }).inspect(video).variant).toBe(
      "text"
    );
    binding.id = "new/unverified-binding";
    rejects(
      () => new MediaOperations({ snapshot }).inspect(video),
      "operation_unavailable"
    );
    binding.id = models.video.binding(
      models.snapshot.view().video.models[video.model_id]!,
      "vercel"
    )!.id;
    binding.input = null;
    rejects(
      () => new MediaOperations({ snapshot }).inspect(video),
      "operation_unavailable"
    );
    rejects(
      () =>
        new MediaOperations({ snapshot }).inspect({ ...video, provider: "gg" }),
      "operation_unavailable"
    );
  });

  it("rejects an invalid supplied section instead of falling back to bundled media", () => {
    expect.hasAssertions();
    const snapshot = JSON.parse(JSON.stringify(models.snapshot.seed()));
    snapshot.image = { models: "malformed" };
    rejects(() => new MediaOperations({ snapshot }));
  });
});

describe("MediaOperations JSON input", () => {
  const operations = new MediaOperations();

  it("preserves image text/options, supplies the count default and describes numeric constraints", () => {
    const result = operations.parseInput(image, {
      prompt: "  keep whitespace  ",
      seed: 0,
      aspect_ratio: "1.5:2",
    });
    expect(result).toMatchObject({
      kind: "image",
      selection: {
        model_id: image.model_id,
        provider: "openrouter",
        references: false,
      },
      input: {
        prompt: "  keep whitespace  ",
        n: 1,
        seed: 0,
        aspect_ratio: "1.5:2",
      },
    });
    expect(properties(operations.inspect(image)).n).toMatchObject({
      type: "integer",
      minimum: 1,
      default: 1,
    });
    rejects(() => operations.parseInput(image, { prompt: "x", n: 0 }));
    rejects(() =>
      operations.parseInput(image, { prompt: "x", size: "0x1024" })
    );
    rejects(() =>
      operations.parseInput(image, { prompt: "x", references: [inline] })
    );
  });

  it("enforces the selected reference cap before any host asset work", () => {
    const selector = { ...image, variant: "references" } as const;
    const maximum = operations.inspect(selector).references_max!;
    const valid = operations.parseInput(selector, {
      prompt: "edit",
      references: [inline, ...Array(maximum - 1).fill(frame)],
    });
    expect(valid).toMatchObject({
      selection: { references: true },
      input: { references: expect.any(Array) },
    });
    rejects(() => operations.parseInput(selector, { prompt: "edit" }));
    rejects(() =>
      operations.parseInput(selector, { prompt: "edit", references: [] })
    );
    rejects(() =>
      operations.parseInput(selector, {
        prompt: "edit",
        references: Array(maximum + 1).fill(frame),
      })
    );
    rejects(() =>
      operations.parseInput(selector, {
        prompt: "edit",
        references: ["file:///private/input.png"],
      })
    );
  });

  it("requires the video frame only in its selected variant and preserves the Vercel zero-seed restriction", () => {
    expect(properties(operations.inspect(video)).seed).toMatchObject({
      not: { const: 0 },
    });
    rejects(() => operations.parseInput(video, { prompt: "x", seed: 0 }));
    const fal = { ...video, provider: "fal", variant: "image" } as const;
    expect(
      operations.parseInput(fal, { prompt: "x", image_url: frame, seed: 0 })
    ).toMatchObject({
      selection: { image: true },
      input: { image_url: frame, seed: 0 },
    });
    rejects(() => operations.parseInput(fal, { prompt: "x" }));
    rejects(() =>
      operations.parseInput(video, { prompt: "x", image_url: frame })
    );
    rejects(() =>
      operations.parseInput(fal, {
        prompt: "x",
        image_url: "http://insecure.invalid/a",
      })
    );
    rejects(() =>
      operations.parseInput(video, { prompt: "x", resolution: "720p" })
    );
    rejects(() => operations.parseInput(video, { prompt: "x", duration: 0 }));
  });

  it("counts trimmed music prompts as UTF-16 units and preserves seed zero", () => {
    expect(properties(operations.inspect(music)).prompt).toMatchObject({
      "x-grida-trim": true,
      "x-grida-max-length": 4096,
      "x-grida-length-unit": "utf16",
    });
    expect(
      operations.parseInput(music, {
        prompt: ` ${"🎵".repeat(2048)} `,
        seed: 0,
      })
    ).toMatchObject({ input: { prompt: "🎵".repeat(2048), seed: 0 } });
    rejects(() => operations.parseInput(music, { prompt: "🎵".repeat(2049) }));
    rejects(() => operations.parseInput(music, { prompt: "x", images: [] }));
  });

  it("counts trimmed sound prompts as code points and preserves omitted, false and zero options", () => {
    const rule = properties(operations.inspect(sound));
    expect(rule.prompt).toMatchObject({
      "x-grida-trim": true,
      "x-grida-max-length": 450,
      "x-grida-length-unit": "codepoints",
    });
    expect(rule.duration_seconds).toMatchObject({ minimum: 0.5, maximum: 30 });
    expect(
      operations.parseInput(sound, {
        prompt: ` ${"🔊".repeat(450)} `,
        duration_seconds: 0.5,
        loop: false,
        prompt_influence: 0,
      })
    ).toMatchObject({
      input: {
        prompt: "🔊".repeat(450),
        duration_seconds: 0.5,
        loop: false,
        prompt_influence: 0,
      },
    });
    expect(
      JSON.parse(
        JSON.stringify(operations.parseInput(sound, { prompt: "x" }).input)
      )
    ).toEqual({ prompt: "x" });
    rejects(() => operations.parseInput(sound, { prompt: "🔊".repeat(451) }));
    rejects(() =>
      operations.parseInput(sound, { prompt: "x", duration_seconds: 0.49 })
    );
    rejects(() =>
      operations.parseInput(sound, { prompt: "x", prompt_influence: 1.01 })
    );
    rejects(() => operations.parseInput(sound, { prompt: "x", loop: null }));
  });

  it("splits normalized speech voice selection from unchanged Unicode text", () => {
    const text = `[whispers] ${"🗣".repeat(4989)}`;
    const result = operations.parseInput(speech, {
      voice_id: " opaque/voice ",
      text,
    });
    expect(result).toMatchObject({
      kind: "text-to-speech",
      selection: { voice_id: "opaque/voice" },
      input: { text },
    });
    expect(properties(operations.inspect(speech)).text).toMatchObject({
      maxLength: 5000,
    });
    expect(properties(operations.inspect(speech)).voice_id).toMatchObject({
      "x-grida-uri-segment": true,
    });
    rejects(() =>
      operations.parseInput(speech, {
        voice_id: "valid",
        text: "🗣".repeat(5001),
      })
    );
    for (const voice_id of [".", "..", "\ud800", "v".repeat(257)])
      rejects(() => operations.parseInput(speech, { voice_id, text: "hello" }));
    rejects(() =>
      operations.parseInput(speech, { voice_id: "valid", text: " \t\n" })
    );
  });

  it("keeps each exact 3D signature distinct and converts JSON base64 to fresh native bytes", () => {
    expect(
      operations.parseInput(threeDText, { prompt: "  small chair  " })
    ).toEqual({
      kind: "three-d",
      model_id: threeDText.model_id,
      selection: { model_id: threeDText.model_id, provider: "fal" },
      input: { prompt: "small chair" },
    });
    for (const selector of [threeDImage, trellis]) {
      const json = { image: { data: "iVBORw0KGgo=", media_type: "image/png" } };
      const result = operations.parseInput(selector, json);
      expect(result).toMatchObject({
        kind: "three-d",
        model_id: selector.model_id,
        input: {
          image: {
            data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
            media_type: "image/png",
          },
        },
      });
      expect(properties(operations.inspect(selector)).image).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      rejects(() => operations.parseInput(selector, { ...json, prompt: "" }));
      rejects(() =>
        operations.parseInput(selector, { prompt: "not an image" })
      );
      rejects(() =>
        operations.parseInput(selector, {
          image: { data: new Uint8Array([1]), media_type: "image/png" },
        })
      );
      rejects(() =>
        operations.parseInput(selector, {
          image: { data: "AQ==", media_type: "image/gif" },
        })
      );
    }
    rejects(() =>
      operations.parseInput(threeDText, {
        prompt: "x",
        image: { data: "AQ==", media_type: "image/png" },
      })
    );
    rejects(() =>
      operations.parseInput(threeDText, { prompt: "x".repeat(1025) })
    );
  });

  it("enforces the encoded and decoded 8 MiB image input bounds", () => {
    const maximum = 8 * 1024 * 1024;
    const pattern = String.fromCharCode(
      ...Array.from({ length: 256 }, (_, byte) => byte)
    );
    const data = btoa(pattern.repeat(maximum / pattern.length));
    const result = operations.parseInput(trellis, {
      image: { data, media_type: "image/webp" },
    });
    if (result.kind !== "three-d" || result.model_id !== trellis.model_id)
      throw new Error("Expected TRELLIS input");
    expect(result.input.image.data).toHaveLength(maximum);
    expect(
      result.input.image.data.every((byte, index) => byte === index % 256)
    ).toBe(true);
    const decode = vi.spyOn(globalThis, "atob");
    // 8 MiB ends with two bytes, so a third byte fits in the same base64 length.
    const decodedOverflow = data.slice(0, -4) + btoa(pattern.slice(-2) + "\0");
    expect(decodedOverflow).toHaveLength(data.length);
    rejects(() =>
      operations.parseInput(trellis, {
        image: { data: decodedOverflow, media_type: "image/webp" },
      })
    );
    rejects(() =>
      operations.parseInput(trellis, {
        image: { data: decodedOverflow + "AAAA", media_type: "image/webp" },
      })
    );
    for (const invalid of ["", "AQ", "!!!!", "AAAA==="])
      rejects(() =>
        operations.parseInput(trellis, {
          image: { data: invalid, media_type: "image/webp" },
        })
      );
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects JSON controls, unknown fields and undefined optional fields", () => {
    expect.hasAssertions();
    rejects(() =>
      operations.parseInput(sound, {
        prompt: "x",
        signal: new AbortController().signal,
      })
    );
    rejects(() => operations.parseInput(sound, { prompt: "x", seed: 0 }));
    rejects(() =>
      operations.parseInput(sound, { prompt: "x", loop: undefined })
    );
    rejects(() => operations.parseInput(music, []));
    rejects(() => operations.parseInput(music, null));
  });

  it("snapshots scalar getters once and contains arbitrary thrown input details", () => {
    let reads = 0;
    const result = operations.parseInput(sound, {
      get prompt() {
        ++reads;
        return "  first prompt  ";
      },
    });
    expect(result.input).toMatchObject({ prompt: "first prompt" });
    expect(reads).toBe(1);
    rejects(() =>
      operations.parseInput(sound, {
        get prompt() {
          throw new Error("private input must not escape");
        },
      })
    );
    rejects(() =>
      operations.inspect({
        get kind(): "music" {
          throw new Error("private selector must not escape");
        },
        model_id: music.model_id,
        provider: "gg",
      })
    );
  });
});

describe("image discovery after catalogue evolution", () => {
  const operations = new MediaOperations();
  const model_id = "openai/gpt-image-2.5-flare";
  it("keeps deprecated models callable and identifies their status", () => {
    const old = operations.list({
      kind: "image",
      model_id: "openai/gpt-image-2",
    });
    expect(old.length).toBeGreaterThan(0);
    expect(old.every((entry) => entry.deprecated === true)).toBe(true);
    expect(
      operations
        .list({ kind: "image", model_id })
        .every((entry) => !entry.deprecated)
    ).toBe(true);
  });
  it.each(["fal", "vercel", "gg"] as const)(
    "describes and parses supported %s background intent for native resolution",
    (provider) => {
      const selector = { kind: "image", model_id, provider } as const;
      expect(properties(operations.inspect(selector)).background.enum).toEqual([
        "auto",
        "opaque",
        "transparent",
      ]);
      expect(
        operations.parseInput(selector, {
          prompt: "sticker",
          background: "transparent",
        })
      ).toMatchObject({
        selection: { background: "transparent" },
        input: { background: "transparent" },
      });
    }
  );
  it("withholds unsupported provider controls in the schema and parser", () => {
    for (const provider of ["fal", "openrouter"] as const) {
      const selector = { kind: "image", model_id, provider } as const;
      expect(properties(operations.inspect(selector))).not.toHaveProperty(
        "seed"
      );
      rejects(() =>
        operations.parseInput(selector, { prompt: "sticker", seed: 0 })
      );
    }
    const fal = { kind: "image", model_id, provider: "fal" } as const;
    expect(properties(operations.inspect(fal))).not.toHaveProperty(
      "aspect_ratio"
    );
    rejects(() =>
      operations.parseInput(fal, { prompt: "sticker", aspect_ratio: "1:1" })
    );
    const openrouter = {
      kind: "image",
      model_id,
      provider: "openrouter",
    } as const;
    expect(properties(operations.inspect(openrouter)).background.enum).toEqual([
      "auto",
    ]);
    rejects(() =>
      operations.parseInput(openrouter, {
        prompt: "sticker",
        background: "transparent",
      })
    );
  });
});
