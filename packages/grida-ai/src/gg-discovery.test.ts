import { describe, expect, it, vi } from "vitest";
import { GGDiscoveryStore, supportsGGPromptOperation } from "./gg-discovery";
import { ggContractFixture } from "./testing/gg-contract";
import publicWire from "./testing/fixtures/gg-discovery-public.json";

const model = (id = "fixture/new-model") => ({
  id,
  object: "model",
  created: 0,
  owned_by: "fixture",
  gg: {
    kind: "text",
    interfaces: ["chat.completions"],
    input_modalities: ["text"],
    output_modalities: ["text"],
    operation_ids: [] as string[],
    capabilities: { streaming: true },
    limits: { context_tokens: 4096, max_output_tokens: 1024 },
    request_schemas: { "chat.completions": { type: "object" } },
    card: { label: "New model" },
  },
});
function response(data: unknown[], revision = "fixture.1", extra = {}) {
  return Response.json({
    object: "list",
    revision,
    next_change_at: null,
    data,
    ...extra,
  });
}
const bundle = () =>
  Response.json(
    { $defs: {}, "x-gg-operations": [] },
    { headers: { "content-type": "application/schema+json; charset=utf-8" } }
  );
function source() {
  return vi.fn<typeof fetch>(async (url: string | URL | Request) =>
    String(url).endsWith("operations.json")
      ? bundle()
      : response(String(url).endsWith("/models") ? [model()] : [])
  );
}
describe("GG current discovery", () => {
  it("admits new IDs from interfaces, never a bundled provider binding", async () => {
    const fetcher = source();
    const store = new GGDiscoveryStore({ fetch: fetcher });
    expect(store.view()).toBeNull();
    await Promise.all([store.ready(), store.ready(), store.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(store.supports("fixture/new-model", "chat.completions")).toBe(true);
    expect(store.supports("fixture/new-model", "images.generations")).toBe(
      false
    );
    expect(Object.isFrozen(store.model("fixture/new-model"))).toBe(true);
    await store.ready();
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls as unknown as [
      unknown,
      RequestInit,
    ][]) {
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    }
  });
  it("retains a bounded last good view during failure, then withholds expired offerings", async () => {
    let now = 0;
    const fetcher = source();
    const store = new GGDiscoveryStore({ fetch: fetcher, now: () => now });
    await store.ready();
    now = 60_000;
    fetcher.mockRejectedValue(new Error("offline"));
    await store.ready();
    expect(store.model("fixture/new-model")).toBeDefined();
    const calls = fetcher.mock.calls.length;
    await store.ready();
    expect(fetcher).toHaveBeenCalledTimes(calls);
    now = 300_000;
    expect(store.view()).toBeNull();
    expect(store.supports("fixture/new-model", "chat.completions")).toBe(false);
  });
  it("withdraws removed models and applies scheduled changes even during outage", async () => {
    let now = 0;
    const fetcher = source();
    const store = new GGDiscoveryStore({ fetch: fetcher, now: () => now });
    await store.ready();
    now = 60_000;
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith("operations.json")
        ? bundle()
        : response([], "fixture.2", { next_change_at: "1970-01-01T00:02:00Z" })
    );
    await store.ready();
    expect(store.model("fixture/new-model")).toBeUndefined();
    expect(store.view()?.revision).toBe("fixture.2");
    now = 120_000;
    expect(store.view()).toBeNull();
  });
  it("rejects inconsistent snapshots, malformed capabilities and oversized chunked bodies", async () => {
    const mismatched = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(async (url) =>
        response([], String(url).endsWith("/models") ? "a" : "b")
      ),
    });
    expect(await mismatched.ready()).toBeNull();
    const malformed = model();
    (
      malformed.gg.capabilities as unknown as Record<string, unknown>
    ).streaming = "yes";
    const invalid = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(async () => response([malformed])),
    });
    expect(await invalid.ready()).toBeNull();
    let cancelled = false;
    const huge = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "application/json" } }
          )
      ),
    });
    expect(await huge.ready()).toBeNull();
    expect(cancelled).toBe(true);
  });
  it("bounds cache age supplied by the CDN and validates the host origin", async () => {
    let now = 0;
    const store = new GGDiscoveryStore({
      now: () => now,
      fetch: vi.fn<typeof fetch>(async (url) => {
        const r = String(url).endsWith("operations.json")
          ? bundle()
          : response(String(url).endsWith("/models") ? [model()] : []);
        r.headers.set("Age", "299");
        return r;
      }),
    });
    await store.ready();
    now = 1000;
    expect(store.view()).toBeNull();
    for (const origin of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/path",
      "https://example.com?token=secret",
    ]) {
      expect(() => new GGDiscoveryStore({ origin })).toThrow(
        "gg_invalid_discovery_origin"
      );
    }
    expect(
      () => new GGDiscoveryStore({ origin: "http://127.0.0.1:4000" })
    ).not.toThrow();
  });
});

