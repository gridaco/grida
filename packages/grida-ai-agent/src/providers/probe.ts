/**
 * GRIDA-SEC-004 — endpoint model probe (issue #806).
 *
 * Host-side discovery of the models an OpenAI-compatible endpoint
 * serves, so the user never has to type model ids by hand. Host-side
 * because the packaged renderer cannot reach the endpoint itself: its
 * origin is `https://grida.co`, which Ollama's CORS policy rejects —
 * only the agent host shares the machine with the endpoint.
 *
 * Two shapes, tried in order:
 *
 *   1. **Ollama native** — `GET <origin>/api/tags` for ids + capability
 *      tags (`tool_call` comes back real), enriched with the context
 *      window: `/api/ps` first (a LOADED model's `context_length` is the
 *      server's actual allocation — authoritative), then `/api/show`
 *      `model_info` (the model's maximum) for models not loaded.
 *   2. **Generic OpenAI-compatible** — `GET <base_url>/models`
 *      (LiteLLM, vLLM, …). Ids only.
 *
 * Context-window honesty: a server explicitly capped below a model's
 * maximum (e.g. `OLLAMA_CONTEXT_LENGTH`) reports the cap via `/api/ps`
 * only once the model is loaded — the `/api/show` maximum can overshoot
 * such a setup. The field stays user-editable for exactly that case.
 *
 * Threat note (reviewed): the probe makes the host GET a user-supplied
 * URL. This is the SAME egress the run path already performs against a
 * configured endpoint (and the writer is the same authenticated loopback
 * client), so it widens nothing — but the route must never become a
 * generic proxy: responses are parsed and reduced to `{id, tool_call}`
 * rows; raw bodies never reach the client. Reads are bounded (timeout +
 * size cap) and the URL shape is pinned to http(s).
 */

import {
  parseEndpointBaseUrl,
  type ProbedEndpointModel,
} from "../protocol/endpoints";

const PROBE_TIMEOUT_MS = 4_000;
const MAX_BODY_BYTES = 1_048_576;
const MAX_MODELS = 64;
// Keep enrichment comfortably below host-transport admission limits. A model
// listing is untrusted in size (up to MAX_MODELS); opening one request per row
// at once can otherwise turn a harmless probe into a sidecar-fatal burst.
const MAX_CONCURRENT_OLLAMA_SHOW_REQUESTS = 8;

export type EndpointProbeResult =
  | { ok: true; source: "ollama" | "openai"; models: ProbedEndpointModel[] }
  | { ok: false; error: string };

/** The fetch seam — the server injects provider `request`; direct callers
 *  retain the ambient-global default and tests inject a fake. */
