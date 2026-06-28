# Sibling-repo worker port — Titan → Gemini Embedding 2

Concrete spec for **PR2** in `gridaco/library` (the live pgmq embedding worker).
The TS reference that validated every contract below is
[`embed-fixtures.ts`](./embed-fixtures.ts) / [`ingest-sources.ts`](./ingest-sources.ts).

> This is implementation handoff material, not a WG doc. Apply it in
> `gridaco/library`; it pairs with the additive DB migration already landed in
> `gridaco/grida` (`gemini_embedding_2__image` / `__text` columns).

## Invariants (must match the editor query side exactly)

- **Model:** `google/gemini-embedding-2`. **Dim:** request default (3072), then
  **slice first 1536 + L2-normalize**. Do NOT rely on a provider `dimensions`
  param — the editor truncates client-side, so the worker must do the identical
  post-processing or the vectors are not comparable.
- **Two single-modality vectors, never fused.** `gemini_embedding_2__image` =
  image only (always). `gemini_embedding_2__text` = `title + description +
keywords` joined, only when a description exists, else leave `NULL`.
- **Provider:** prod = Vercel AI Gateway; local = OpenRouter (dev key). Both
  OpenAI-compatible `/embeddings`, same model id — make the base URL + key
  env-driven. (VERIFY the Gateway serves the image/multimodal embedding before
  prod; OpenRouter is the confirmed-multimodal fallback.)

## Verified OpenRouter `/embeddings` contract

- **Text:** `{"model": MODEL, "input": "some text"}` → `data[0].embedding` (3072).
- **Image:** `{"model": MODEL, "input": [{"content": [{"type": "image_url",
"image_url": {"url": "data:image/png;base64,…"}}]}]}` → 3072.
- Response also carries `usage.total_tokens` + `usage.cost`.

## `worker/src/embedding.py` — replace Bedrock/Titan

```python
import os, math, base64, requests

EMBED_URL = os.getenv("EMBEDDINGS_URL", "https://openrouter.ai/api/v1/embeddings")
EMBED_KEY = os.getenv("EMBEDDINGS_API_KEY")           # OpenRouter (local) / Gateway (prod)
MODEL_ID  = os.getenv("EMBEDDING_MODEL_ID", "google/gemini-embedding-2")
DIM       = int(os.getenv("EMBEDDING_DIM", "1536"))

class EmbedError(Exception): ...

def _post(input_payload) -> list[float]:
    r = requests.post(EMBED_URL, headers={
        "Authorization": f"Bearer {EMBED_KEY}", "Content-Type": "application/json",
    }, json={"model": MODEL_ID, "input": input_payload}, timeout=60)
    j = r.json()
    if not r.ok or j.get("error"):
        raise EmbedError(str(j.get("error") or j))
    return _to_library_vector(j["data"][0]["embedding"])

def _to_library_vector(v: list[float]) -> list[float]:
    if len(v) < DIM:
        raise EmbedError(f"dim {len(v)} < {DIM}")
    s = v[:DIM]
    n = math.sqrt(sum(x * x for x in s))
    return s if n == 0 else [x / n for x in s]

def embed_image(image: bytes, mimetype: str) -> list[float]:
    # reuse existing fit/resize from embedding_transform if desired; Gemini
    # accepts large images but cap to stay under request limits.
    b64 = base64.b64encode(image).decode()
    data_url = f"data:{mimetype};base64,{b64}"
    return _post([{"content": [{"type": "image_url", "image_url": {"url": data_url}}]}])

def embed_text(text: str) -> list[float]:
    return _post(text)
```

`embedding_transform.py`: keep `b64`/SVG→PNG conversion; the Titan-specific
size clamp can be relaxed (Gemini's limits differ) but downscaling very large
images is still worthwhile.

## `worker/src/worker.py` — dual-write

On each job (`object_id`, `path`, `mimetype`):

1. Download the image (existing storage download).
2. `image_vec = embed_image(obj, mimetype)` → upsert
   `object_embedding.gemini_embedding_2__image` (as a `[..]` vector literal /
   list).
3. Fetch the object's `title, description, keywords`. If `description` present:
   `text_vec = embed_text("title. description. kw1 kw2")` → upsert
   `gemini_embedding_2__text`; else leave NULL.
4. **Transition window:** ALSO keep writing the legacy Titan `embedding` (the
   existing `embed()` call) so `similar()` stays live on Titan until the
   `gridaco/grida` cutover migration repoints it. Remove the Titan path only
   after cutover + soak.
5. Existing `update_metadata` (color/palette/orientation) unchanged.

`upsert_embedding` becomes a multi-column upsert:

```python
def upsert_embedding(self, object_id, image_vec, text_vec=None):
    self.library_client.table("object_embedding").upsert({
        "object_id": object_id,
        "gemini_embedding_2__image": image_vec,
        "gemini_embedding_2__text": text_vec,   # None → NULL
    }).execute()
```

## One-time backfill (also serves the grida-repo Stage-2 dump-to-local)

A standalone script that pages all `grida_library.object (id, path, title,
description, keywords)`, downloads each image, computes the vectors, and:

- **Stage 2 (grida repo, read-only prod):** writes vectors to LOCAL files
  (JSONL keyed by `object_id`) — no DB writes.
- **Stage 3 (prod):** upserts the new columns.
  Idempotent (skip rows already populated), resumable, concurrency-limited.

## Env (`.env.example` additions)

```
EMBEDDINGS_URL=https://openrouter.ai/api/v1/embeddings   # prod: Vercel AI Gateway
EMBEDDINGS_API_KEY=...
EMBEDDING_MODEL_ID=google/gemini-embedding-2
EMBEDDING_DIM=1536
```

Drop the `AWS_*` / Bedrock vars after the Titan path is removed post-cutover.
