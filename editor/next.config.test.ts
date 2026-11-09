import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";
import { createRequire } from "node:module";

// Exercise Vercel's compiled routes: an empty wildcard retains its preceding slash.
const { convertRewrites } = createRequire(import.meta.url)(
  "next/dist/compiled/@vercel/routing-utils"
) as {
  convertRewrites(
    rules: { source: string; destination: string }[]
  ): { src: string; dest: string }[];
};

let config: NextConfig;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_GRIDA_USE_TELEMETRY", "0");
  vi.stubEnv("NEXT_PUBLIC_BLOG_URL", "https://blog.example.test");
  config = (await import("./next.config")).default;
});
afterAll(() => vi.unstubAllEnvs());

describe("Standalone blog routing", () => {
  it.each([
    "/blog",
    "/blog/refig",
    "/blog/tags/canvas",
    "/blog/sitemap.xml",
    "/blog/_next/static/example.js",
    "/blog/assets/images/legacy.png",
  ])("preserves the exact upstream path for %s", async (path) => {
    const rewrites = await config.rewrites!();
    expect(Array.isArray(rewrites)).toBe(true);
    const routes = convertRewrites(
      rewrites as { source: string; destination: string }[]
    );
    const route = routes.find(({ src }) => new RegExp(src).test(path))!;
    expect(route).toBeDefined();
    expect(path.replace(new RegExp(route.src), route.dest)).toBe(
      `https://blog.example.test${path}`
    );
  });
});