export type ProbeFetch = (
  url: string,
  init: {
    signal: AbortSignal;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<Response>;

export async function probeEndpointModels(
  baseUrl: string,
  fetchImpl: ProbeFetch = fetch
): Promise<EndpointProbeResult> {
  const parsed = parseEndpointBaseUrl(baseUrl);
  if (!parsed.ok) return parsed;
  const { url } = parsed;

  // Both shapes probed concurrently (idempotent GETs; a generic gateway
  // shouldn't wait out the full Ollama timeout first). Ollama wins when
  // it answers — capability tags ride along.
  const base = baseUrl.replace(/\/+$/, "");
  const ollamaProbe = requestJson(fetchImpl, `${url.origin}/api/tags`);
  const openaiProbe = requestJson(fetchImpl, `${base}/models`);

  const ollama = await ollamaProbe;
  if (ollama.ok) {
    const models = parseOllamaTags(ollama.data);
    if (models) {
      await enrichContextWindows(fetchImpl, url.origin, models);
      return { ok: true, source: "ollama", models };
    }
  }

  // Generic OpenAI-compatible — ids only.
  const openai = await openaiProbe;
  if (openai.ok) {
    const models = parseOpenAiModels(openai.data);
    if (models) return { ok: true, source: "openai", models };
  }

  return {
    ok: false,
    error:
      "no model listing at this endpoint — is the server running? " +
      `(tried ${url.origin}/api/tags and ${base}/models)`,
  };
}

type JsonProbe = { ok: true; data: unknown } | { ok: false };

/** One bounded JSON request: GET, or POST when `body` is given. Never
 *  throws — every failure mode (timeout, non-2xx, oversize, bad JSON)
 *  collapses to `{ok: false}`; the probe treats them all as "no answer". */
async function requestJson(
  fetchImpl: ProbeFetch,
  url: string,
  body?: unknown
): Promise<JsonProbe> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      ...(body !== undefined
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!res.ok) return { ok: false };
    const text = await readBodyBounded(res);
    if (text === null) return { ok: false };
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Read a response body of at most {@link MAX_BODY_BYTES} — the bound is
 * enforced ON THE WIRE (declared length first, then a capped stream
 * read), not by buffering an arbitrarily large body and measuring after.
 * Returns `null` when the cap is exceeded.
 */
async function readBodyBounded(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!res.body) {
    const text = await res.text();
    return text.length > MAX_BODY_BYTES ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/**
 * Fill `contextWindow` per model. `/api/ps` first — a loaded model's
 * `context_length` is what the server actually allocated; `/api/show`'s
 * `model_info.<arch>.context_length` (the model's maximum) covers the
 * rest. Every miss leaves the field unset (the registry default applies
 * downstream). Mutates `models` in place.
 */
async function enrichContextWindows(
  fetchImpl: ProbeFetch,
  origin: string,
  models: ProbedEndpointModel[]
): Promise<void> {
  const loaded = new Map<string, number>();
  const ps = await requestJson(fetchImpl, `${origin}/api/ps`);
  if (ps.ok) {
    const rows = (ps.data as { models?: unknown } | null)?.models;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const name = (row as { name?: unknown } | null)?.name;
        const length = (row as { context_length?: unknown }).context_length;
        if (typeof name === "string" && isPositiveInt(length)) {
          loaded.set(name, length);
        }
      }
    }
  }

  const unloaded: ProbedEndpointModel[] = [];
  for (const model of models) {
    const allocated = loaded.get(model.id);
    if (allocated !== undefined) model.contextWindow = allocated;
    else unloaded.push(model);
  }

  let cursor = 0;
  const enrichNext = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= unloaded.length) return;
      const model = unloaded[index]!;
      const show = await requestJson(fetchImpl, `${origin}/api/show`, {
        model: model.id,
      });
      if (!show.ok) continue;
      const info = (show.data as { model_info?: unknown } | null)?.model_info;
      if (!info || typeof info !== "object") continue;
      for (const [key, value] of Object.entries(info)) {
        if (key.endsWith(".context_length") && isPositiveInt(value)) {
          model.contextWindow = value;
          break;
        }
      }
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(MAX_CONCURRENT_OLLAMA_SHOW_REQUESTS, unloaded.length),
      },
      () => enrichNext()
    )
  );
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** `GET /api/tags` → `{models: [{name, capabilities?: string[]}]}`. */
function parseOllamaTags(data: unknown): ProbedEndpointModel[] | null {
  const models = (data as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return null;
  const out: ProbedEndpointModel[] = [];
  for (const m of models.slice(0, MAX_MODELS)) {
    const name = (m as { name?: unknown } | null)?.name;
    if (typeof name !== "string" || name.length === 0) continue;
    const caps = (m as { capabilities?: unknown }).capabilities;
    out.push({
      id: name,
      // Capabilities reported ⇒ trust them; absent (older Ollama) ⇒
      // unknown, leave undefined so the registry's permissive default
      // applies downstream.
      tool_call: Array.isArray(caps) ? caps.includes("tools") : undefined,
    });
  }
  return out;
}

/** `GET <base>/models` → `{data: [{id}]}` (OpenAI list shape). */
function parseOpenAiModels(data: unknown): ProbedEndpointModel[] | null {
  const rows = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return null;
  const out: ProbedEndpointModel[] = [];
  for (const m of rows.slice(0, MAX_MODELS)) {
    const id = (m as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || id.length === 0) continue;
    out.push({ id });
  }
  return out;
}