describe("GG metadata transport liveness", () => {
  it.each(["headers", "body", "cancel"])(
    "releases single-flight after a host stalls %s and permits recovery",
    async (stage) => {
      vi.useFakeTimers();
      try {
        let fail = true;
        let cancellations = 0;
        const fetcher = vi.fn<typeof fetch>(
          async (url: string | URL | Request) => {
            if (!fail)
              return String(url).endsWith("operations.json")
                ? bundle()
                : response(String(url).endsWith("/models") ? [model()] : []);
            if (stage === "headers") return new Promise<Response>(() => {});
            const body = new ReadableStream<Uint8Array>({
              start(stream) {
                if (stage === "cancel")
                  stream.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              },
              cancel() {
                cancellations++;
                return new Promise<void>(() => {});
              },
            });
            return new Response(body, {
              headers: {
                "content-type": String(url).endsWith("operations.json")
                  ? "application/schema+json"
                  : "application/json",
              },
            });
          }
        );
        const store = new GGDiscoveryStore({ fetch: fetcher });
        const pending = store.ready();
        await vi.advanceTimersByTimeAsync(5001);
        expect(await pending).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(cancellations).toBe(stage === "headers" ? 0 : 3);
        fail = false;
        await vi.advanceTimersByTimeAsync(5001);
        expect((await store.ready())?.models[0].id).toBe("fixture/new-model");
        store.dispose();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("bounds a stream of immediately ready empty chunks", async () => {
    vi.useFakeTimers();
    try {
      let cancelled = 0;
      const fetcher = vi.fn<typeof fetch>(
        async (url: string | URL | Request) =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull(stream) {
                stream.enqueue(new Uint8Array());
              },
              cancel() {
                cancelled++;
              },
            }),
            {
              headers: {
                "content-type": String(url).endsWith("operations.json")
                  ? "application/schema+json"
                  : "application/json",
              },
            }
          )
      );
      const store = new GGDiscoveryStore({ fetch: fetcher });
      const pending = store.ready();
      await vi.advanceTimersByTimeAsync(5001);
      expect(await pending).toBeNull();
      expect(cancelled).toBe(3);
      store.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the public schema media type, not arbitrary JSON-looking content", async () => {
    const fetcher = source();
    const store = new GGDiscoveryStore({ fetch: fetcher });
    expect(await store.ready()).not.toBeNull();
    const schemaCall = (
      fetcher.mock.calls as unknown as [unknown, RequestInit][]
    ).find(([url]) => String(url).endsWith("operations.json"));
    expect(new Headers(schemaCall?.[1].headers).get("Accept")).toBe(
      "application/schema+json"
    );
    const wrong = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response("{}", {
            headers: { "content-type": "application/json-untrusted" },
          })
      ),
    });
    expect(await wrong.ready()).toBeNull();
  });
});

it("does not advertise text execution without trustworthy compaction limits", async () => {
  for (const value of [undefined, 0, 0.5]) {
    const incomplete = model();
    (
      incomplete.gg.limits as unknown as Record<string, unknown>
    ).max_output_tokens = value;
    if (value === undefined)
      delete (incomplete.gg.limits as unknown as Record<string, unknown>)
        .max_output_tokens;
    const store = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("operations.json")
          ? bundle()
          : response(String(url).endsWith("/models") ? [incomplete] : [])
      ),
    });
    await store.ready();
    expect(store.supports(incomplete.id, "chat.completions")).toBe(false);
  }
});

