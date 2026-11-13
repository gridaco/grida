import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TTL_MS,
  createMaintenanceModeServerInstanceCache,
  parseTtlMs,
  TTL_MS_ENV,
} from "./server-instance-cache";

const edge = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
}));
vi.mock("@vercel/edge-config", () => ({ get: edge.get }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(ttlMs = 1_000) {
  let time = 0;
  const read = vi.fn<() => Promise<unknown>>();
  const cache = createMaintenanceModeServerInstanceCache({
    read,
    ttlMs,
    now: () => time,
  });
  return {
    cache,
    read,
    advance(ms: number) {
      time += ms;
    },
  };
}

describe("parseTtlMs", () => {
  it.each([
    [undefined, DEFAULT_TTL_MS],
    ["", DEFAULT_TTL_MS],
    ["  ", DEFAULT_TTL_MS],
    ["0", 0],
    ["60000", 60_000],
    [" 2500 ", 2_500],
  ])("accepts %j as %d", (value, expected) => {
    expect(parseTtlMs(value)).toBe(expected);
  });

  it.each([
    "-1",
    "1.5",
    "1e3",
    "10s",
    "0x10",
    "Infinity",
    "NaN",
    "9".repeat(20),
  ])("rejects %j", (value) => {
    expect(parseTtlMs(value)).toBeNull();
  });
});

describe("createMaintenanceModeServerInstanceCache", () => {
  it("reads on a cold cache", async () => {
    const { cache, read } = harness();
    read.mockResolvedValueOnce(true);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([true, false, undefined])(
    "reuses a successful %j value within the TTL",
    async (value) => {
      const { cache, read, advance } = harness(1_000);
      read.mockResolvedValue(value);
      await cache.isInMaintenanceMode();
      advance(999);
      await expect(cache.isInMaintenanceMode()).resolves.toBe(Boolean(value));
      expect(read).toHaveBeenCalledOnce();
    }
  );

  it("reads again once the TTL has elapsed", async () => {
    const { cache, read, advance } = harness(1_000);
    read.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    advance(1_000);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("measures the TTL from when the read started", async () => {
    const { cache, read, advance } = harness(1_000);
    const pending = deferred<boolean>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(false);
    const first = cache.isInMaintenanceMode();
    advance(600);
    pending.resolve(true);
    await expect(first).resolves.toBe(true);
    advance(400);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent refreshes into one read", async () => {
    const { cache, read } = harness();
    const pending = deferred<boolean>();
    read.mockReturnValueOnce(pending.promise);
    const results = Array.from({ length: 5 }, () =>
      cache.isInMaintenanceMode()
    );
    pending.resolve(true);
    await expect(Promise.all(results)).resolves.toEqual(Array(5).fill(true));
    expect(read).toHaveBeenCalledOnce();
  });

  it("shares a failed read with concurrent callers, then retries", async () => {
    const { cache, read } = harness();
    const pending = deferred<boolean>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(false);
    const results = [cache.isInMaintenanceMode(), cache.isInMaintenanceMode()];
    pending.reject(new Error("edge config unavailable"));
    for (const result of results) {
      await expect(result).rejects.toThrow("edge config unavailable");
    }
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never caches errors", async () => {
    const { cache, read } = harness();
    read
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce(true);
    await expect(cache.isInMaintenanceMode()).rejects.toThrow("first");
    await expect(cache.isInMaintenanceMode()).rejects.toThrow("second");
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not serve a stale maintenance-on value after a failed refresh", async () => {
    const { cache, read, advance } = harness(1_000);
    read
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("edge config unavailable"))
      .mockResolvedValueOnce(false);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    advance(1_000);
    await expect(cache.isInMaintenanceMode()).rejects.toThrow(
      "edge config unavailable"
    );
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("recovers when the reader throws synchronously", async () => {
    const { cache, read } = harness();
    read
      .mockImplementationOnce(() => {
        throw new Error("missing connection string");
      })
      .mockResolvedValueOnce(true);
    await expect(cache.isInMaintenanceMode()).rejects.toThrow(
      "missing connection string"
    );
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
  });

  it("reads on every sequential request when disabled with a zero TTL", async () => {
    const { cache, read } = harness(0);
    read.mockResolvedValue(false);
    for (let i = 0; i < 3; i++) await cache.isInMaintenanceMode();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("keeps independent state per instance", async () => {
    const a = harness();
    const b = harness();
    a.read.mockResolvedValue(true);
    b.read.mockResolvedValue(false);
    await expect(a.cache.isInMaintenanceMode()).resolves.toBe(true);
    await expect(b.cache.isInMaintenanceMode()).resolves.toBe(false);
    await expect(a.cache.isInMaintenanceMode()).resolves.toBe(true);
    await expect(b.cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(a.read).toHaveBeenCalledOnce();
    expect(b.read).toHaveBeenCalledOnce();
  });
});

describe("isInMaintenanceMode (process instance)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["performance"] });
    edge.get.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads IS_IN_MAINTENANCE_MODE and reuses it for the default TTL", async () => {
    vi.stubEnv(TTL_MS_ENV, undefined);
    edge.get.mockResolvedValue(true);
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await expect(isInMaintenanceMode()).resolves.toBe(true);
    vi.advanceTimersByTime(DEFAULT_TTL_MS - 1);
    await expect(isInMaintenanceMode()).resolves.toBe(true);
    expect(edge.get).toHaveBeenCalledOnce();
    expect(edge.get).toHaveBeenCalledWith("IS_IN_MAINTENANCE_MODE");
    vi.advanceTimersByTime(1);
    await isInMaintenanceMode();
    expect(edge.get).toHaveBeenCalledTimes(2);
  });

  it("honors a configured TTL", async () => {
    vi.stubEnv(TTL_MS_ENV, "0");
    edge.get.mockResolvedValue(false);
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await isInMaintenanceMode();
    await isInMaintenanceMode();
    expect(edge.get).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default TTL without echoing an invalid value", async () => {
    vi.stubEnv(TTL_MS_ENV, "secret-looking-value");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    edge.get.mockResolvedValue(false);
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await isInMaintenanceMode();
    vi.advanceTimersByTime(DEFAULT_TTL_MS - 1);
    await isInMaintenanceMode();
    expect(edge.get).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain(TTL_MS_ENV);
    expect(String(warn.mock.calls[0][0])).not.toContain("secret-looking-value");
  });

  it("propagates Edge Config errors to the caller", async () => {
    edge.get.mockRejectedValue(new Error("No connection string provided"));
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await expect(isInMaintenanceMode()).rejects.toThrow(
      "No connection string provided"
    );
  });
});
