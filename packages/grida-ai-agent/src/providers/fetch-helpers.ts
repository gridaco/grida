/**
 * Small fetch/async helpers shared by the queue-based BYOK media adapters
 * (image + video). Extracted so the two adapters can't drift on error-message
 * truncation or abort handling.
 */

/**
 * Throw unless `url` is HTTPS and its host is allow-listed. Defends BYOK
 * key-bearing fetches (queue submit/poll, authed downloads) against SSRF and
 * credential exfil via a malicious or misbehaving provider response — a host
 * entry is either an exact host or a `*.suffix` wildcard.
 */
export function assertAllowedUrl(
  url: string,
  allowedHosts: readonly string[],
  label: string
): void {
  const u = assertHttpsUrl(url, label);
  const host = u.hostname;
  const ok = allowedHosts.some((h) =>
    h.startsWith("*.")
      ? host === h.slice(2) || host.endsWith(h.slice(1))
      : host === h
  );
  if (!ok) throw new Error(`${label} returned a disallowed host: ${host}`);
}

/**
 * Throw unless `url` is a valid HTTPS url; return the parsed `URL`. For public,
 * non-credential downloads (e.g. a provider's pre-signed CDN link) where the
 * host legitimately varies but a plaintext/relative url must still be refused.
 */
export function assertHttpsUrl(url: string, label: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${label} returned an invalid url`);
  }
  if (u.protocol !== "https:") {
    throw new Error(`${label} returned a non-https url`);
  }
  return u;
}

/** Read a response body for an error message, bounded and never throwing. */
export async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<unreadable>";
  }
}

/** Sleep `ms`, rejecting early with an AbortError if `abortSignal` fires. */
export function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true }
    );
  });
}

/** An `AbortError` matching the DOM convention (`name === "AbortError"`). */
export function abortError(): Error {
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return e;
}

/** Per-poll verdict: still running, finished, or failed (with a reason). */
export type PollOutcome = "pending" | "done" | { failed: string };

/** fal queue status → {@link PollOutcome}. fal reports IN_QUEUE / IN_PROGRESS / COMPLETED. */
export function falQueueOutcome(body: { status: string }): PollOutcome {
  if (body.status === "COMPLETED") return "done";
  if (body.status === "IN_QUEUE" || body.status === "IN_PROGRESS")
    return "pending";
  return { failed: `generation failed with status: ${body.status}` };
}

/**
 * Poll a queue-style status endpoint until it's `done` or `failed`, bounded by
 * `timeoutMs` and abortable. Returns the final (completed) response body so the
 * caller can read result fields off it. Shared by the queue-based BYOK media
 * adapters (fal image/video, OpenRouter video) — they differ only in the status
 * vocabulary, which they supply via `classify`.
 */
export async function pollQueue<T>(
  url: string,
  opts: {
    headers: Record<string, string>;
    timeoutMs: number;
    intervalMs: number;
    /** Error-message prefix, e.g. `"[fal] video"`. */
    label: string;
    classify: (body: T) => PollOutcome;
  },
  abortSignal?: AbortSignal
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    if (abortSignal?.aborted) throw abortError();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`${opts.label} timed out after ${opts.timeoutMs}ms`);
    }
    // Bound each request to the remaining budget so a stalled status endpoint
    // can't hang the poll past `timeoutMs` even if no external abort fires.
    const signal = AbortSignal.any([
      ...(abortSignal ? [abortSignal] : []),
      AbortSignal.timeout(remaining),
    ]);
    const res = await fetch(url, { headers: opts.headers, signal });
    if (!res.ok) {
      throw new Error(
        `${opts.label} poll failed (${res.status}): ${await safeText(res)}`
      );
    }
    const body = (await res.json()) as T;
    const outcome = opts.classify(body);
    if (outcome === "done") return body;
    if (typeof outcome === "object") {
      throw new Error(`${opts.label} ${outcome.failed}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`${opts.label} timed out after ${opts.timeoutMs}ms`);
    }
    await delay(opts.intervalMs, abortSignal);
  }
}