describe("current executable operation contracts", () => {
  it("admits only complete supported transport/result tuples for the current model", async () => {
    const current = model("fixture/image");
    current.gg.kind = "image";
    current.gg.interfaces = ["images.generations"];
    current.gg.operation_ids = [
      "image.fixture.good",
      "image.fixture.wrong-mode",
      "image.fixture.wrong-delivery",
      "image.fixture.wrong-model",
    ];
    const operation = {
      operation_id: "image.fixture.good",
      model_id: current.id,
      kind: "image",
      variant: "text",
      path: "/v1/images/generations",
      content_type: "application/json",
      request_view: "json",
      response_mode: "synchronous",
      delivery: "transient_base64",
      request_schema: { $ref: "#/$defs/Input" },
      result_schema: { $ref: "#/$defs/Result" },
    };
    const contracts = {
      $defs: {
        Input: {
          type: "object",
          required: ["model", "prompt"],
          properties: {
            model: { const: current.id },
            prompt: { type: "string" },
          },
        },
        OtherInput: {
          type: "object",
          required: ["model", "prompt"],
          properties: {
            model: { const: "fixture/other" },
            prompt: { type: "string" },
          },
        },
        Result: {
          type: "object",
          required: ["data"],
          properties: {
            data: {
              type: "array",
              items: {
                type: "object",
                required: ["b64_json"],
                properties: { b64_json: { type: "string" } },
              },
            },
          },
        },
      },
      "x-gg-operations": [
        operation,
        {
          ...operation,
          operation_id: "image.fixture.wrong-mode",
          response_mode: "job",
        },
        {
          ...operation,
          operation_id: "image.fixture.wrong-delivery",
          delivery: "provider_reference",
        },
        {
          ...operation,
          operation_id: "image.fixture.wrong-model",
          request_schema: { $ref: "#/$defs/OtherInput" },
        },
      ],
    };
    const store = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("operations.json")
          ? Response.json(contracts, {
              headers: { "content-type": "application/schema+json" },
            })
          : response(String(url).endsWith("/models") ? [current] : [])
      ),
    });
    expect((await store.ready())?.operations.map((item) => item.id)).toEqual([
      "image.fixture.good",
    ]);
  });
  it("withholds native prompt controls when a published operation requires another input", async () => {
    const { supportsGGPromptOperation } = await import("./gg-discovery");
    const { fixtureGGDiscovery } = await import("./testing/gg-discovery");
    const store = fixtureGGDiscovery([{ id: "fixture/image", kind: "image" }]);
    const operation = (await store.ready())!.operations[0];
    expect(supportsGGPromptOperation(operation)).toBe(true);
    expect(
      supportsGGPromptOperation({
        ...operation,
        input_schema: {
          ...operation.input_schema,
          required: ["prompt", "new_required_control"],
        },
      })
    ).toBe(false);
  });
});

describe("model-less feature discovery", () => {
  it("retains a structured free rig-check endpoint without rejecting the model catalogue", async () => {
    const endpoint = {
      id: "three-d.tripo.rig-check",
      object: "endpoint",
      model: null,
      operation: "three-d.tripo.rig-check",
      kind: "three-d",
      variant: "mesh",
      input_schema: {
        type: "object",
        required: ["mesh"],
        properties: { mesh: { type: "object" } },
      },
    };
    const bundle = {
      $defs: {},
      "x-gg-operations": [
        {
          operation_id: endpoint.operation,
          model_id: null,
          kind: "three-d",
          variant: "mesh",
        },
      ],
    };
    const store = new GGDiscoveryStore({
      fetch: vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("operations.json")
          ? Response.json(bundle, {
              headers: { "content-type": "application/schema+json" },
            })
          : response(
              String(url).endsWith("/endpoints") ? [endpoint] : [model()]
            )
      ),
    });
    const snapshot = await store.ready();
    expect(snapshot?.models).toHaveLength(1);
    expect(snapshot?.endpoints[0]).toMatchObject({
      id: endpoint.id,
      model: null,
    });
    expect(snapshot?.operations).toEqual([]);
  });
});

