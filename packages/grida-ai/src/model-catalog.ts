// GRIDA-GG: gateway — catalogue distribution, see docs/wg/platform/hosted-ai.md
/** Host-supplied catalog views; this owner manages refresh, never product policy. */
import type { models } from "@grida/ai-models";

/** Trusted host projection. Presence is not provider or account authority. */
export interface ModelCatalogView {
  readonly image: ModelCatalogView.Media<
    models.image.ImageModelCard & ModelCatalogView.Admission,
    models.image.ImageProvider,
    models.image.ImageProviderBinding
  >;
  readonly video: ModelCatalogView.Media<
    models.video.VideoModelCard & ModelCatalogView.Admission,
    models.video.VideoProvider,
    models.video.VideoProviderBinding
  >;
  readonly lifecycle: Readonly<
    Record<
      "music" | "sound_effects" | "text_to_speech" | "three_d",
      Readonly<Record<string, ModelCatalogView.Lifecycle>>
    >
  >;
}
export namespace ModelCatalogView {
  export type Admission = { listed: boolean; deprecated?: boolean };
  export type Lifecycle = { status: "listed" | "staged"; deprecated?: boolean };
  export interface Media<Card, Provider extends string, Binding> {
    readonly models: Readonly<Record<string, Card>>;
    listed(): readonly Card[];
    cardById(id: string): Card | undefined;
    binding(card: Card, provider: Provider): Binding | null;
  }
}

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Floor between network attempts triggered by a lookup miss, so an
 * unknown model id in a hot loop cannot turn into a request per run.
 */
const MISS_REFRESH_MIN_INTERVAL_MS = 30_000;

/** Bound on an untrusted body. The real payload is a few tens of KB. */
const MAX_BODY_BYTES = 1_000_000;

const FETCH_TIMEOUT_MS = 10_000;

/** Why a refresh ran — for logs, and to keep the miss path rate-limited. */
export type RefreshReason = "boot" | "interval" | "gate-miss";

export type ModelCatalogStoreOptions<
  V extends ModelCatalogView = ModelCatalogView,
> = {
  /** Already validated, immutable host view. No built-in service membership. */
  seed: V;
  /** Optional public-data source. The host owns its URL, wire schema and parser. */
  source?: {
    url: string;
    fetch?: typeof globalThis.fetch;
    /** Return a validated immutable view, or null to keep the previous view. */
    parse(value: unknown): V | null;
  };
  /** Called after the view actually changes (not on a no-op refresh). */
  on_change?: () => void;
  /** `null` disables the periodic refresh. */
  refresh_interval_ms?: number | null;
  /** Test seam. */
  now?: () => number;
};

export class ModelCatalogStore<V extends ModelCatalogView = ModelCatalogView> {
  private current: V;
  private readonly parse?: (value: unknown) => V | null;
  private currentRaw: string | null = null;
  private readonly url: string | null;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onChange?: () => void;
  private readonly refreshIntervalMs: number | null;
  private readonly now: () => number;

  private inFlight: Promise<boolean> | null = null;
  private lastMissAttemptAt = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private disposed = false;
  private warned = new Set<string>();

