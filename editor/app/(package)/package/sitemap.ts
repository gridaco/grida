import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://grida.co/package";

  return [
    {
      url: `${baseUrl}/@grida/ruler`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/@grida/transparency-grid`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/@grida/pixel-grid`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
