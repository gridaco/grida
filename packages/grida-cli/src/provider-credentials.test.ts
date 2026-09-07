// GRIDA-SEC-013 — explicit CLI BYOK custody and safe presence-only output.
import { Readable } from "node:stream";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentials } from "./provider-credentials";

const secret = "synthetic-provider-key";
const bytes = (value: string) => Buffer.from(value);
const stream = (...values: string[]) => Readable.from(values.map(bytes));
const openStdin = (input: AsyncIterable<Uint8Array>, signal?: AbortSignal) =>
  ProviderCredentials.open({
    env: {},
    stdin: { provider: "fal", input },
    signal,
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProviderCredentials environment", () => {
  it("reads only the four exact supported environment names", async () => {
    const env = {
      OPENROUTER_API_KEY: " openrouter-synthetic \n",
      AI_GATEWAY_API_KEY: "gateway-synthetic",
      FAL_KEY: "fal-synthetic",
      ELEVENLABS_API_KEY: "elevenlabs-synthetic",
      BYOK_OPENROUTER_API_KEY: "legacy-ignored",
      GRIDA_BYOK_KEY: "legacy-ignored",
      GG_TOKEN: "wrong-authority",
    };
    Object.defineProperty(env, "HOME", {
      get() {
        throw new Error(secret);
      },
    });
    const owner = await ProviderCredentials.open({ env });
    expect(owner.status()).toEqual([
      {
        provider: "openrouter",
        environment: "OPENROUTER_API_KEY",
        configured: true,
        source: "environment",
      },
      {
        provider: "vercel",
        environment: "AI_GATEWAY_API_KEY",
        configured: true,
        source: "environment",
      },
      {
        provider: "fal",
        environment: "FAL_KEY",
        configured: true,
        source: "environment",
      },
      {
        provider: "elevenlabs",
        environment: "ELEVENLABS_API_KEY",
        configured: true,
        source: "environment",
      },
    ]);
    expect(owner.get("openrouter")).toBe("openrouter-synthetic");
    expect(owner.get("vercel")).toBe("gateway-synthetic");
    expect(owner.get("fal")).toBe("fal-synthetic");
    expect(owner.get("elevenlabs")).toBe("elevenlabs-synthetic");
  });

  it("does not adopt inherited environment values or legacy aliases", async () => {
    const env = Object.create({ OPENROUTER_API_KEY: secret });
    env.GRIDA_BYOK_KEY = secret;
    env.BYOK_OPENROUTER_API_KEY = secret;
    const owner = await ProviderCredentials.open({ env });
    expect(owner.status().every((value) => !value.configured)).toBe(true);
  });

  it("treats missing and blank environment keys as absent", async () => {
    const owner = await ProviderCredentials.open({
      env: { FAL_KEY: "\t \r\n" },
    });
    expect(owner.get("fal")).toBeNull();
    expect(owner.status().every((value) => value.source === null)).toBe(true);
  });

  it("snapshots each selected environment getter once", async () => {
    let reads = 0;
    const env = {
      get FAL_KEY() {
        return ++reads === 1 ? secret : "changed";
      },
    };
    const owner = await ProviderCredentials.open({ env });
    expect(owner.get("fal")).toBe(secret);
    expect(owner.get("fal")).toBe(secret);
    expect(reads).toBe(1);
  });

  it("reads only an explicitly selected provider and leaves other slots uninspected", async () => {
    const unrelated = vi.fn<() => string>(() => {
      throw new Error("unrelated malformed credential");
    });
    const owner = await ProviderCredentials.open({
      provider: "fal",
      env: {
        FAL_KEY: secret,
        get OPENROUTER_API_KEY() {
          return unrelated();
        },
        AI_GATEWAY_API_KEY: "unused-valid-key",
      },
    });
    expect(owner.get("fal")).toBe(secret);
    expect(owner.get("vercel")).toBeNull();
    expect(unrelated).not.toHaveBeenCalled();
    expect(
      owner
        .status()
        .filter((value) => value.configured)
        .map((value) => value.provider)
    ).toEqual(["fal"]);
    expect(
      owner
        .status()
        .filter((value) => value.provider !== "fal")
        .every((value) => value.source === null)
    ).toBe(true);
  });

  it.each(["a b", "a\nb", "a\u0000b", "a\u007fb", "é", "x".repeat(4097)])(
    "rejects malformed or oversized environment credentials without forwarding them",
    async (value) => {
      await expect(
        ProviderCredentials.open({ env: { FAL_KEY: value } })
      ).rejects.toMatchObject({ code: "invalid_credentials" });
    }
  );

  it("accepts an exact 4 KiB ASCII key", async () => {
    const owner = await ProviderCredentials.open({
      env: { FAL_KEY: "k".repeat(4096) },
    });
    expect(owner.get("fal")).toHaveLength(4096);
  });

  it("returns only frozen presence metadata and drops private references on disposal", async () => {
    const owner = await ProviderCredentials.open({ env: { FAL_KEY: secret } });
    const reader = owner.get.bind(owner);
    const status = owner.status();
    expect(Object.isFrozen(status)).toBe(true);
    expect(status.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(status)).not.toContain(secret);
    expect(JSON.stringify(owner)).toBe("{}");
    expect(inspect(owner)).not.toContain(secret);
    owner.dispose();
    owner.dispose();
    expect(reader("fal")).toBeNull();
    expect(
      owner
        .status()
        .every((value) => !value.configured && value.source === null)
    ).toBe(true);
  });

  it("refuses GG, arbitrary names, and prototype keys as BYOK providers", async () => {
    const owner = await ProviderCredentials.open({ env: {} });
    for (const provider of ["gg", "custom", "__proto__", "constructor"]) {
      expect(() => owner.get(provider as ProviderCredentials.Provider)).toThrow(
        ProviderCredentials.Failure
      );
    }
  });

  it("contains thrown environment errors without retaining their message or cause", async () => {
    const env = {
      get FAL_KEY(): string {
        throw new Error(secret);
      },
    };
    const failure = await ProviderCredentials.open({ env }).catch(
      (error) => error
    );
    expect(failure).toBeInstanceOf(ProviderCredentials.Failure);
    expect(failure.code).toBe("credentials_unavailable");
    expect(inspect(failure)).not.toContain(secret);
    expect(failure.cause).toBeUndefined();
  });
});

