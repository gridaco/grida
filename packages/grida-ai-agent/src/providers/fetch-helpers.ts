/**
 * Small fetch/async helpers shared by the queue-based BYOK media adapters
 * (image + video). Extracted so the two adapters can't drift on error-message
 * truncation or abort handling.
 */

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
    const res = await fetch(url, {
      headers: opts.headers,
      signal: abortSignal,
    });
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
