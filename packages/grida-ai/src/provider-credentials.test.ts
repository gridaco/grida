// GRIDA-SEC-004 — first-party admission, fixed credential egress, bounded safe results.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp } from "./http";
import { ProviderCredentials, type ByokProviderId } from "./providers";

const keys = {
  openrouter: "sk-or-synthetic-short",
  vercel: "vck_synthetic-short",
  fal: "synthetic-id:synthetic-secret",
  elevenlabs: "synthetic-opaque",
} satisfies Record<ByokProviderId, string>;

const successes = {
  openrouter: { data: { is_management_key: false, label: "private-label" } },
  vercel: { balance: "0", total_used: "123.4" },
  fal: {
    prices: [
      {
        endpoint_id: "fal-ai/flux/dev",
        unit_price: 0,
        unit: "image",
        currency: "USD",
      },
    ],
    next_cursor: null,
    has_more: false,
  },
};

function setup(
  request: typeof fetch = async () => Response.json(successes.openrouter)
) {
  const transport = vi.fn<typeof fetch>(request);
  const download = vi.fn<typeof fetch>();
  const http = new ProviderHttp({ request: transport, download });
  return { client: new ProviderCredentials({ http }), transport, download };
}

function check(
  client: ProviderCredentials,
  provider: ByokProviderId = "openrouter",
  signal?: AbortSignal
) {
  return client.check({ provider, key: keys[provider], signal });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ProviderCredentials.normalize", () => {
  it("normalizes outer framing without constructing authority or reading the environment", () => {
    const ambient = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", ambient);
    const { transport, download } = setup();
    for (const provider of Object.keys(keys) as ByokProviderId[]) {
      expect(
        ProviderCredentials.normalize(provider, ` \r\n${keys[provider]}\t `)
      ).toBe(keys[provider]);
    }
    expect(ambient).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    12,
    {},
    [],
    "",
    " ",
    "x y",
    "x\ny",
    "x\ty",
    "x\0y",
    "x\x7fy",
    "日本語",
  ])("rejects non-token input without echoing it (%j)", (value) => {
    expect(() => ProviderCredentials.normalize("elevenlabs", value)).toThrow(
      "invalid_input"
    );
  });

  it("bounds the original UTF-8 bytes before trimming", () => {
    expect(
      ProviderCredentials.normalize("elevenlabs", "x".repeat(4096))
    ).toHaveLength(4096);
    expect(() =>
      ProviderCredentials.normalize("elevenlabs", " ".repeat(4096) + "x")
    ).toThrow("invalid_input");
    expect(() =>
      ProviderCredentials.normalize("elevenlabs", "\u2000".repeat(1400) + "x")
    ).toThrow("invalid_input");
  });

  it.each([
    "PASTE_OPENROUTER_KEY_HERE",
    "paste_vercel_key_here",
    "PaStE_FAL_KeY_HERE",
    "PASTE_ELEVENLABS_KEY_HERE",
  ])("rejects an obvious template for every provider (%s)", (value) => {
    for (const provider of Object.keys(keys) as ByokProviderId[])
      expect(() => ProviderCredentials.normalize(provider, value)).toThrow(
        "invalid_input"
      );
  });

  it.each(["sk-or-a", "sk-or-v99-not_hex", "sk-or-" + "z".repeat(70)])(
    "admits the documented OpenRouter prefix without inventing a suffix grammar (%s)",
    (value) => {
      expect(ProviderCredentials.normalize("openrouter", value)).toBe(value);
    }
  );

  it.each(["sk-or-", "sk-openai-synthetic", "vck_synthetic", "id:secret"])(
    "refuses missing or empty OpenRouter identity (%s)",
    (value) => {
      expect(() => ProviderCredentials.normalize("openrouter", value)).toThrow(
        "invalid_input"
      );
    }
  );

  it("admits current and opaque legacy Vercel keys without declaring them authenticated", () => {
    for (const value of [
      "vck_x",
      "vck_nonstandard!suffix",
      "opaque-legacy-key",
    ])
      expect(ProviderCredentials.normalize("vercel", value)).toBe(value);
    expect(() => ProviderCredentials.normalize("vercel", "vck_")).toThrow(
      "invalid_input"
    );
  });

  it.each([":", ":secret", "id:", "id", "id:secret:extra"])(
    "requires both components of a single fal full key (%s)",
    (value) => {
      expect(() => ProviderCredentials.normalize("fal", value)).toThrow(
        "invalid_input"
      );
    }
  );

  it("does not invent fal component or ElevenLabs prefix constraints", () => {
    expect(ProviderCredentials.normalize("fal", "a:b!?")).toBe("a:b!?");
    expect(ProviderCredentials.normalize("elevenlabs", "a")).toBe("a");
    expect(ProviderCredentials.normalize("elevenlabs", "vck_opaque")).toBe(
      "vck_opaque"
    );
  });

  it("refuses provider aliases and custom endpoints at runtime", () => {
    expect(() =>
      ProviderCredentials.normalize("custom" as ByokProviderId, "opaque")
    ).toThrow("invalid_input");
  });
});

