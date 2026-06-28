/**
 * Shared primitives for the library embedding scripts (embed-fixtures,
 * ingest-sources, backfill-prod, load-vectors).
 *
 * Single source for the consistency-critical post-processing (truncate to
 * the configured dim + L2-normalize) and the OpenRouter `/embeddings` call
 * with retry/backoff — so the scripts can't drift from each other or from
 * the editor query embedder (which applies the same truncation).
 */
import aimodels from "@grida/ai-models";

export const MODEL_ID = aimodels.embedding.LIBRARY_EMBEDDING_MODEL_ID;
export const DIM = aimodels.embedding.LIBRARY_EMBEDDING_DIMENSIONS;
export const OPENROUTER_EMBEDDINGS_URL =
  "https://openrouter.ai/api/v1/embeddings";

export function openrouterKey(): string {
  const k =
    process.env.BYOK_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!k)
    throw new Error("BYOK_OPENROUTER_API_KEY (or OPENROUTER_API_KEY) required");
  return k;
}

/** Truncate to DIM (Matryoshka) + L2-normalize. Mirror of the editor's
 *  `toLibraryVector` so stored and query vectors stay comparable. */
export function toLibraryVector(embedding: number[]): number[] {
  if (embedding.length < DIM) {
    throw new Error(`embedding dim ${embedding.length} < required ${DIM}`);
  }
  const s = embedding.slice(0, DIM);
  let sum = 0;
  for (const x of s) sum += x * x;
  const n = Math.sqrt(sum);
  return n === 0 ? s : s.map((x) => x / n);
}

/** pgvector text literal for a vector column. */
export const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;

/** OpenAI-compatible multimodal input wrapping one image (data: or http URL). */
const imageInput = (url: string) => [
  { content: [{ type: "image_url", image_url: { url } }] },
];

/**
 * POST to the OpenRouter `/embeddings` endpoint, returning a library vector
 * (1536-d, normalized). Retries 429/5xx with exponential backoff + jitter;
 * a non-retryable response (e.g. 400 "invalid image" for raw SVG) throws
 * immediately so the caller can skip the row.
 */
export async function embedViaOpenRouter(
  input: unknown,
  key: string = openrouterKey(),
  retries = 5
): Promise<number[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL_ID, input }),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`retryable ${res.status}`);
      }
      const j = await res.json();
      if (!res.ok || j.error) {
        const e = new Error(
          JSON.stringify(j.error ?? j).slice(0, 200)
        ) as Error & { fatal?: boolean };
        e.fatal = true;
        throw e;
      }
      return toLibraryVector(j.data[0].embedding as number[]);
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) throw e;
      const backoff =
        Math.min(8000, 400 * 2 ** attempt) + Math.floor(Math.random() * 300);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

export const embedText = (text: string, key?: string) =>
  embedViaOpenRouter(text, key);

/** Embed an image given by URL (data: URL or public http URL). */
export const embedImageUrl = (url: string, key?: string) =>
  embedViaOpenRouter(imageInput(url), key);
