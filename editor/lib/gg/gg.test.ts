// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — membership, quota and signing are one producer policy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import type { GgTokens } from "./tokens";

const { signing, limiterConfig, limit, redis, rateLimit, slidingWindow } =
  vi.hoisted(() => ({
    signing:
      vi.fn<
        () => { current: Uint8Array | null; previous: Uint8Array | null }
      >(),
    limiterConfig: vi.fn<() => { url: string; token: string } | null>(),
    limit:
      vi.fn<(key: string) => Promise<{ success: boolean; reason?: string }>>(),
    redis: vi.fn<(config: unknown) => void>(),
    rateLimit: vi.fn<(config: unknown) => void>(),
    slidingWindow: vi.fn<(tokens: number, window: string) => unknown>(),
  }));
vi.mock("./config", () => ({ ggConfig: { signing, limiter: limiterConfig } }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(config: unknown) {
      redis(config);
    }
  },
}));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindow;
    constructor(config: unknown) {
      rateLimit(config);
    }
    limit = limit;
  },
}));

const SECRET = new TextEncoder().encode(
  "synthetic-gg-key-0123456789abcdef0123456789abcdef"
);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  signing.mockReturnValue({ current: SECRET, previous: null });
  limiterConfig.mockReturnValue({
    url: "https://limiter.test",
    token: "synthetic-only",
  });
  limit.mockResolvedValue({ success: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("gg.mint", () => {
  it("checks one user quota, then membership, then signs the projected organization", async () => {
    const { gg } = await import("./gg");
    const order: string[] = [];
    limit.mockImplementation(async (userId) => {
      order.push(`limit:${userId}`);
      return { success: true };
    });
    const organization = vi.fn<
      (userId: string) => Promise<{ id: number; name: string }>
    >(async (userId: string) => {
      order.push(`member:${userId}`);
      return { id: 7, name: "studio", private_field: "not-in-grant" };
    });
    const original = SignJWT.prototype.sign;
    vi.spyOn(SignJWT.prototype, "sign").mockImplementation(function (
      this: SignJWT,
      ...args
    ) {
      order.push("sign");
      return original.apply(this, args);
    });
    const result = await gg.mint({ id: "user-1" }, { organization });
    expect(order).toEqual(["limit:user-1", "member:user-1", "sign"]);
    expect(result.organization).toEqual({ id: 7, name: "studio" });
    expect(Object.keys(result)).toEqual([
      "token",
      "expires_at",
      "organization",
    ]);
    const claims = await gg.verify(
      new Request("https://grida.test", {
        headers: { authorization: `Bearer ${result.token}` },
      })
    );
    expect(claims).toMatchObject({ sub: "user-1", org: 7, aud: "gg:ai" });
    expect(claims.exp - claims.iat).toBe(900);
    expect(result.expires_at).toBe(new Date(claims.exp * 1000).toISOString());
  });

  it("denies before member lookup and signing when quota is exhausted", async () => {
    const { gg } = await import("./gg");
    limit.mockResolvedValue({ success: false });
    const organization = vi.fn<
      (userId: string) => Promise<{ id: number; name: string }>
    >(async () => ({ id: 7, name: "studio" }));
    const sign = vi.spyOn(SignJWT.prototype, "sign");
    await expect(
      gg.mint({ id: "user-1" }, { organization })
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(organization).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(signing).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: 0, name: "studio" },
    { id: 2 ** 53, name: "studio" },
    { id: 7, name: "" },
  ])(
    "does not sign without a valid member organization: %j",
    async (member) => {
      const { gg } = await import("./gg");
      const sign = vi.spyOn(SignJWT.prototype, "sign");
      await expect(
        gg.mint({ id: "user-1" }, { organization: async () => member })
      ).rejects.toMatchObject({
        code: member === null ? "no_organization" : "invalid_token",
      });
      expect(sign).not.toHaveBeenCalled();
      expect(signing).not.toHaveBeenCalled();
    }
  );

  it("propagates member failures to the host without signing", async () => {
    const { gg } = await import("./gg");
    const failure = new Error("synthetic lookup failure");
    const sign = vi.spyOn(SignJWT.prototype, "sign");
    await expect(
      gg.mint(
        { id: "user-1" },
        {
          organization: async () => {
            throw failure;
          },
        }
      )
    ).rejects.toBe(failure);
    expect(sign).not.toHaveBeenCalled();
  });

  it("uses the same per-user quota across different membership capabilities and compatibility exports", async () => {
    const { gg } = await import("./gg");
    const compatibility = await import("../auth/gg-token");
    expect(compatibility.allowGgTokenMint).toBe(gg.allowMint);
    expect(compatibility.signGgToken).toBe(gg.sign);
    expect(compatibility.verifyGgToken).toBe(gg.verify);
    expect(compatibility.GgTokenError).toBe(gg.TokenError);
    const used = new Map<string, number>();
    limit.mockImplementation(async (key) => {
      const count = (used.get(key) ?? 0) + 1;
      used.set(key, count);
      return { success: count <= 10 };
    });
    const first = { organization: async () => ({ id: 7, name: "one" }) };
    const second = { organization: async () => ({ id: 8, name: "two" }) };
    for (let index = 0; index < 10; index++)
      await gg.mint({ id: "user-1" }, index % 2 ? first : second);
    await expect(gg.mint({ id: "user-1" }, second)).rejects.toMatchObject({
      code: "rate_limited",
    });
    await expect(gg.mint({ id: "user-2" }, second)).resolves.toHaveProperty(
      "token"
    );
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "rl:v1-ai:mint", timeout: 5000 })
    );
    expect(slidingWindow).toHaveBeenCalledWith(10, "60 s");
  });

  it("initializes one limiter for concurrent calls", async () => {
    const { gg } = await import("./gg");
    await Promise.all([gg.allowMint("one"), gg.allowMint("two")]);
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(redis).toHaveBeenCalledOnce();
  });

  it("retains unconfigured-limiter behavior without constructing Redis", async () => {
    const { gg } = await import("./gg");
    limiterConfig.mockReturnValue(null);
    await expect(
      gg.mint(
        { id: "user-1" },
        { organization: async () => ({ id: 7, name: "studio" }) }
      )
    ).resolves.toHaveProperty("token");
    expect(redis).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });

  it.each(["timeout", "request", "initialization"])(
    "contains configured limiter %s failure before membership and signing",
    async (failure) => {
      const { gg } = await import("./gg");
      if (failure === "timeout")
        limit.mockResolvedValue({ success: true, reason: "timeout" });
      else if (failure === "request")
        limit.mockRejectedValue(new Error("private limiter credentials"));
      else
        redis.mockImplementationOnce(() => {
          throw new Error("private limiter credentials");
        });
      const organization = vi.fn<GgTokens.Membership["organization"]>(
        async () => ({ id: 7, name: "studio" })
      );
      const sign = vi.spyOn(SignJWT.prototype, "sign");
      const error = await gg
        .mint({ id: "user-1" }, { organization })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(gg.MintError);
      expect(error).toMatchObject({
        code: "unavailable",
        message: "unavailable",
      });
      expect(error).not.toHaveProperty("cause");
      expect(organization).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(signing).not.toHaveBeenCalled();
    }
  );

  it("allows a later caller to initialize after failure without retrying the failed request", async () => {
    const { gg } = await import("./gg");
    redis.mockImplementationOnce(() => {
      throw new Error("synthetic initialization failure");
    });
    await expect(gg.allowMint("user-1")).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(redis).toHaveBeenCalledOnce();
    expect(limit).not.toHaveBeenCalled();
    await expect(gg.allowMint("user-2")).resolves.toBe(true);
    expect(redis).toHaveBeenCalledTimes(2);
  });

  it("rejects the actual SDK timeout allowance and never mints on late Redis completion", async () => {
    const { Ratelimit } =
      await vi.importActual<typeof import("@upstash/ratelimit")>(
        "@upstash/ratelimit"
      );
    type Config = ConstructorParameters<typeof Ratelimit>[0];
    const started = Promise.withResolvers<void>();
    const evaluation = Promise.withResolvers<[number, number]>();
    const evalsha = vi.fn<() => Promise<[number, number]>>(() => {
      started.resolve();
      return evaluation.promise;
    });
    const responses: Array<{ success: boolean; reason?: string }> = [];
    rateLimit.mockImplementation((config) => {
      const sdk = new Ratelimit({
        ...(config as Config),
        redis: { evalsha } as unknown as Config["redis"],
        limiter: Ratelimit.slidingWindow(10, "60 s"),
      });
      limit.mockImplementation(async (key) => {
        const response = await sdk.limit(key);
        responses.push(response);
        return response;
      });
    });
    const { gg } = await import("./gg");
    const organization = vi.fn<GgTokens.Membership["organization"]>(
      async () => ({ id: 7, name: "studio" })
    );
    const sign = vi.spyOn(SignJWT.prototype, "sign");
    vi.useFakeTimers();
    const mint = gg
      .mint({ id: "user-1" }, { organization })
      .catch((error: unknown) => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(4999);
    expect(responses).toEqual([]);
    expect(organization).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await mint).toMatchObject({ code: "unavailable" });
    expect(responses).toEqual([
      expect.objectContaining({ success: true, reason: "timeout" }),
    ]);
    evaluation.resolve([9, 10]);
    await vi.advanceTimersByTimeAsync(0);
    expect(evalsha).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(organization).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(signing).not.toHaveBeenCalled();
  });

  it("requires the current signing key even if a previous key exists", async () => {
    const { gg } = await import("./gg");
    signing.mockReturnValue({ current: null, previous: SECRET });
    const sign = vi.spyOn(SignJWT.prototype, "sign");
    await expect(
      gg.mint(
        { id: "user-1" },
        { organization: async () => ({ id: 7, name: "studio" }) }
      )
    ).rejects.toMatchObject({ code: "not_configured" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("rejects an empty principal before quota or membership", async () => {
    const { gg } = await import("./gg");
    const organization = vi.fn<
      (userId: string) => Promise<{ id: number; name: string }>
    >(async () => ({ id: 7, name: "studio" }));
    await expect(gg.mint({ id: "" }, { organization })).rejects.toMatchObject({
      code: "invalid_token",
    });
    expect(organization).not.toHaveBeenCalled();
    expect(limiterConfig).not.toHaveBeenCalled();
  });
});
