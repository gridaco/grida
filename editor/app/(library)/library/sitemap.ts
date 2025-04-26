import type { MetadataRoute } from "next/types";
import { list } from "../actions";
import { Env } from "@/env";

// Note: Google's limit is 50,000 URLs per sitemap
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // TODO: need to update query as the library size grows (max 5,000 per page)
  const objects = await list();
  return objects.data.map(
    (object) =>
      ({
        url: `${Env.gridaco}/library/o/${object.id}`,
        changeFrequency: "yearly",
        lastModified: object.updated_at,
      }) satisfies MetadataRoute.Sitemap[number]
  );
}
