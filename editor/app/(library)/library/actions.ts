"use server";
import type { Library } from "@/lib/library";
import { createLibraryClient } from "@/lib/supabase/server";
import { embedLibraryQuery } from "@/lib/library/embedding";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { cache } from "react";

// Public/unbilled semantic search hits a paid embedding provider, so gate it
// per-IP. Upstash sliding window when configured; in unconfigured envs (local
// dev) it fails open and the seam's query-hash cache is the backstop.
let _searchLimiter: Ratelimit | null | undefined;
function semanticSearchLimiter(): Ratelimit | null {
  if (_searchLimiter !== undefined) return _searchLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  _searchLimiter =
    url && token
      ? new Ratelimit({
          redis: new Redis({ url, token }),
          limiter: Ratelimit.slidingWindow(30, "60 s"),
          prefix: "rl:library-semantic-search",
        })
      : null;
  return _searchLimiter;
}

async function allowSemanticSearch(): Promise<boolean> {
  const limiter = semanticSearchLimiter();
  if (!limiter) return true;
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const { success } = await limiter.limit(ip);
  return success;
}

type ObjectWithAuthor = Library.Object & {
  author: Library.Author | null;
};

export async function _getCategory(id: string) {
  const client = await createLibraryClient();
  const { data } = await client
    .from("category")
    .select("*")
    .eq("id", id)
    .single();

  return data;
}

export const getCategory = cache(_getCategory);

const __select_object_with_author = `
  alt,
  author_id,
  background,
  bytes,
  categories,
  category,
  color,
  colors,
  created_at,
  description,
  entropy,
  fill,
  generator,
  gravity_x,
  gravity_y,
  height,
  id,
  keywords,
  lang,
  license,
  mimetype,
  objects,
  orientation,
  path,
  path_tokens,
  prompt,
  public_domain,
  score,
  title,
  transparency,
  updated_at,
  version,
  width,
  year,
  author(*)
`;

// Attach public + download URLs to library object rows. Shared by the
// listing, similar, and search paths.
function __with_object_urls(
  client: Awaited<ReturnType<typeof createLibraryClient>>,
  objects: ObjectWithAuthor[]
): Library.ObjectDetail[] {
  return objects.map((object) => ({
    ...object,
    url: client.storage.from("library").getPublicUrl(object.path).data
      .publicUrl,
    download: client.storage
      .from("library")
      .getPublicUrl(object.path, { download: true }).data.publicUrl,
  }));
}

export async function _getObject(id: string): Promise<Library.ObjectDetail> {
  const client = await createLibraryClient();
  const { data, error } = await client
    .from("object")
    .select(__select_object_with_author)
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return __with_object_urls(client, [data as unknown as ObjectWithAuthor])[0];
}

export const getObject = cache(_getObject);

export async function random({ text }: { text?: string }) {
  const client = await createLibraryClient();

  if (text) {
    const s = await search({ text, range: [0, 0] });
    if (s.data.length) {
      return s.data[0];
    }
  }

  const { data, error } = await client
    .rpc(
      "random",
      {
        p_limit: 1,
      },
      { get: true }
    )
    .single();

  if (error) {
    throw error;
  }

  return __with_object_urls(client, [data as unknown as ObjectWithAuthor])[0];
}

export async function _similar(
  id: string,
  options: { range: [number, number] } = { range: [0, PAGE - 1] }
): Promise<{
  data: Library.ObjectDetail[] | null;
  error: unknown;
}> {
  const client = await createLibraryClient();
  const { data, error } = await client
    .rpc(
      "similar",
      {
        ref_id: id,
      },
      { count: "estimated", get: true }
    )
    .select(__select_object_with_author)
    .range(options.range[0], options.range[1]);

  return {
    data:
      (data as unknown as ObjectWithAuthor[])?.map((object) => ({
        ...object,
        url: client.storage.from("library").getPublicUrl(object.path).data
          .publicUrl,
        download: client.storage
          .from("library")
          .getPublicUrl(object.path, { download: true }).data.publicUrl,
      })) || null,
    error,
  };
}

