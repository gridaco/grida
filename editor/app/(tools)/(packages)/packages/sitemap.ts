import type { MetadataRoute } from "next";
import { packages } from "./data";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://grida.co";

  return packages.map((pkg) => ({
    url: `${baseUrl}${pkg.demoPath}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
}
