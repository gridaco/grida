import type { MetadataRoute } from "next";
import { Env } from "@/env";
import { packages } from "./data";

export default function sitemap(): MetadataRoute.Sitemap {
  return packages.map((pkg) => ({
    url: `${Env.gridaco}${pkg.demoPath}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
}