  constructor(options: ModelCatalogStoreOptions<V>) {
    this.current = options.seed;
    this.parse = options.source?.parse;
    this.fetchImpl = options.source?.fetch ?? globalThis.fetch;
    this.onChange = options.on_change;
    this.refreshIntervalMs =
      options.refresh_interval_ms === undefined
        ? DEFAULT_REFRESH_INTERVAL_MS
        : options.refresh_interval_ms;
    this.now = options.now ?? Date.now;
    this.url = options.source ? safeCatalogUrl(options.source.url) : null;
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
  view(): V {
    return this.current;
  }

  /**
   * Fetch and apply. Single-flight — concurrent callers await the same
   * request. Resolves to whether the view changed; never rejects.
   */
  refresh(reason: RefreshReason): Promise<boolean> {
    if (this.url === null || this.disposed) return Promise.resolve(false);
    this.inFlight ??= this.refreshOnce(reason)
      // "Never rejects" has to be enforced, not just documented: the
      // validator is outside this file's control, and `start()` fires this
      // with `void` — an escaping rejection would be an unhandled
      // rejection on a timer. `refreshOnMiss` awaits the same promise, so
      // it would also surface on the run gate. Reaching here means nothing
      // was applied; a listener that throws AFTER a successful swap is
      // handled in `refreshOnce`, which still reports the change.
      .catch((err) => {
        this.warnOnce(
          "apply",
          `could not apply the published catalogue (${describe(err)}); ` +
            `continuing on the ${this.currentRaw ? "last published" : "bundled"} catalogue`
        );
        return false;
      })
      .finally(() => {
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
    if (this.now() - this.lastMissAttemptAt < MISS_REFRESH_MIN_INTERVAL_MS) {
      return;
    }
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
    (this.timer as unknown as { unref?: () => void }).unref?.();
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
      // Keyed on the failure KIND, not on `reason`: an offline host retries
      // at boot, on the interval, and on every miss, and keying by reason
      // would let the same outage warn three times.
      this.warnOnce(
        "fetch",
        `could not fetch the published catalogue on ${reason} ` +
          `(${describe(err)}); continuing on the ` +
          `${this.currentRaw ? "last published" : "bundled"} catalogue`
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
    const view = this.parse?.(parsed);
    if (!view) {
      // Whole-or-reject: a catalogue that fails validation is never
      // half-applied, and the last good one keeps serving.
      this.warnOnce(
        "schema",
        "published catalogue did not match the host schema; ignoring it"
      );
      return false;
    }
    if (this.disposed) return false;
    this.current = view;
    this.currentRaw = raw;
    // The catalogue is ALREADY live at this point, so a listener that
    // throws must not be reported as a refresh that did not happen: the
    // return value is "the view changed", and it did. Its own warn key,
    // because a broken host listener is a different failure from a
    // catalogue this store could not apply.
    try {
      this.onChange?.();
    } catch (err) {
      this.warnOnce(
        "on-change",
        `applied the published catalogue, but the on_change listener ` +
          `failed (${describe(err)})`
      );
    }
    return true;
  }

  /**
   * The response body, refusing to buffer more than {@link MAX_BODY_BYTES}.
   *
   * Read through the stream rather than `res.text()`: `content-length` is
   * optional, so a chunked response would otherwise be buffered in full
   * before any check could reject it — bounded only by the fetch timeout.
   * Counted in BYTES off the wire, not in string length, which counts
   * UTF-16 code units and so under-counts every multi-byte character.
   */
  private async fetchBody(url: string): Promise<string> {
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // Every early exit cancels the body first. An undici response whose
    // body is neither read nor cancelled holds its stream open, and the
    // two paths below are the ROUTINE ones: a 404 is the documented state
    // for a rolled-back or self-hosted-old editor, and this store retries
    // on a timer forever.
    const bail = async (message: string): Promise<never> => {
      await res.body?.cancel().catch(() => {});
      throw new Error(message);
    };
    if (!res.ok) return bail(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return bail(`body too large (${declared} bytes)`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("response had no body");
    // `stream: true` per chunk, then a final flush: a multi-byte character
    // split across two chunks must not decode to a replacement character.
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          throw new Error(`body too large (over ${MAX_BODY_BYTES} bytes)`);
        }
        body += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return body + decoder.decode();
  }

  /**
   * One line per failure KIND, not per occurrence: an offline host
   * refreshes on a timer forever, and this must not become a log flood
   * that buries the failure that matters.
   */
  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[grida-ai] model catalogue: ${message}`);
  }
}

/** Read one host-supplied view per decision; never mix snapshots across a refresh. */
export function catalogView<V extends ModelCatalogView>(
  store: ModelCatalogStore<V>
): V {
  return store.view();
}

/**
 * The view to resolve against, refreshing ONCE if the caller's lookup misses.
 *
 * The rule it states: a miss may just mean this host has not fetched the
 * catalogue the client is already offering from, so try once, and then read
 * everything from the NEW view — a decision must never straddle two
 * catalogues. Stated here rather than at each resolver because the text gate
 * and both media resolvers need exactly this and would otherwise each spell
 * it out.
 *
 * `missed` is called on the current view and, if it refreshed, the caller
 * re-reads from the returned one.
 */
export async function catalogViewOnMiss<V extends ModelCatalogView>(
  store: ModelCatalogStore<V>,
  missed: (view: V) => boolean
): Promise<V> {
  const view = catalogView(store);
  if (!missed(view) || !store?.refreshable) return view;
  await store.refreshOnMiss();
  return catalogView(store);
}

/** `null` for anything that is not an explicit http(s) source URL. */
function safeCatalogUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function describe(_err: unknown): string {
  return "request or host callback failed";
}
