/**
 * Performance instrumentation for the Grida Canvas editor.
 *
 * Opt-in: zero overhead when disabled. Enable via:
 *   - `NEXT_PUBLIC_GRIDA_PERF=1` env var (browser/next.js)
 *   - `GRIDA_PERF=1` env var (Node.js / headless tests)
 *   - `perf.enable()` programmatically
 *
 * Usage:
 * ```ts
 * import { perf } from "@/grida-canvas/perf";
 *
 * // Span-based (preferred for most instrumentation):
 * const end = perf.start("dispatch.reducer");
 * // ... work ...
 * end();
 *
 * // Wrap a synchronous call:
 * const result = perf.measure("snapshot", () => deepClone(state));
 *
 * // Reporting:
 * perf.report();   // prints summary table
 * perf.dump();     // returns raw samples
 * perf.reset();    // clears collected data
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerfSample {
  /** Label identifying the measured span */
  label: string;
  /** Wall-clock duration in milliseconds (high-resolution) */
  ms: number;
  /** Optional metadata (e.g. action type, node count) */
  meta?: Record<string, unknown>;
}

export interface PerfSummaryEntry {
  label: string;
  count: number;
  total_ms: number;
  mean_ms: number;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

// ---------------------------------------------------------------------------
// Timer helper — works in both browser and Node.js
// ---------------------------------------------------------------------------

const now: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

/** Shared no-op function — returned by `start()` when disabled. */
const NOOP: () => void = () => {};

// ---------------------------------------------------------------------------
// PerfObserver
// ---------------------------------------------------------------------------

class PerfObserver {
  private _enabled = false;
  private _samples: PerfSample[] = [];

  /** Whether instrumentation is currently active. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Enable instrumentation. */
  enable(): void {
    this._enabled = true;
  }

  /** Disable instrumentation. Does NOT clear collected data. */
  disable(): void {
    this._enabled = false;
  }

  /**
   * Auto-enable from environment variables.
   * Call once at module load time.
   */
  autoFromEnv(): void {
    try {
      const val =
        (typeof process !== "undefined" &&
          process.env?.NEXT_PUBLIC_GRIDA_PERF) ||
        (typeof process !== "undefined" && process.env?.GRIDA_PERF);
      if (val === "1" || val === "true") {
        this._enabled = true;
      }
    } catch {
      // ignore — some bundlers throw on process.env access
    }
  }

  // -----------------------------------------------------------------------
  // Recording API
  // -----------------------------------------------------------------------

  /**
   * Start a timing span.
   *
   * Returns a stop function — call it to record the sample.
   * When disabled, returns a shared no-op (zero allocation).
   *
   * ```ts
   * const end = perf.start("my-label");
   * doWork();
   * end();
   * ```
   */
  start(label: string, meta?: Record<string, unknown>): () => void {
    if (!this._enabled) return NOOP;
    const t0 = now();
    return () => {
      this._samples.push({ label, ms: now() - t0, meta });
    };
  }

  /**
   * Measure the synchronous execution of `fn`.
   * Returns `fn()`'s return value.
   * When disabled, calls `fn()` with zero overhead.
   */
  measure<T>(label: string, fn: () => T, meta?: Record<string, unknown>): T {
    if (!this._enabled) return fn();
    const t0 = now();
    const result = fn();
    this._samples.push({ label, ms: now() - t0, meta });
    return result;
  }

  /**
   * Record a pre-computed sample.
   * No-op when disabled.
   */
  record(label: string, ms: number, meta?: Record<string, unknown>): void {
    if (!this._enabled) return;
    this._samples.push({ label, ms, meta });
  }

  // -----------------------------------------------------------------------
  // Reporting API
  // -----------------------------------------------------------------------

  /** Return the raw sample array (read-only snapshot). */
  dump(): ReadonlyArray<PerfSample> {
    return this._samples.slice();
  }

  /** Clear all collected samples. */
  reset(): void {
    this._samples.length = 0;
  }

  /** Return the number of collected samples. */
  get size(): number {
    return this._samples.length;
  }

  /** Compute summary statistics grouped by label. */
  summarize(): PerfSummaryEntry[] {
    const groups = new Map<string, number[]>();
    for (const s of this._samples) {
      let arr = groups.get(s.label);
      if (!arr) {
        arr = [];
        groups.set(s.label, arr);
      }
      arr.push(s.ms);
    }

    const entries: PerfSummaryEntry[] = [];
    for (const [label, values] of groups) {
      values.sort((a, b) => a - b);
      const n = values.length;
      entries.push({
        label,
        count: n,
        total_ms: values.reduce((a, b) => a + b, 0),
        mean_ms: values.reduce((a, b) => a + b, 0) / n,
        min_ms: values[0],
        max_ms: values[n - 1],
        p50_ms: percentile(values, 0.5),
        p95_ms: percentile(values, 0.95),
        p99_ms: percentile(values, 0.99),
      });
    }

    entries.sort((a, b) => b.total_ms - a.total_ms);
    return entries;
  }

  /** Print a formatted summary table to the console. */
  report(): void {
    const entries = this.summarize();
    if (entries.length === 0) {
      console.log("[perf] No samples collected.");
      return;
    }

    console.log(
      "\n[perf] ─────────────────────────────────────────────────────────"
    );
    console.log(
      `[perf] ${this._samples.length} samples across ${entries.length} labels\n`
    );

    const header = [
      pad("label", 45),
      pad("count", 7),
      pad("total", 10),
      pad("mean", 10),
      pad("p50", 10),
      pad("p95", 10),
      pad("p99", 10),
      pad("max", 10),
    ].join(" ");
    console.log(`[perf] ${header}`);
    console.log(`[perf] ${"─".repeat(header.length)}`);

    for (const e of entries) {
      const row = [
        pad(e.label, 45),
        pad(String(e.count), 7),
        pad(fmt(e.total_ms), 10),
        pad(fmt(e.mean_ms), 10),
        pad(fmt(e.p50_ms), 10),
        pad(fmt(e.p95_ms), 10),
        pad(fmt(e.p99_ms), 10),
        pad(fmt(e.max_ms), 10),
      ].join(" ");
      console.log(`[perf] ${row}`);
    }
    console.log(
      "[perf] ─────────────────────────────────────────────────────────\n"
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function fmt(ms: number): string {
  if (ms < 0.01) return "<0.01ms";
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  if (ms < 100) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Global perf observer for the canvas editor.
 *
 * ```ts
 * import { perf } from "@/grida-canvas/perf";
 * ```
 */
export const perf = new PerfObserver();

// Auto-enable from env on module load
perf.autoFromEnv();
