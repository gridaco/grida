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
      changeFrequency: "weekly",
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
      url: "https://grida.co/database",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/canvas",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://grida.co/playground",
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
      url: "https://grida.co/playground/image",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // resources
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
      url: "https://grida.co/tools",
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/blobs",
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/halftone",
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: "https://grida.co/tools/e164",
      changeFrequency: "daily",
      priority: 0.5,
    },
  ];
}
