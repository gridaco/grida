/**
 * @fileoverview
 * Server-instance cache for the web maintenance-mode flag
 * (`IS_IN_MAINTENANCE_MODE` in Vercel Edge Config), read by `proxy.ts`.
 *
 * Scope — read this before reusing the pattern elsewhere:
 *
 * - State lives only in memory, in the current server runtime instance, and is
 *   reused by the requests that instance happens to handle.
 * - It is not a browser cache, a persistent store, or a globally shared or
 *   distributed cache. Nothing is written back to Edge Config or to responses.
 * - Reuse is best-effort. Cold starts, restarts, concurrent instances and
 *   regions each start empty and refresh independently; instance reuse is never
 *   guaranteed, so the read reduction depends on traffic, not on this module.
 *
 * Behavior:
 *
 * - A cold or expired cache reads Edge Config. A successful value, including
 *   `false` and a missing key, is reused for the configured TTL
 *   ({@link TTL_MS_ENV}), measured on a monotonic clock from when the read
 *   started.
 * - Concurrent requests during a refresh share one in-flight read. In-flight
 *   state is cleared whether the read succeeds or fails.
 * - Errors are never cached. An expired value is discarded before its refresh
 *   starts, so a failed refresh cannot keep serving a stale maintenance-on (or
 *   -off) value: the error reaches the caller, which fails open for that request
 *   as before, and the next request retries.
 *
 * Trade-off: toggling maintenance mode **on and off** can each take up to the
 * remaining TTL to reach a warm instance, in addition to Edge Config's own
 * propagation delay. The default is deliberately short for that reason.
 */

/**
 * Cache window in milliseconds, as a non-negative integer.
 *
 * - unset or blank: {@link DEFAULT_TTL_MS}
 * - `0`: disabled; every request reads Edge Config (concurrent reads are still
 *   shared, which never returns a value older than the read itself)
 * - anything else (negative, fractional, non-numeric, unsafe integer): ignored
 *   with a warning, and {@link DEFAULT_TTL_MS} applies
 */
export const TTL_MS_ENV = "GRIDA_MAINTENANCE_MODE_CACHE_TTL_MS";

/** Bounds the extra toggle delay while cutting per-request reads on warm instances. */
export const DEFAULT_TTL_MS = 10_000;

const EDGE_CONFIG_KEY = "IS_IN_MAINTENANCE_MODE";

type MaintenanceModeReader = () => Promise<unknown>;

export interface MaintenanceModeServerInstanceCache {
  /** Resolves whether maintenance mode is on; rejects when the read fails. */
  isInMaintenanceMode(): Promise<boolean>;
}

/** Parses {@link TTL_MS_ENV}; `null` marks a value that must be ignored. */
export function parseTtlMs(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_TTL_MS;
  if (!/^\d+$/.test(trimmed)) return null;
  const ttl = Number(trimmed);
  return Number.isSafeInteger(ttl) ? ttl : null;
}

/**
 * Creates one independent cache. Each call models a separate server instance;
 * production code shares the single lazily created instance behind
 * {@link isInMaintenanceMode}.
 */
export function createMaintenanceModeServerInstanceCache({
  read,
  ttlMs,
  now = () => performance.now(),
}: {
  read: MaintenanceModeReader;
  ttlMs: number;
  /** Monotonic milliseconds; wall-clock changes must not extend a value's life. */
  now?: () => number;
}): MaintenanceModeServerInstanceCache {
  let cached: { value: boolean; expiresAt: number } | null = null;
  let inflight: Promise<boolean> | null = null;

  return {
    isInMaintenanceMode() {
      if (cached && now() < cached.expiresAt) {
        return Promise.resolve(cached.value);
      }
      if (inflight) return inflight;

      cached = null;
      const startedAt = now();
      // Settles asynchronously even if `read` throws synchronously, so the
      // in-flight slot is always assigned before it is cleared.
      const refresh = Promise.resolve()
        .then(read)
        .then((result) => {
          const value = Boolean(result);
          if (ttlMs > 0) cached = { value, expiresAt: startedAt + ttlMs };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
      inflight = refresh;
      return refresh;
    },
  };
}

async function readEdgeConfig(): Promise<unknown> {
  // Loaded on first use so that requests which never consult maintenance mode
  // (e.g. GRIDA-SEC-012 machine dispatch) never load the Edge Config client.
  const { get } = await import("@vercel/edge-config");
  return get<boolean>(EDGE_CONFIG_KEY);
}

let instance: MaintenanceModeServerInstanceCache | undefined;

/**
 * Whether the web maintenance page should be served, using this server
 * instance's cache. Rejects on Edge Config errors (including a missing
 * `EDGE_CONFIG` connection string); callers decide how to fail.
 */
export function isInMaintenanceMode(): Promise<boolean> {
  if (!instance) {
    let ttlMs = parseTtlMs(process.env[TTL_MS_ENV]);
    if (ttlMs === null) {
      // Do not echo the configured value.
      console.warn(
        `${TTL_MS_ENV} must be a non-negative integer number of milliseconds; using the default of ${DEFAULT_TTL_MS} ms.`
      );
      ttlMs = DEFAULT_TTL_MS;
    }
    instance = createMaintenanceModeServerInstanceCache({
      read: readEdgeConfig,
      ttlMs,
    });
  }
  return instance.isInMaintenanceMode();
}
