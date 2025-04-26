"use server";
import { createLibraryClient } from "@/lib/supabase/server";

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
  };
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
  }));

  return {
    data: objects,
    count,
  };
}

export async function search({
  limit,
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
    q.limit(limit);
  }

  if (text) {
    q.textSearch("search_tsv", text, {
      config: "simple",
      type: "plain",
    });
  }

  const { data, error, count } = await q;

  if (error) {
    throw error;
  }

  const objects = data.map((object) => ({
    ...object,
    url: client.storage.from("library").getPublicUrl(object.path).data
      .publicUrl,
  }));

  return {
    data: objects,
    count: count,
  };
}