// Trimmed anonymous public responses preserve actual schema types, reference
// shapes and the model-less rig-check endpoint. They contain no credentials.
it("parses representative released public discovery documents together", async () => {
  const store = new GGDiscoveryStore({
    fetch: vi.fn<typeof fetch>(async (url) => {
      const schema = String(url).endsWith("operations.json");
      const document = schema
        ? publicWire.operations
        : String(url).endsWith("/models")
          ? publicWire.models
          : publicWire.endpoints;
      return Response.json(document, {
        headers: {
          "content-type": schema
            ? "application/schema+json; charset=utf-8"
            : "application/json",
        },
      });
    }),
  });
  const snapshot = await store.ready();
  expect(snapshot?.models).toHaveLength(publicWire.models.data.length);
  for (const operation of snapshot!.operations)
    expect(supportsGGPromptOperation(operation)).toBe(true);
  expect(snapshot?.operations.map((operation) => operation.model_id)).toEqual(
    expect.arrayContaining([
      "google/lyria-3",
      "google/gemini-nano-banana-2.1",
      "openai/gpt-image-2.6-flare",
    ])
  );
  expect(
    snapshot?.endpoints.some(
      (endpoint) =>
        endpoint.id === "three-d.tripo.rig-check" && endpoint.model === null
    )
  ).toBe(true);
});