describe("ProviderCredentials explicit stdin", () => {
  it("replaces only the selected environment slot and preserves other providers", async () => {
    const owner = await ProviderCredentials.open({
      env: {
        get FAL_KEY(): string {
          throw new Error("overridden slot must not be read");
        },
        OPENROUTER_API_KEY: "separate-key",
      },
      stdin: { provider: "fal", input: stream("  ", secret, "\n") },
    });
    expect(owner.get("fal")).toBe(secret);
    expect(owner.get("openrouter")).toBe("separate-key");
    expect(
      owner.status().find((value) => value.provider === "fal")?.source
    ).toBe("stdin");
  });

  it.each(
    [[], [" \n"], ["a\nb"], ["x".repeat(4097)]].map((chunks) => ({ chunks }))
  )("rejects empty, multiline or oversized stdin keys", async ({ chunks }) => {
    await expect(openStdin(stream(...chunks))).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("counts raw input bytes before trimming and cancels an overflowing stream", async () => {
    const input = stream("x".repeat(4096), "\n", "never-needed");
    await expect(openStdin(input)).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(input.destroyed).toBe(true);
  });

  it("refuses unsupported stdin provider selection before reading input", async () => {
    const next = vi.fn<AsyncIterator<Uint8Array>["next"]>();
    const input = { [Symbol.asyncIterator]: () => ({ next }) };
    await expect(
      ProviderCredentials.open({
        env: {},
        stdin: { provider: "gg" as ProviderCredentials.Provider, input },
      })
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(next).not.toHaveBeenCalled();
  });

  it("refuses a stdin provider that differs from the explicit scope before any key read", async () => {
    const input = stream(secret);
    const environment = vi.fn<() => string>(() => secret);
    await expect(
      ProviderCredentials.open({
        provider: "fal",
        env: {
          get FAL_KEY() {
            return environment();
          },
        },
        stdin: { provider: "elevenlabs", input },
      })
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(environment).not.toHaveBeenCalled();
    expect(input.readableDidRead).toBe(false);
    input.destroy();
  });

  it("contains a rejected input iterator and never logs its diagnostics", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const input = {
      async *[Symbol.asyncIterator]() {
        throw new Error(secret);
        yield bytes("");
      },
    };
    const failure = await openStdin(input).catch((value) => value);
    expect(failure.code).toBe("credentials_unavailable");
    expect(inspect(failure)).not.toContain(secret);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses pre-aborted input before obtaining an iterator", async () => {
    const controller = new AbortController();
    controller.abort();
    const iterate = vi.fn<() => AsyncIterator<Uint8Array>>();
    await expect(
      openStdin({ [Symbol.asyncIterator]: iterate }, controller.signal)
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(iterate).not.toHaveBeenCalled();
  });

  it("settles cancellation even if pending read and cleanup never settle", async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const close = vi.fn<NonNullable<AsyncIterator<Uint8Array>["return"]>>(
      () => new Promise(() => {})
    );
    const input = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            started.resolve();
            return new Promise<IteratorResult<Uint8Array>>(() => {});
          },
          return: close,
        };
      },
    };
    const pending = openStdin(input, controller.signal);
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("observes a rejection returned by an iterator that synchronously aborts", async () => {
    const controller = new AbortController();
    const input = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            controller.abort();
            return Promise.reject(new Error(secret));
          },
        };
      },
    };
    await expect(openStdin(input, controller.signal)).rejects.toMatchObject({
      code: "cancelled",
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it("bounds a stalled input read to 30 seconds", async () => {
    vi.useFakeTimers();
    const close = vi.fn<NonNullable<AsyncIterator<Uint8Array>["return"]>>(
      async () => ({ done: true, value: undefined })
    );
    const input = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
        return: close,
      }),
    };
    const pending = openStdin(input).catch((error) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toMatchObject({ code: "credentials_unavailable" });
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let ready empty chunks starve cancellation", async () => {
    const controller = new AbortController();
    let pulls = 0;
    const input = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            if (++pulls > 256) throw new Error("bounded fixture exhausted");
            return { done: false, value: bytes("") };
          },
        };
      },
    };
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(openStdin(input, controller.signal)).rejects.toMatchObject({
        code: "cancelled",
      });
      expect(pulls).toBeLessThan(130);
    } finally {
      clearTimeout(timer);
    }
  });
});
