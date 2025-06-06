import type { MetadataRoute } from "next/types";
import { Env } from "@/env";
import { service_role } from "@/lib/supabase/server";

async function fetchAllObjects(): Promise<
  { id: string; updated_at: string; priority: number | null }[]
> {
  const allObjects = [];
  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;

  while (true) {
    const { data, error } = await service_role.library
      .from("object")
      .select("id, updated_at, priority")
      .range(from, to);

    if (error) throw error;

    if (!data || data.length === 0) break;

    allObjects.push(...data);

    if (data.length < pageSize) break; // last page
    from += pageSize;
    to += pageSize;
  }

  return allObjects;
}

// Note: Google's limit is 50,000 URLs per sitemap
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const objects = await fetchAllObjects();

  return objects.map(
    (object) =>
      ({
        url: `${Env.gridaco}/library/o/${object.id}`,
        changeFrequency: "yearly",
        lastModified: object.updated_at,
        priority: object.priority || 0,
      }) satisfies MetadataRoute.Sitemap[number]
  );
}