describe("conservative executable schema admission", () => {
  it("expires an old operations bundle even when model listings are fresh", async () => {
    const metadata = ggContractFixture([
      { id: "fixture/image", kind: "image" },
    ]);
    let now = 0;
    const store = new GGDiscoveryStore({
      now: () => now,
      fetch: async (url) => {
        const response = metadata.response(url)!;
        if (String(url).endsWith("operations.json"))
          response.headers.set("age", "299");
        return response;
      },
    });
    expect((await store.ready())?.operations).toHaveLength(1);
    now = 1000;
    expect(store.view()).toBeNull();
  });
  it.each(["image", "video", "music"] as const)(
    "withholds changed %s payload representations before execution",
    async (kind) => {
      for (const broken of [
        "missing",
        "wrong-type",
        "not-required",
        "non-array",
      ]) {
        const metadata = ggContractFixture([{ id: "fixture/model", kind }]);
        const result = metadata.contracts.$defs[
          Object.keys(metadata.contracts.$defs).find((key) =>
            key.endsWith("_result")
          )!
        ] as {
          properties: Record<
            string,
            {
              type: string;
              required: string[];
              properties: Record<string, unknown>;
              items?: {
                type: string;
                required: string[];
                properties: Record<string, unknown>;
              };
            }
          >;
        };
        const field =
          kind === "image" ? "data" : kind === "video" ? "videos" : "audio";
        const item =
          kind === "music"
            ? result.properties[field]
            : result.properties[field].items!;
        const payload = kind === "image" ? "b64_json" : "url";
        if (broken === "missing") delete item.properties[payload];
        else if (broken === "wrong-type")
          item.properties[payload] = { type: "object" };
        else if (broken === "not-required") item.required = [];
        else result.properties[field].type = "string";
        const store = new GGDiscoveryStore({
          fetch: async (url) => metadata.response(url)!,
        });
        expect((await store.ready())?.operations).toEqual([]);
      }
    }
  );
  it("cannot hide a referenced required control or prompt type with a sibling", async () => {
    const { fixtureGGDiscovery } = await import("./testing/gg-discovery");
    const operation = (await fixtureGGDiscovery([
      { id: "fixture/image", kind: "image" },
    ]).ready())!.operations[0];
    const schema = operation.input_schema;
    expect(
      supportsGGPromptOperation({
        ...operation,
        input_schema: {
          ...schema,
          $defs: { RequiredControl: { required: ["extra_control"] } },
          allOf: [{ $ref: "#/$defs/RequiredControl", required: [] }],
        },
      })
    ).toBe(false);
    expect(
      supportsGGPromptOperation({
        ...operation,
        input_schema: {
          ...schema,
          $defs: { NonString: { type: "object" } },
          properties: {
            ...(schema.properties as object),
            prompt: { $ref: "#/$defs/NonString", type: "string" },
          },
        },
      })
    ).toBe(false);
    // Real released prompt shapes add a maximum alongside a nonblank string
    // reference. Non-conflicting sibling constraints remain usable.
    expect(
      supportsGGPromptOperation({
        ...operation,
        input_schema: {
          ...schema,
          $defs: { Nonblank: { type: "string", pattern: "\\S" } },
          properties: {
            ...(schema.properties as object),
            prompt: { $ref: "#/$defs/Nonblank", maxLength: 32000 },
          },
        },
      })
    ).toBe(true);
  });
  it("keeps root request-reference sibling requirements in native admission", async () => {
    const metadata = ggContractFixture([
      { id: "fixture/image", kind: "image" },
    ]);
    Object.assign(metadata.contracts["x-gg-operations"][0].request_schema, {
      allOf: [{ required: ["extra_control"] }],
    });
    const store = new GGDiscoveryStore({
      fetch: async (url) => metadata.response(url)!,
    });
    const operation = (await store.ready())!.operations[0];
    expect(operation).toBeDefined();
    expect(supportsGGPromptOperation(operation)).toBe(false);
  });
  it("withholds conflicting root input requirements and result MIME references", async () => {
    for (const kind of ["image", "music"] as const) {
      const metadata = ggContractFixture([{ id: "fixture/model", kind }]);
      const operation = metadata.contracts["x-gg-operations"][0];
      if (kind === "image")
        Object.assign(operation.request_schema, { required: [] });
      else {
        metadata.contracts.$defs.UnusableAudioType = { const: "audio/wav" };
        const result = metadata.contracts.$defs[
          operation.result_schema.$ref.slice(8)
        ] as { properties: { audio: { properties: Record<string, unknown> } } };
        result.properties.audio.properties.media_type = {
          $ref: "#/$defs/UnusableAudioType",
          const: "audio/mpeg",
        };
      }
      const store = new GGDiscoveryStore({
        fetch: async (url) => metadata.response(url)!,
      });
      expect((await store.ready())?.operations).toEqual([]);
    }
  });
  it("rejects unrepresentable prompt/start-image fields and composed required controls", async () => {
    const { fixtureGGDiscovery } = await import("./testing/gg-discovery");
    const operation = (await fixtureGGDiscovery([
      { id: "fixture/video", kind: "video", image: true },
    ]).ready())!.operations[1];
    expect(supportsGGPromptOperation(operation, true)).toBe(true);
    for (const override of [
      {
        properties: {
          ...(operation.input_schema.properties as object),
          prompt: { type: "object" },
        },
      },
      {
        properties: {
          ...(operation.input_schema.properties as object),
          image: { type: "object" },
        },
      },
      { allOf: [{ required: ["extra_required"] }] },
      {
        allOf: [
          {
            if: { required: ["fps"] },
            // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword, never a Promise continuation.
            then: { required: ["extra_required"] },
          },
        ],
      },
      {
        allOf: [
          {
            if: { required: ["prompt"] },
            // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword, never a Promise continuation.
            then: { required: ["extra_required"] },
          },
        ],
      },
      { oneOf: [{ required: ["prompt"] }, { required: ["extra_required"] }] },
    ]) {
      expect(
        supportsGGPromptOperation(
          {
            ...operation,
            input_schema: { ...operation.input_schema, ...override },
          },
          true
        )
      ).toBe(false);
    }
    // An animation-only conditional cannot apply to native prompt controls.
    expect(
      supportsGGPromptOperation(
        {
          ...operation,
          input_schema: {
            ...operation.input_schema,
            allOf: [
              {
                if: { required: ["frame_count"] },
                // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword, never a Promise continuation.
                then: { required: ["output_format"] },
              },
            ],
          },
        },
        true
      )
    ).toBe(true);
  });
});
