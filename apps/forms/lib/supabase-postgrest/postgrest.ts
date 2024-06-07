import { PostgrestClient } from "@supabase/postgrest-js";

export function insert({
  table,
  data,
  url,
  schema,
  apiKey,
}: {
  apiKey: string;
  url: string;
  schema: "public" | ({} | string);
  table: string;
  data: any;
}) {
  const postgrest = new PostgrestClient(url, {
    headers: {
      apikey: apiKey,
      Authorization: "Bearer " + apiKey,
    },
    schema: schema as string,
  });

  console.log("url", postgrest.url, postgrest.headers, postgrest);

  return postgrest.from(table).insert(data);
}
