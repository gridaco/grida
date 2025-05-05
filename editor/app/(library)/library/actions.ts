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
  options: { range: [number, number] } = { range: [0, PAGE - 1] }
): Promise<{
  data: Library.ObjectDetail[] | null;
  error: any | null;
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
  const client = await createLibraryClient();

  const q = client
    .from("object")
    .select(__select_object_with_author, { count: "estimated" });

  if (category) {
    q.eq("category", category);
  }

  if (text?.trim()) {
    q.textSearch("search_tsv", text, {
      config: "simple",
      type: "plain",
    });
  }

  q.order("score", { ascending: false, nullsFirst: false });
  q.order("id", { ascending: true });
  q.range(range[0], range[1]);

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
