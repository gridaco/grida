// GRIDA-GG: gateway — catalogue distribution, see docs/wg/platform/hosted-ai.md
/**
 * The catalogue this host resolves against.
 *
 * `@grida/ai-models` is compiled into the binary, so a shipped host can
 * only see the catalogue it was built with: a model added on the server
 * is rejected by this host's own run gate until someone ships a release.
 * This store removes that coupling — the bundled catalogue becomes a
 * SEED, and the published one (`GET /api/v1/models/catalog` on the
 * configured Grida base URL) becomes the authority.
 *
 * Remote wins over the seed, and that is the right way round even when
 * the binary is newer: the published snapshot and the server's own model
 * gate are the same static import in the same deploy, so converging on
 * the published table is converging on the table that will actually be
 * enforced.
 *
 * IN MEMORY ONLY, deliberately. The seed is the offline story and a
 * restart is the reset — which also means a bad-but-valid snapshot can
 * never outlive the process that fetched it. Nothing here touches disk.
 *
 * Fail-safe throughout: a fetch that errors, 404s, or fails validation
 * leaves the last good view in place. `start()` never throws and never
 * blocks a caller; `view()` is synchronous and always answers.
 */
import { models } from "@grida/ai-models";

/** Published catalogue path on the Grida base URL. */
export const CATALOG_PATH = "/api/v1/models/catalog";

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Floor between network attempts triggered by a gate miss, so an
 * unknown model id in a hot loop cannot turn into a request per run.
 */
const DEFAULT_MISS_REFRESH_MIN_INTERVAL_MS = 30_000;

/** Bound on an untrusted body. The real payload is a few tens of KB. */
const MAX_BODY_BYTES = 1_000_000;

const FETCH_TIMEOUT_MS = 10_000;

/** Why a refresh ran — for logs, and to keep the miss path rate-limited. */
export type RefreshReason = "boot" | "interval" | "gate-miss";

export type ModelCatalogStoreOptions = {
  /**
   * Grida base URL (the tenant's `gg_base_url`). Absent ⇒ the store never
   * fetches and stays on the seed, which is the CLI's normal state.
   */
  base_url?: string;
  /**
   * How to reach it. Desktop passes the host-routed provider transport —
   * ambient `fetch` is unreachable from the sandboxed sidecar. Defaults
   * to ambient `fetch` for the CLI.
   */
  fetch?: typeof globalThis.fetch;
  /**
   * A catalogue supplied by the host. Freezes the store: no fetch, no
   * interval. The escape hatch for pinned or air-gapped deployments.
   */
  snapshot?: models.snapshot.Snapshot;
  /** Called after the view actually changes (not on a no-op refresh). */
  on_change?: () => void;
  /** `null` disables the periodic refresh. */
  refresh_interval_ms?: number | null;
  miss_refresh_min_interval_ms?: number;
  /** Test seam. */
  now?: () => number;
};

export class ModelCatalogStore {
  private current: models.snapshot.View;
  private currentRaw: string | null = null;
  private readonly url: string | null;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onChange?: () => void;
  private readonly refreshIntervalMs: number | null;
  private readonly missMinIntervalMs: number;
  private readonly now: () => number;
  private readonly frozen: boolean;

  private inFlight: Promise<boolean> | null = null;
  private lastMissAttemptAt = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private disposed = false;
  private warned = new Set<string>();

  constructor(options: ModelCatalogStoreOptions = {}) {
    this.frozen = options.snapshot !== undefined;
    this.current = models.snapshot.view(options.snapshot);
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.onChange = options.on_change;
    this.refreshIntervalMs =
      options.refresh_interval_ms === undefined
        ? DEFAULT_REFRESH_INTERVAL_MS
        : options.refresh_interval_ms;
    this.missMinIntervalMs =
      options.miss_refresh_min_interval_ms ??
      DEFAULT_MISS_REFRESH_MIN_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.url =
      this.frozen || !options.base_url
        ? null
        : safeCatalogUrl(options.base_url);
  }

  /** True when this store can ever change (a URL to fetch, not frozen). */
  get refreshable(): boolean {
    return this.url !== null;
  }

  /**
   * The catalogue to resolve against, right now. Synchronous by design:
   * this sits on the run gate's hot path, and a host that has not
   * fetched yet must still answer from the seed rather than block.
   */
  view(): models.snapshot.View {
    return this.current;
  }