export const similar = cache(_similar);

export async function _listCategories(): Promise<Library.Category[]> {
  const client = await createLibraryClient();
  const { data, error } = await client
    .from("category")
    .select("*")
    // exclude IDs starting with _
    .not("id", "ilike", "\\_%");

  if (error) {
    throw error;
  }

  return data;
}

export const listCategories = cache(_listCategories);

const PAGE = 60;

/**
 * Cold browse — the curated corpus ordered by score, optionally filtered to a
 * category. Powers the desktop home's reference gallery
 * (scroll-and-pick-to-start): unlike {@link search}, which returns empty for an
 * empty query, this lists the library best-first so the gallery has something
 * to show before any keyword. Also the listing behind `search`'s category-only
 * branch, so the curation-order query is defined once. Paginated by `range`
 * with an estimated `count` for infinite scroll.
 */
export async function browse({
  category,
  range = [0, PAGE - 1],
}: { category?: string; range?: [number, number] } = {}): Promise<{
  data: Library.ObjectDetail[];
  count: number | undefined;
}> {
  const client = await createLibraryClient();
  const q = client
    .from("object")
    .select(__select_object_with_author, { count: "estimated" });
  if (category) {
    q.eq("category", category);
  }
  const { data, error, count } = await q
    .order("score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(range[0], range[1]);
  if (error) {
    throw error;
  }
  return {
    data: __with_object_urls(client, data as unknown as ObjectWithAuthor[]),
    count: count ?? undefined,
  };
}

export async function search({
  text,
  category,
  range = [0, PAGE - 1],
}: {
  category?: string;
  text?: string;
  range?: [number, number];
}) {
  if (!text && !category) {
    return { data: [], count: 0 };
  }

  // Category-only (no query text): a filtered listing, not a search — the
  // same curation-score browse the reference gallery uses.
  if (!text?.trim()) {
    return browse({ category, range });
  }
  const client = await createLibraryClient();

  // Semantic search: embed the query (text↔text, with a cross-modal image
  // floor handled inside the `search` RPC). Pagination is done inside the
  // RPC via match_count/match_offset — do NOT also chain `.range()`.

  // Gate the public/unbilled embedding call before paying the provider.
  if (!(await allowSemanticSearch())) {
    return { data: [], count: 0 };
  }

  // The RPC paginates internally, so its row count is only the current
  // window. Use the RPC's candidate universe as the gallery total so the
  // infinite loader pages through exactly the rows that can be returned —
  // i.e. objects that actually have a gemini image embedding (the union of
  // both tiers), not every object in the category. Independent of the
  // embedding → run concurrently.
  let totalQuery = client
    .from("object")
    .select("id, object_embedding!inner(object_id)", {
      count: "estimated",
      head: true,
    })
    .not("object_embedding.gemini_embedding_2__image", "is", null);
  if (category) {
    totalQuery = totalQuery.eq("category", category);
  }

  const [query_embedding, totalRes] = await Promise.all([
    embedLibraryQuery(text),
    totalQuery,
  ]);

  // NOTE: POST (not `get: true`) — the 1536-d vector arg would overflow the
  // URL as a GET query string ("URI too long").
  const { data, error } = await client
    .rpc("search", {
      query_embedding: query_embedding as unknown as string,
      match_count: range[1] - range[0] + 1,
      match_offset: range[0],
      match_category: category ?? undefined,
    })
    .select(__select_object_with_author);

  if (error) {
    throw error;
  }
  if (totalRes.error) {
    throw totalRes.error;
  }

  return {
    data: __with_object_urls(
      client,
      (data as unknown as ObjectWithAuthor[]) ?? []
    ),
    count: totalRes.count ?? undefined,
  };
}
