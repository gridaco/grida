import { catalogueSchema } from "./schema";
import type { Catalogue } from "./catalogue";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const FRESH_MS = 60_000;
export const MAX_AGE_MS = 300_000;
const FAILURE_BACKOFF_MS = 5_000;
export type CatalogueView = {
  state: "fresh" | "stale" | "unavailable";
  catalogue: Catalogue | null;
  validated_at: number | null;
  refresh_at: number;
  expires_at: number;
};
type Cached = {
  catalogue: Catalogue;
  validatedAt: number;
  freshUntil: number;
  expiresAt: number;
};

/** One bounded snapshot and one in-flight fetch per server process. No session/query keys. */
export function createCatalogueReader({
  origin,
  fetcher = fetch,
  now = Date.now,
  allowInsecureLoopback = false,
}: {
  origin: string;
  fetcher?: typeof fetch;
  now?: () => number;
  allowInsecureLoopback?: boolean;
}) {
  const parsed = new URL(origin);
  const localHTTP =
    allowInsecureLoopback &&
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !localHTTP) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Invalid public Gateway origin");
  let cached: Cached | null = null;
  let pending: Promise<void> | null = null;
  let retryAt = 0;

  async function fetchSnapshot(): Promise<void> {
    const started = now();
    try {
      const response = await fetcher(new URL("/v1/models", parsed), {
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (
        !response.ok ||
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json") ||
        !response.body
      )
        throw new Error("Catalogue unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error("Catalogue exceeds limit");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let position = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, position);
        position += chunk.length;
      }
      const catalogue = catalogueSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      );
      const finished = now();
      const rawAge = response.headers.get("age");
      if (rawAge !== null && !/^\d{1,10}$/.test(rawAge))
        throw new Error("Invalid cache age");
      const age = Number(rawAge ?? 0) * 1000;
      const rawDate = response.headers.get("date");
      const date = rawDate === null ? finished : Date.parse(rawDate);
      if (!Number.isFinite(date) || date > finished + 60_000)
        throw new Error("Invalid cache date");
      const validatedAt =
        finished - Math.max(0, finished - date, age + finished - started);
      const boundary =
        catalogue.next_change_at === null
          ? Infinity
          : Date.parse(catalogue.next_change_at);
      const expiresAt = Math.min(validatedAt + MAX_AGE_MS, boundary);
      if (expiresAt <= finished) throw new Error("Expired catalogue");
      cached = {
        catalogue,
        validatedAt,
        freshUntil: Math.min(validatedAt + FRESH_MS, boundary),
        expiresAt,
      };
      retryAt = 0;
    } catch {
      // Do not log upstream bodies, credentials, or per-request error objects.
      retryAt = now() + FAILURE_BACKOFF_MS;
    }
  }
  return async function read(): Promise<CatalogueView> {
    const time = now();
    if ((!cached || time >= cached.freshUntil) && time >= retryAt) {
      if (!pending)
        pending = fetchSnapshot().finally(() => {
          pending = null;
        });
      await pending;
    }
    const at = now();
    if (!cached || at >= cached.expiresAt)
      return {
        state: "unavailable",
        catalogue: null,
        validated_at: null,
        refresh_at: Math.max(at + FAILURE_BACKOFF_MS, retryAt),
        expires_at: at,
      };
    return {
      state: at < cached.freshUntil ? "fresh" : "stale",
      catalogue: cached.catalogue,
      validated_at: cached.validatedAt,
      refresh_at: Math.max(at + 1000, cached.freshUntil, retryAt),
      expires_at: cached.expiresAt,
    };
  };
}
