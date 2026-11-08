// GRIDA-SEC-006 / GRIDA-SEC-012 — anonymous installed-client compatibility.
/** Schema-1 native adapter metadata for older installed clients.
 * Current GG offerings are discovered independently through the public GG API;
 * this immutable product projection does not authorize execution or charging. */
import { catalog as models } from "@grida/ai/catalogue";

/**
 * A CDN-cacheable payload — the only one under `(api)/(public)`, where
 * the convention is `no-store`. That convention is about per-user and
 * billing-bearing responses; this body is identical for every caller and
 * changes only on deploy (which purges the edge cache), so the staleness
 * ceiling is this TTL and normally zero.
 */
const CACHE_CONTROL =
  "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

/**
 * Opaque publisher version. The deploy sha is exactly the right identity:
 * the catalogue ships with the deploy, so equal shas mean equal payloads.
 */
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 12);

/**
 * Serialized once per deploy, not per request: the catalogue and `VERSION`
 * are both compile-time constants here, so every response is the same ~20KB
 * of bytes. Also gives the response a real `content-length`, which the
 * agent-side store checks before reading the body.
 */
const BODY = JSON.stringify(models.snapshot.legacy({ version: VERSION }));

export async function GET() {
  return new Response(BODY, {
    headers: {
      "content-type": "application/json",
      "cache-control": CACHE_CONTROL,
    },
  });
}
