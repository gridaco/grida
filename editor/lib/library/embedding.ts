import "server-only";
import aimodels from "@grida/ai-models";
import { embedTextUnbilled } from "@/lib/ai/server";

/**
 * Library query embedding — the query side of the Grida Library retrieval
 * pipeline.
 *
 * This is an AI-using feature OWNED BY the Library, not part of the core AI
 * system: it composes the seam's generic embedding primitive
 * ({@link embedTextUnbilled}) with the Library's own model id, dimensionality
 * + normalization, and a query cache. The worker (document side, sibling
 * repo) embeds asset image + text with the SAME model/dim/normalization
 * recorded on the `@grida/ai-models` embedding card — that card is the single
 * source of the consistency invariant both sides read.
 */

const MODEL_ID = aimodels.embedding.LIBRARY_EMBEDDING_MODEL_ID;
const DIM = aimodels.embedding.LIBRARY_EMBEDDING_DIMENSIONS;

/**
 * Reduce a (possibly native-3072) Matryoshka embedding to the configured dim
 * and L2-normalize. Truncation = take the first N dims (valid for MRL models);
 * re-normalize so cosine distance is well-defined and query and document
 * vectors are comparable. Provider-agnostic — no dependence on a
 * provider-specific `outputDimensionality` option.
 */
function toLibraryVector(embedding: number[]): number[] {
  if (embedding.length < DIM) {
    throw new Error(`embedding dim ${embedding.length} < required ${DIM}`);
  }
  const sliced = embedding.slice(0, DIM);
  let sum = 0;
  for (const x of sliced) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return sliced;
  return sliced.map((x) => x / norm);
}

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

// Process-local cache: library search queries are short and highly
// repetitive, so even an in-process cache absorbs most calls. Bounded with
// simple FIFO eviction so a long-lived server can't grow it without limit
// (each entry is ~12KB). Prod should back this with a shared store (KV);
// route-level rate-limiting is the search action's job.
const CACHE_MAX = 5000;
const _cache = new Map<string, number[]>();

/**
 * PUBLIC / UNBILLED query embedding for the Library web search. Cached by
 * normalized query. The public surface MUST also rate-limit before calling
 * this (see the library search action) — the cache only helps repeats.
 */
export async function embedLibraryQuery(query: string): Promise<number[]> {
  const key = normalizeQuery(query);
  const cached = _cache.get(key);
  if (cached) return cached;
  const vec = toLibraryVector(await embedTextUnbilled(MODEL_ID, key));
  if (_cache.size >= CACHE_MAX) {
    _cache.delete(_cache.keys().next().value!);
  }
  _cache.set(key, vec);
  return vec;
}