describe("ProviderCredentials.check", () => {
  it.each([
    ["openrouter", "https://openrouter.ai/api/v1/key", "Bearer"],
    ["vercel", "https://ai-gateway.vercel.sh/v1/credits", "Bearer"],
    [
      "fal",
      "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
      "Key",
    ],
  ] as const)(
    "checks %s through one fixed credential-bearing GET and discards metadata",
    async (provider, url, scheme) => {
      const { client, transport, download } = setup(async () =>
        Response.json(successes[provider])
      );
      const result = await client.check({
        provider,
        key: ` ${keys[provider]}\n`,
      });
      expect(result).toEqual({ status: "accepted" });
      expect(Object.isFrozen(result)).toBe(true);
      expect(transport).toHaveBeenCalledExactlyOnceWith(url, {
        method: "GET",
        headers: {
          Authorization: `${scheme} ${keys[provider]}`,
          Accept: "application/json",
        },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
      });
      expect(download).not.toHaveBeenCalled();
    }
  );

  it("normalizes again before any explicit check can submit", async () => {
    const { client, transport } = setup();
    await expect(
      client.check({ provider: "openrouter", key: "wrong" })
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("reports ElevenLabs unsupported without any request", async () => {
    const { client, transport, download } = setup();
    await expect(check(client, "elevenlabs")).resolves.toEqual({
      status: "not_supported",
    });
    expect(transport).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("accepts a Vercel legacy key only when the explicit check succeeds", async () => {
    const { client } = setup(async () => Response.json(successes.vercel));
    await expect(
      client.check({ provider: "vercel", key: "opaque-legacy-key" })
    ).resolves.toEqual({ status: "accepted" });
  });

  it.each([
    [401, "credential_rejected"],
    [403, "access_denied"],
    [429, "unavailable"],
    [500, "unavailable"],
    [204, "unavailable"],
  ] as const)(
    "maps HTTP %i without reading or returning upstream error text",
    async (status, code) => {
      const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
      const { client, transport } = setup(
        async () =>
          new Response(status === 204 ? null : new ReadableStream({ cancel }), {
            status,
            statusText: "credential=HOSTILE_SECRET",
            headers: { "content-length": "999999" },
          })
      );
      const error = await check(client).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(ProviderCredentials.Failure);
      expect(error).toMatchObject({ code, message: code });
      expect(JSON.stringify(error)).not.toContain("HOSTILE_SECRET");
      expect(error).not.toHaveProperty("cause");
      expect(transport).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledTimes(status === 204 ? 0 : 1);
    }
  );

  it("rejects OpenRouter management credentials without requiring a positive balance", async () => {
    const { client } = setup(async () =>
      Response.json({ data: { is_management_key: true } })
    );
    await expect(check(client)).rejects.toMatchObject({
      code: "credential_rejected",
    });
  });

  it.each([
    ["openrouter", {}],
    ["openrouter", { data: [] }],
    ["openrouter", { data: { is_management_key: "false" } }],
    ["vercel", { balance: 0, total_used: "0" }],
    ["vercel", { balance: "", total_used: "0" }],
    ["vercel", { balance: "Infinity", total_used: "0" }],
    ["vercel", { balance: "0", total_used: "0x10" }],
    ["fal", { prices: [] }],
    [
      "fal",
      {
        prices: [
          {
            endpoint_id: "fal-ai/other",
            unit_price: 1,
            unit: "image",
            currency: "USD",
          },
        ],
      },
    ],
    [
      "fal",
      {
        prices: [
          {
            endpoint_id: "fal-ai/flux/dev",
            unit_price: "0",
            unit: "image",
            currency: "USD",
          },
        ],
      },
    ],
  ] as const)(
    "rejects a public-looking 200 that does not prove the %s check",
    async (provider, data) => {
      const { client } = setup(async () => Response.json(data));
      await expect(check(client, provider)).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  );

  it.each([
    "<html>ok</html>",
    "{private_invalid_json",
    Uint8Array.from([0xff, 0xfe]),
  ])(
    "rejects invalid JSON and invalid UTF-8 without echoing content",
    async (body) => {
      const { client } = setup(async () => new Response(body));
      await expect(check(client)).rejects.toMatchObject({
        code: "invalid_response",
        message: "invalid_response",
      });
    }
  );

  it.each(["declared", "streamed"])(
    "bounds %s success bodies and cancels without awaiting the source",
    async (mode) => {
      const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (mode === "streamed") controller.enqueue(new Uint8Array(65537));
          },
          cancel,
        }),
        { headers: mode === "declared" ? { "content-length": "65537" } : {} }
      );
      const { client } = setup(async () => response);
      await expect(check(client)).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(response.body!.locked).toBe(false);
    }
  );

  it.each(["status", "redirected", "url", "opaque"])(
    "rejects a redirect represented by %s",
    async (mode) => {
      const cancel = vi.fn<() => void>();
      const response = new Response(new ReadableStream({ cancel }), {
        status: mode === "status" ? 302 : 200,
      });
      if (mode === "redirected")
        Object.defineProperty(response, "redirected", { value: true });
      if (mode === "url")
        Object.defineProperty(response, "url", {
          value: "https://other.example/check",
        });
      if (mode === "opaque")
        Object.defineProperty(response, "type", { value: "opaqueredirect" });
      const { client, transport } = setup(async () => response);
      await expect(check(client)).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledOnce();
    }
  );

  it("never trusts a host exception or impersonated public failure", async () => {
    for (const error of [
      new Error("HOSTILE_SECRET"),
      new ProviderCredentials.Failure(
        "HOSTILE_SECRET" as ProviderCredentials.FailureCode
      ),
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("HOSTILE_SECRET");
          },
          get() {
            throw new Error("HOSTILE_SECRET");
          },
        }
      ),
    ]) {
      const { client } = setup(async () => {
        throw error;
      });
      await expect(check(client)).rejects.toMatchObject({
        code: "unavailable",
        message: "unavailable",
      });
    }
  });

  it("aborts before provider I/O, including an unsupported check", async () => {
    const { client, transport } = setup();
    const signal = AbortSignal.abort("HOSTILE_SECRET");
    for (const provider of ["openrouter", "elevenlabs"] as const)
      await expect(check(client, provider, signal)).rejects.toMatchObject({
        code: "aborted",
        message: "aborted",
      });
    expect(transport).not.toHaveBeenCalled();
  });

  it("settles a transport that ignores cancellation and cancels its late body", async () => {
    const controller = new AbortController();
    const cancel = vi.fn<() => void>();
    let finish!: (response: Response) => void;
    const { client, transport } = setup(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const run = check(client, "openrouter", controller.signal);
    controller.abort("HOSTILE_SECRET");
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    finish(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it.each(["transport", "body"])(
    "enforces one ten-second deadline even when the %s stalls",
    async (mode) => {
      vi.useFakeTimers();
      const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
      const response = new Response(new ReadableStream({ pull() {}, cancel }));
      const { client, transport } = setup(() =>
        mode === "transport" ? new Promise(() => {}) : Promise.resolve(response)
      );
      const result = check(client).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await result).toMatchObject({
        code: "timeout",
        message: "timeout",
      });
      expect(transport).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledTimes(mode === "body" ? 1 : 0);
      expect(response.body!.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("releases external abort listeners and its private deadline after success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const { client } = setup();
    await check(client, "openrouter", controller.signal);
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("admits the exact response-byte ceiling", async () => {
    const json = JSON.stringify(successes.openrouter);
    const { client } = setup(async () => new Response(json.padEnd(65536, " ")));
    await expect(check(client)).resolves.toEqual({ status: "accepted" });
  });

  it("checks the monotonic deadline before retaining a late response", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const cancel = vi.fn<() => void>();
    const { client } = setup(async () => {
      now.mockReturnValue(10_001);
      return new Response(new ReadableStream({ cancel }));
    });
    await expect(check(client)).rejects.toMatchObject({ code: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("lets cancellation interrupt an endlessly ready empty response stream", async () => {
    const controller = new AbortController();
    const cancel = vi.fn<() => void>();
    let pulls = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(stream) {
          // A regressed yield must fail this fixture, not starve the runner's
          // own timeout by generating an infinite chain of microtasks.
          if (++pulls >= 256) {
            stream.close();
            return;
          }
          stream.enqueue(new Uint8Array());
        },
        cancel,
      })
    );
    const { client } = setup(async () => response);
    const run = check(client, "openrouter", controller.signal);
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(run).rejects.toMatchObject({ code: "aborted" });
    } finally {
      clearTimeout(timer);
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
    expect(pulls).toBeLessThan(256);
  });
});
