import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMaintenanceModeInstanceCache,
  DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS,
  maintenanceModeCacheTtlMs,
} from "./server-instance-cache";

const edge = vi.hoisted(() => ({
  get: vi.fn<(key: string) => Promise<unknown>>(),
}));
vi.mock("@vercel/edge-config", () => ({ get: edge.get }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(ttlMs = 1_000) {
  let time = 1_000_000;
  const read = vi.fn<() => Promise<unknown>>();
  const cache = createMaintenanceModeInstanceCache({
    read,
    ttlMs,
    now: () => time,
  });
  return {
    cache,
    read,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("maintenance mode server-instance cache", () => {
  it("reads on a cold cache", async () => {
    const { cache, read } = setup();
    read.mockResolvedValueOnce(true);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([true, false])("reuses a cached %s within the window", async (on) => {
    const { cache, read, advance } = setup(1_000);
    read.mockResolvedValue(on);
    await cache.isInMaintenanceMode();
    advance(999);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(on);
    expect(read).toHaveBeenCalledOnce();
  });

  it("treats a missing or non-boolean value by truthiness", async () => {
    const { cache, read } = setup(0);
    read.mockResolvedValueOnce(undefined).mockResolvedValueOnce("on");
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
  });

  it("reads again once the window has elapsed", async () => {
    const { cache, read, advance } = setup(1_000);
    read.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await cache.isInMaintenanceMode();
    advance(1_000);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("measures the window from when the read was issued", async () => {
    const { cache, read, advance } = setup(1_000);
    const slow = deferred<unknown>();
    read.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(false);
    const first = cache.isInMaintenanceMode();
    advance(600);
    slow.resolve(true);
    await first;
    advance(400);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not trust a value when the clock moves backwards", async () => {
    const { cache, read, advance } = setup(1_000);
    read.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await cache.isInMaintenanceMode();
    advance(-1);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent refreshes into one read", async () => {
    const { cache, read } = setup();
    const pending = deferred<unknown>();
    read.mockReturnValueOnce(pending.promise);
    const waiters = [1, 2, 3].map(() => cache.isInMaintenanceMode());
    pending.resolve(true);
    await expect(Promise.all(waiters)).resolves.toEqual([true, true, true]);
    expect(read).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent refreshes after expiry", async () => {
    const { cache, read, advance } = setup(1_000);
    const pending = deferred<unknown>();
    read.mockResolvedValueOnce(false).mockReturnValueOnce(pending.promise);
    await cache.isInMaintenanceMode();
    advance(1_000);
    const waiters = [cache.isInMaintenanceMode(), cache.isInMaintenanceMode()];
    pending.resolve(true);
    await expect(Promise.all(waiters)).resolves.toEqual([true, true]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rejects every waiter of a failed read and retries on the next call", async () => {
    const { cache, read } = setup();
    const pending = deferred<unknown>();
    const failure = new Error("edge config unavailable");
    read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(false);
    const waiters = [cache.isInMaintenanceMode(), cache.isInMaintenanceMode()];
    pending.reject(failure);
    for (const waiter of waiters) await expect(waiter).rejects.toBe(failure);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("clears in-flight state when the reader throws synchronously", async () => {
    const { cache, read } = setup();
    const failure = new Error("@vercel/edge-config: No connection string");
    read
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockResolvedValueOnce(true);
    await expect(cache.isInMaintenanceMode()).rejects.toBe(failure);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
  });

  it("does not serve a cached 'on' value after a failed refresh", async () => {
    const { cache, read, advance } = setup(1_000);
    const failure = new Error("edge config unavailable");
    read
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(false);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(true);
    advance(1_000);
    await expect(cache.isInMaintenanceMode()).rejects.toBe(failure);
    await expect(cache.isInMaintenanceMode()).resolves.toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("reads on every call when reuse is disabled", async () => {
    const { cache, read } = setup(0);
    read.mockResolvedValue(true);
    await cache.isInMaintenanceMode();
    await cache.isInMaintenanceMode();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps state independent between instances", async () => {
    const a = setup();
    const b = setup();
    a.read.mockResolvedValue(true);
    b.read.mockResolvedValue(false);
    await expect(a.cache.isInMaintenanceMode()).resolves.toBe(true);
    await expect(b.cache.isInMaintenanceMode()).resolves.toBe(false);
    await expect(a.cache.isInMaintenanceMode()).resolves.toBe(true);
    expect(a.read).toHaveBeenCalledOnce();
    expect(b.read).toHaveBeenCalledOnce();
  });
});

describe("maintenanceModeCacheTtlMs", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["60000", 60_000],
    [" 2500 ", 2_500],
  ])("accepts %j", (raw, expected) => {
    expect(maintenanceModeCacheTtlMs(raw)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "  ",
    "-1",
    "1.5",
    "1e3",
    "0x10",
    "+5",
    "10s",
    "Infinity",
    "NaN",
    "9007199254740993",
  ])("falls back to the default for %j", (raw) => {
    expect(maintenanceModeCacheTtlMs(raw)).toBe(
      DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS
    );
  });
});

describe("isInMaintenanceMode (Edge Config)", () => {
  beforeEach(() => {
    vi.resetModules();
    edge.get.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads IS_IN_MAINTENANCE_MODE once per window per module instance", async () => {
    vi.stubEnv("GRIDA_MAINTENANCE_MODE_CACHE_TTL_MS", "60000");
    edge.get.mockResolvedValue(true);
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await expect(isInMaintenanceMode()).resolves.toBe(true);
    await expect(isInMaintenanceMode()).resolves.toBe(true);
    expect(edge.get).toHaveBeenCalledOnce();
    expect(edge.get).toHaveBeenCalledWith("IS_IN_MAINTENANCE_MODE");
  });

  it("honours a disabled window", async () => {
    vi.stubEnv("GRIDA_MAINTENANCE_MODE_CACHE_TTL_MS", "0");
    edge.get.mockResolvedValue(false);
    const { isInMaintenanceMode } = await import("./server-instance-cache");
    await isInMaintenanceMode();
    await isInMaintenanceMode();
    expect(edge.get).toHaveBeenCalledTimes(2);
  });
});
