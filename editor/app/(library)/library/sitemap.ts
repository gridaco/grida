import type { MetadataRoute } from "next/types";
import { Env } from "@/env";
import { listCategories } from "./actions";

// Note: Google's limit is 50,000 URLs per sitemap
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const categories = await listCategories();

  const _c = categories.map(
    (category) =>
      ({
        url: `${Env.gridaco}/library/${category.id}`,
        changeFrequency: "hourly",
        priority: 0.8,
      }) satisfies MetadataRoute.Sitemap[number]
  );

  return [..._c];
}
