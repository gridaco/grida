/**
 * @fileoverview
 * Server-instance cache for the `IS_IN_MAINTENANCE_MODE` Edge Config flag that
 * `proxy.ts` checks on every production web request.
 *
 * Scope — read before reusing this for anything else:
 * - State lives only in memory, in module scope of the current server runtime
 *   instance, and is reused only by requests that instance handles.
 * - It is not a browser cache, a persistent store, or a globally shared or
 *   distributed cache. Nothing is written to response headers or storage.
 * - Reuse is best effort. Cold starts, restarts, and every instance and region
 *   keep independent state; instance reuse is never guaranteed, so each one
 *   still issues its own first read.
 *
 * Behaviour:
 * - A cold or expired cache reads Edge Config. A successful value, `false`
 *   included, is reused until the window measured from that read has elapsed.
 * - Concurrent requests on one instance share a single in-flight read, which
 *   is cleared whether it settles or fails.
 * - A failed read rejects every waiter and drops the cached value, so an
 *   earlier "on" value is never served after a failed refresh. The next
 *   request retries; the proxy keeps its fail-open handling of the rejection.
 *
 * Trade-off: turning maintenance mode on *and* off can each take up to the
 * window longer to reach an instance, on top of Edge Config propagation.
 *
 * Window: `GRIDA_MAINTENANCE_MODE_CACHE_TTL_MS`, a whole number of
 * milliseconds. Unset, blank or invalid values (negative, fractional, not a
 * plain decimal integer, or beyond `Number.MAX_SAFE_INTEGER`) use
 * {@link DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS}. `0` disables reuse: every
 * request reads Edge Config, though concurrent requests still share a read.
 */

/** Default reuse window: bounds how stale a toggle can be on one instance. */
export const DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS = 10_000;

const MAINTENANCE_MODE_KEY = "IS_IN_MAINTENANCE_MODE";

/** The reuse window in milliseconds for a raw environment value. */
export function maintenanceModeCacheTtlMs(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value))
    return DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS;
  const ttl = Number(value);
  return Number.isSafeInteger(ttl)
    ? ttl
    : DEFAULT_MAINTENANCE_MODE_CACHE_TTL_MS;
}

export type MaintenanceModeInstanceCache = {
  /** Whether maintenance mode is on; rejects when a required read fails. */
  isInMaintenanceMode(): Promise<boolean>;
};

export function createMaintenanceModeInstanceCache({
  read,
  ttlMs,
  now = Date.now,
}: {
  /** Reads the current flag; any truthy value means maintenance mode is on. */
  read: () => Promise<unknown>;
  ttlMs: number;
  now?: () => number;
}): MaintenanceModeInstanceCache {
  let cached: { value: boolean; readAt: number } | null = null;
  let inflight: Promise<boolean> | null = null;

  return {
    isInMaintenanceMode() {
      const time = now();
      // A clock that moved backwards cannot prove freshness; read again.
      if (cached && cached.readAt <= time && time - cached.readAt < ttlMs)
        return Promise.resolve(cached.value);
      if (inflight) return inflight;

      // `read` runs on a later tick, so even a synchronous throw settles after
      // `inflight` is assigned and the cleanup below always clears it.
      const pending = Promise.resolve()
        .then(read)
        .then(
          (raw) => {
            const value = Boolean(raw);
            cached = { value, readAt: time };
            return value;
          },
          (error: unknown) => {
            cached = null;
            throw error;
          }
        )
        .finally(() => {
          inflight = null;
        });
      inflight = pending;
      return pending;
    },
  };
}

let instance: MaintenanceModeInstanceCache | undefined;

/**
 * Whether this server instance should serve the maintenance page. Rejects when
 * Edge Config cannot be read, including when `EDGE_CONFIG` is not configured.
 */
export function isInMaintenanceMode(): Promise<boolean> {
  instance ??= createMaintenanceModeInstanceCache({
    read: async () => {
      const { get } = await import("@vercel/edge-config");
      return get<boolean>(MAINTENANCE_MODE_KEY);
    },
    ttlMs: maintenanceModeCacheTtlMs(
      process.env.GRIDA_MAINTENANCE_MODE_CACHE_TTL_MS
    ),
  });
  return instance.isInMaintenanceMode();
}
