"use server";
import type { Library } from "@/lib/library";
import { createLibraryClient } from "@/lib/supabase/server";
import { cache } from "react";

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

export async function _getObject(id: string): Promise<Library.ObjectDetail> {
  const client = await createLibraryClient();
  const { data, error } = await client
    .from("object")
    .select(
      `
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
      `
    )
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    url: client.storage.from("library").getPublicUrl(data.path).data.publicUrl,
    download: client.storage
      .from("library")
      .getPublicUrl(data.path, { download: true }).data.publicUrl,
  };
}

export const getObject = cache(_getObject);

export async function random({ text }: { text?: string }) {
  const client = await createLibraryClient();

  if (text) {
    const s = await search({ text, limit: 1 });
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

  return {
    ...data,
    url: client.storage.from("library").getPublicUrl(data.path).data.publicUrl,
    download: client.storage
      .from("library")
      .getPublicUrl(data.path, { download: true }).data.publicUrl,
  };
}

export async function _similar(
  id: string,
  options: { limit: number } = { limit: 60 }
): Promise<{
  data: Library.ObjectDetail[] | null;
  error: any | null;
}> {
  const client = await createLibraryClient();
  const { data, error } = await client
    // Note: for some reason get: true doesn't work with this function.
    .rpc("similar", {
      ref_id: id,
    })
    .select("*, author(*)")
    .limit(options.limit);

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

const MAX_LIMIT = 60;

export async function search({
  limit = 60,
  text,
  category,
}: {
  limit?: number;
  category?: string;
  text?: string;
}) {
  if (!text && !category) {
    return { data: [], count: 0 };
  }
  const client = await createLibraryClient();

  const q = client.from("object").select("*, author(*)", { count: "exact" });
  if (category) {
    q.eq("category", category);
  }

  if (limit) {
    q.limit(Math.min(limit, MAX_LIMIT));
  }

  if (text?.trim()) {
    q.textSearch("search_tsv", text, {
      config: "simple",
      type: "plain",
    });
  }

  q.order("score", { ascending: false, nullsFirst: false });

  const { data, error, count } = await q;

  if (error) {
    throw error;
  }

  const objects = data.map((object) => ({
    ...object,
    url: client.storage.from("library").getPublicUrl(object.path).data
      .publicUrl,
    download: client.storage
      .from("library")
      .getPublicUrl(object.path, { download: true }).data.publicUrl,
  }));

  return {
    data: objects,
    count: count,
  };
}
