import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import type { RouteHas } from "next/dist/lib/load-custom-routes";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";

// Exercise Vercel's compiled routes: an empty wildcard retains its preceding slash.
const { convertRewrites, convertRedirects } = createRequire(import.meta.url)(
  "next/dist/compiled/@vercel/routing-utils"
) as {
  convertRewrites(
    rules: { source: string; destination: string }[]
  ): { src: string; dest: string }[];
  convertRedirects(
    rules: {
      source: string;
      destination: string;
      permanent?: boolean;
      statusCode?: number;
      has?: RouteHas[];
      missing?: RouteHas[];
    }[]
  ): {
    src: string;
    status: number;
    headers?: Record<string, string>;
    has?: RouteHas[];
    missing?: RouteHas[];
  }[];
};

let config: NextConfig;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_GRIDA_USE_TELEMETRY", "0");
  vi.stubEnv("NEXT_PUBLIC_BLOG_URL", "https://blog.example.test");
  vi.stubEnv("NEXT_PUBLIC_WWW_INDEX_URL", "https://www.example.test");
  vi.stubEnv("VERCEL_URL", "preview-fixture-grida.vercel.app");
  vi.stubEnv("VERCEL_BRANCH_URL", "branch-fixture-grida.vercel.app");
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

describe("Standalone marketing routing", () => {
  async function redirectFor(host: string, path = "/index") {
    const request = new IncomingMessage(new Socket());
    request.headers.host = host;
    const routes = convertRedirects(await config.redirects!());
    return routes.find(
      ({ src, has, missing }) =>
        new RegExp(src).test(path) && matchHas(request, {}, has, missing)
    );
  }

  it.each([
    "grida.co",
    "GRIDA.CO:443",
    "preview-fixture-grida.vercel.app",
    "branch-fixture-grida.vercel.app",
    "localhost:3041",
    "127.0.0.1:3041",
  ])("redirects /index temporarily on app host %s", async (host) => {
    const route = await redirectFor(host);
    expect(route?.status).toBe(307);
    expect(route?.headers?.Location).toBe("https://grida.co/home");
  });

  it.each([
    "studio.grida.site",
    "studio.example.test",
    "grida.co.attacker.test",
    "preview-fixture-grida.vercel.app.attacker.test",
    "branch-fixture-grida.vercel.app.attacker.test",
    "other-deployment.vercel.app",
    "gridaXco",
  ])("leaves /index on %s to tenant routing", async (host) => {
    expect(await redirectFor(host)).toBeUndefined();
  });

  it.each([
    "/index/games",
    "/index/sitemap.xml",
    "/index/_next/static/example.js",
    "/index/canvas",
  ])("does not redirect descendant %s", async (path) => {
    expect(await redirectFor("grida.co", path)).toBeUndefined();
  });

  it.each([
    "/index/games",
    "/index/sitemap.xml",
    "/index/_next/static/example.js",
    "/index/_next/image",
    "/index/assets/example.png",
    "/index/canvas-demo",
  ])("preserves the exact upstream path for %s", async (path) => {
    const rewrites = await config.rewrites!();
    expect(Array.isArray(rewrites)).toBe(true);
    const routes = convertRewrites(
      rewrites as { source: string; destination: string }[]
    );
    const route = routes.find(({ src }) => new RegExp(src).test(path))!;
    expect(route).toBeDefined();
    expect(path.replace(new RegExp(route.src), route.dest)).toBe(
      `https://www.example.test${path}`
    );
  });

  it.each([
    "/index",
    "/index/canvas",
    "/index/canvas/",
    "/index/canvas/nested",
    "/indexation",
    "/home",
  ])("leaves %s with the existing Grida application", async (path) => {
    const rewrites = await config.rewrites!();
    const routes = convertRewrites(
      rewrites as { source: string; destination: string }[]
    );
    expect(routes.some(({ src }) => new RegExp(src).test(path))).toBe(false);
  });
});