  /**
   * Fetch and apply. Single-flight — concurrent callers await the same
   * request. Resolves to whether the view changed; never rejects.
   */
  refresh(reason: RefreshReason): Promise<boolean> {
    if (this.url === null || this.disposed) return Promise.resolve(false);
    this.inFlight ??= this.refreshOnce(reason).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * Self-heal after a catalogue lookup missed: the model may have been
   * published since this host last looked. Rate-limited so a client
   * retrying a genuinely unknown id cannot spin up traffic.
   *
   * Awaited by the caller, so the FIRST use of a newly published model
   * succeeds rather than 400-ing until some later refresh — which is the
   * moment the whole mechanism exists for.
   *
   * Takes no id, deliberately. The CALLER establishes the miss against
   * whichever section it reads and re-checks after; a miss on an image id
   * is the same story as a miss on a text id, and a store that only knew
   * how to check text ids would quietly never self-heal the others.
   */
  async refreshOnMiss(): Promise<void> {
    if (this.url === null || this.disposed) return;
    const inFlight = this.inFlight;
    if (inFlight) {
      await inFlight;
      return;
    }
    if (this.now() - this.lastMissAttemptAt < this.missMinIntervalMs) return;
    this.lastMissAttemptAt = this.now();
    await this.refresh("gate-miss");
  }

  /**
   * Begin keeping the catalogue fresh: one non-blocking fetch now, then a
   * periodic one. Idempotent. The interval is `unref`'d — a background
   * refresh must never be the reason a process stays alive.
   */
  start(): void {
    if (this.url === null || this.started || this.disposed) return;
    this.started = true;
    void this.refresh("boot");
    if (this.refreshIntervalMs === null || this.refreshIntervalMs <= 0) return;
    this.timer = setInterval(() => {
      void this.refresh("interval");
    }, this.refreshIntervalMs);
    this.timer.unref?.();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async refreshOnce(reason: RefreshReason): Promise<boolean> {
    const url = this.url;
    if (url === null) return false;
    let raw: string;
    try {
      raw = await this.fetchBody(url);
    } catch (err) {
      this.warnOnce(
        `fetch:${reason}`,
        `could not fetch the published catalogue (${describe(err)}); ` +
          `continuing on the ${this.currentRaw ? "last published" : "bundled"} catalogue`
      );
      return false;
    }
    // Byte-identical to what is already applied — skip the parse and,
    // more importantly, skip the change notification.
    if (raw === this.currentRaw) return false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.warnOnce("parse", "published catalogue was not JSON; ignoring it");
      return false;
    }
    const snapshot = models.snapshot.parse(parsed);
    if (!snapshot) {
      // Whole-or-reject: a catalogue that fails validation is never
      // half-applied, and the last good one keeps serving.
      this.warnOnce(
        "schema",
        `published catalogue did not match schema ${models.snapshot.SCHEMA}; ignoring it`
      );
      return false;
    }
    if (this.disposed) return false;
    this.current = models.snapshot.view(snapshot);
    this.currentRaw = raw;
    this.onChange?.();
    return true;
  }

  private async fetchBody(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        throw new Error(`body too large (${declared} bytes)`);
      }
      const body = await res.text();
      if (body.length > MAX_BODY_BYTES) {
        throw new Error(`body too large (${body.length} bytes)`);
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * One line per failure KIND, not per occurrence: an offline host
   * refreshes on a timer forever, and this must not become a log flood
   * that buries the failure that matters.
   */
  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[grida-agent] model catalogue: ${message}`);
  }
}

/**
 * The catalogue a call site resolves against: the host's store when one is
 * wired, the bundled seed otherwise.
 *
 * One definition on purpose. Every resolver, gate, and estimator needs the
 * same "absent ⇒ bundled" rule, and a hand-inlined `?? models.snapshot.view()`
 * at each of them is a rule stated N times — the shape that drifts the day
 * one site starts defaulting to something else.
 *
 * Call it ONCE per decision and reuse the result: a background refresh can
 * land between two calls, and a gate that admits from one catalogue while
 * the factory resolves against another is exactly the skew this store
 * exists to remove.
 */
export function catalogView(store?: ModelCatalogStore): models.snapshot.View {
  return store?.view() ?? models.snapshot.view();
}

/** `null` for anything that is not an http(s) base URL we can extend. */
function safeCatalogUrl(baseUrl: string): string | null {
  try {
    const url = new URL(CATALOG_PATH, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
