// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
/**
 * `GET /api/v1/models/catalog` — the model catalogue as published data.
 *
 * The catalogue is compiled into every client that consumes it, so a
 * shipped desktop binary can only ever see the catalogue it was built
 * with: a new model or a retargeted tier needs a release. This endpoint
 * is the fix — an agent host seeds from its bundled copy and refreshes
 * from here, so a grida.co deploy reaches installed binaries.
 *
 * The published snapshot IS the deployed gate. `isHostedTextModel`
 * (`lib/ai/openai-compat/hosted-models.ts`) and this body are the same
 * static import in the same deploy artifact, so they cannot disagree —
 * which is why a client converging on this payload is converging on the
 * exact table the server will enforce, even against a newer bundled seed.
 *
 * DELIBERATELY UNAUTHENTICATED, and deliberately NOT under
 * `/api/v1/ai/**`. That path is bound by SECURITY.md (GRIDA-SEC-006) to
 * `verifyGgToken` EXCLUSIVELY, and this route must be reachable with no
 * credential at all: a desktop sidecar fetches it at boot, long before
 * the renderer can push a signed-in session token. Accepting no
 * credential is stronger than accepting the wrong one — but it only
 * stays true while this route lives outside that glob. Do not move it in.
 *
 * PRICING IS PRESENT, on purpose. The "no pricing" rule on
 * `/api/v1/ai/models` guards against client-side cost math drifting from
 * Metronome on the OpenAI-compatible surface. This payload is the source
 * that FEEDS the desktop's local estimate and its compaction limits;
 * withholding rates is what would make it drift. The same numbers are
 * already public on `/ai/models` and in `docs/models`.
 */
import { models } from "@grida/ai-models";

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
const BODY = JSON.stringify(models.snapshot.seed({ version: VERSION }));

export async function GET() {
  return new Response(BODY, {
    headers: {
      "content-type": "application/json",
      "cache-control": CACHE_CONTROL,
    },
  });
}
