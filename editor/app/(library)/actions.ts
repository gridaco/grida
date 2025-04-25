"use server";
import { createLibraryClient } from "@/lib/supabase/server";

export async function list() {
  const client = await createLibraryClient();
  const { data, error, count } = await client
    .from("object")
    .select("*", { count: "estimated" });

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

export async function search(query: string) {
  const client = await createLibraryClient();
  const { data, error, count } = await client
    .from("object")
    .select("*", { count: "exact" })
    .textSearch("search_tsv", query, {
      config: "simple",
      type: "plain",
    });
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
