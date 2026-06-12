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
 *   1. **Ollama native** — `GET <origin>/api/tags`. Reports ids AND
 *      capability tags, so `tool_call` comes back real.
 *   2. **Generic OpenAI-compatible** — `GET <base_url>/models`
 *      (LiteLLM, vLLM, …). Ids only.
 *
 * Deliberately NOT probed: the context window. Ollama's `/api/show`
 * reports a model's architectural maximum (e.g. 262k for a model served
 * at 8k) — auto-filling it would make compaction fire too late and kill
 * long sessions on overflow. That field stays user-set with the
 * registry's conservative default.
 *
 * Threat note (reviewed): the probe makes the host GET a user-supplied
 * URL. This is the SAME egress the run path already performs against a
 * configured endpoint (and the writer is the same authenticated loopback
 * client), so it widens nothing — but the route must never become a
 * generic proxy: responses are parsed and reduced to `{id, tool_call}`
 * rows; raw bodies never reach the client. Reads are bounded (timeout +
 * size cap) and the URL shape is pinned to http(s).
 */

import type { ProbedEndpointModel } from "../protocol/endpoints";

const PROBE_TIMEOUT_MS = 4_000;
const MAX_BODY_BYTES = 1_048_576;
const MAX_MODELS = 64;

export type EndpointProbeResult =
  | { ok: true; source: "ollama" | "openai"; models: ProbedEndpointModel[] }
  | { ok: false; error: string };

/** The `fetch` seam — tests inject a fake; production uses the global. */
export type ProbeFetch = (
  url: string,
  init: { signal: AbortSignal }
) => Promise<Response>;

export async function probeEndpointModels(
  baseUrl: string,
  fetchImpl: ProbeFetch = fetch
): Promise<EndpointProbeResult> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, error: "base_url must be a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "base_url must be http(s)" };
  }

  // 1. Ollama native — capability tags ride along.
  const ollama = await getJson(fetchImpl, `${url.origin}/api/tags`);
  if (ollama.ok) {
    const models = parseOllamaTags(ollama.data);
    if (models) return { ok: true, source: "ollama", models };
  }

  // 2. Generic OpenAI-compatible — ids only.
  const base = baseUrl.replace(/\/+$/, "");
  const openai = await getJson(fetchImpl, `${base}/models`);
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

async function getJson(fetchImpl: ProbeFetch, url: string): Promise<JsonProbe> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false };
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
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
