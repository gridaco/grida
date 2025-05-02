"use server";
import type { Library } from "@/lib/library";
import { createLibraryClient } from "@/lib/supabase/server";

export async function getCategory(id: string) {
  const client = await createLibraryClient();
  const { data } = await client
    .from("category")
    .select("*")
    .eq("id", id)
    .single();

  return data;
}

export async function getObject(id: string) {
  const client = await createLibraryClient();
  const { data, error } = await client
    .from("object")
    .select("*, author(*)")
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

export async function listCategories(): Promise<Library.Category[]> {
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

export async function list() {
  const client = await createLibraryClient();
  const { data, error, count } = await client
    .from("object")
    .select("*, author(*)", { count: "estimated" });

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
    count,
  };
}

const MAX_LIMIT = 100;

export async function search({
  limit = 100,
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

  q.order("score", { ascending: false });

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
