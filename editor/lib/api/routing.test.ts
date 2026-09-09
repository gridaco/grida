// GRIDA-SEC-012 — Next config executes before proxy and must preserve machine routing.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextConfig } from "next";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { apiOperations } from "./operations";

let config: NextConfig;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_GRIDA_USE_TELEMETRY", "0");
  config = (await import("../../next.config")).default;
});
afterAll(() => vi.unstubAllEnvs());

type Rule = { source: string };
function matches(rule: Rule, pathname: string): boolean {
  return Boolean(getPathMatch(rule.source, { strict: true })(pathname));
}

function aliases(): string[] {
  let prefixes = [""];
  for (const character of "api/v1") {
    const forms = [
      ...new Set([
        character,
        `%${character.charCodeAt(0).toString(16)}`,
        `%${character.toUpperCase().charCodeAt(0).toString(16).toUpperCase()}`,
      ]),
    ];
    prefixes = prefixes.flatMap((prefix) => forms.map((form) => prefix + form));
  }
  return prefixes.flatMap((prefix) => [
    `/${prefix}/auth/me`,
    `/${prefix}/auth/me/`,
    `/${prefix}/auth/connect`,
  ]);
}

describe("Next configuration preserves the API boundary", () => {
  it("excludes API paths and their decoded aliases from all web redirects, rewrites and configured headers", async () => {
    const rewrites = await config.rewrites!();
    const rules: Rule[] = [
      ...(await config.redirects!()),
      ...(await config.headers!()),
      ...(Array.isArray(rewrites)
        ? rewrites
        : [
            ...(rewrites.beforeFiles ?? []),
            ...(rewrites.afterFiles ?? []),
            ...(rewrites.fallback ?? []),
          ]),
    ];
    const paths = [
      ...Object.values(apiOperations.definitions).flatMap(({ path }) => [
        path,
        path + "/",
      ]),
      "/api/v1",
      "/api/v1/",
      "/API/V1/auth/me/",
      "/API/V1/auth/connect",
      ...aliases(),
    ];
    const collisions = paths.flatMap((path) =>
      rules
        .filter((rule) => matches(rule, path))
        .map((rule) => ({ path, source: rule.source }))
    );
    expect(collisions).toEqual([]);
    expect(config.skipTrailingSlashRedirect).toBe(true);
  });
  it("preserves ordinary web slash and connect redirects, including lookalike API prefixes", async () => {
    const rules = await config.redirects!();
    const slash = rules.find((rule) => matches(rule, "/one/two/"))!;
    expect(slash.destination).toBe("/:path");
    expect(slash.permanent).toBe(true);
    expect(matches(slash, "/api/v10/")).toBe(true);
    const connect = rules.find((rule) =>
      matches(rule, "/one/two/three/connect")
    )!;
    expect(connect.destination).toBe("/:org/:proj/:id/connect/share");
    expect(matches(connect, "/api/v10/auth/connect")).toBe(true);
  });
  it("keeps legacy public API CORS and consent headers scoped to their existing paths", async () => {
    const rules = await config.headers!();
    expect(
      rules
        .filter((rule) => matches(rule, "/v1/example"))
        .flatMap((rule) => rule.headers)
    ).toContainEqual({ key: "Access-Control-Allow-Origin", value: "*" });
    expect(
      rules
        .filter((rule) => matches(rule, "/oauth/consent"))
        .flatMap((rule) => rule.headers)
    ).toContainEqual({ key: "Cache-Control", value: "no-store" });
  });
});
