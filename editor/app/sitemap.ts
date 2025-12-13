import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // home
    {
      url: "https://grida.co",
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://grida.co/pricing",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/blog",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/docs",
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/contact",
      changeFrequency: "yearly",
      priority: 0.1,
    },
    // products
    {
      url: "https://grida.co/forms",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/forms/ai",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/forms/supabase",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/database",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/database/supabase",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/canvas",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/sdk",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/figma/ci",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/figma/assistant",
      changeFrequency: "monthly",
      priority: 0.5,
    },

    // playground
    {
      url: "https://grida.co/playground",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/playground/forms",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/playground/image",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // resources
    {
      url: "https://grida.co/brand",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/downloads",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/bundle",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/library",
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: "https://grida.co/packages",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/ai/models",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/blobs",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/halftone",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/e164",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/fig",
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
