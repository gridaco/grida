import { PostgrestClient } from "@supabase/postgrest-js";

export function insert({
  table,
  data,
  url,
  anonKey,
}: {
  anonKey: string;
  url: string;
  table: string;
  data: any;
}) {
  console.log("inserting", data);
  const postgrest = new PostgrestClient(url, {
    headers: {
      apikey: anonKey,
    },
  });

  return postgrest.from(table).insert(data);
}
