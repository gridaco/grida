import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn<() => Promise<{ data: unknown[]; error: null }>>();
  return {
    env: { server: { IS_HOSTED: false }, web: { HOST: "https://grida.co" } },
    rpc,
    serviceRolePublicClient: vi.fn<() => { rpc: typeof rpc }>(() => ({ rpc })),
  };
});

vi.mock("@/env", () => ({ Env: mocks.env }));
vi.mock("@/lib/supabase/service-role-cookie-free-clients", () => ({
  serviceRolePublicClient: mocks.serviceRolePublicClient,
}));

import { TenantMiddleware } from "./middleware";

beforeEach(() => {
  mocks.env.server.IS_HOSTED = false;
  mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.serviceRolePublicClient.mockClear();
  vi.stubEnv("NEXT_PUBLIC_URL", "grida.co");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_BRANCH_URL", "");
  vi.stubEnv("GRIDA_INTERNAL_PROXY_TOKEN", "");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => {
      throw new Error("Unexpected network request");
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function route(host: string, path: string) {
  const url = `http://${host}${path}`;
  return TenantMiddleware.routeProxyRequest(
    new NextRequest(url, { headers: { host } }),
    NextResponse.next()
  );
}

describe("TenantMiddleware local app hosts", () => {
  it.each(["localhost", "127.0.0.1", "127.0.0.2", "127.1", "[::1]"])(
    "classifies %s as an app host rather than a tenant",
    (hostname) => {
      const url = new URL(`http://${hostname}:3041/settings`);
      expect(TenantMiddleware.analyze(url, true)).toEqual({
        name: null,
        apex: "localhost",
        domain: url.hostname,
      });
    }
  );

  it.each([
    "/",
    "/settings",
    "/oauth/consent?authorization_id=fixture",
    "/insiders/auth/basic",
  ])(
    "keeps the literal IPv4 loopback app route %s on its canonical pathname",
    async (path) => {
      expect(await route("127.0.0.1:3041", path)).toBeNull();
      expect(mocks.serviceRolePublicClient).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(["localhost:3041", "127.0.0.1:3041", "127.0.0.2:3041", "[::1]:3041"])(
    "blocks direct tenant-layout access on local app host %s",
    async (host) => {
      const response = await route(host, "/~/studio/private");
      expect(response?.status).toBe(307);
      expect(new URL(response!.headers.get("location")!).pathname).toBe("/");
      expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
      expect(mocks.serviceRolePublicClient).not.toHaveBeenCalled();
    }
  );

  it("preserves named tenant.localhost classification and path rewriting", async () => {
    expect(
      TenantMiddleware.analyze(new URL("http://studio.localhost:3041/"), true)
    ).toEqual({
      name: "studio",
      apex: "localhost",
      domain: "studio.localhost",
    });
    const response = await route("studio.localhost:3041", "/portfolio?q=one");
    const rewritten = new URL(response!.headers.get("x-middleware-rewrite")!);
    expect(rewritten.hostname).toBe("studio.localhost");
    expect(rewritten.pathname).toBe("/~/studio/portfolio");
    expect(rewritten.search).toBe("?q=one");
    expect(
      await route("studio.localhost:3041", "/~/studio/portfolio")
    ).toBeNull();
    expect(mocks.serviceRolePublicClient).not.toHaveBeenCalled();
  });

  it("does not classify a DNS hostname beginning with 127 as a loopback address", () => {
    expect(
      TenantMiddleware.analyze(new URL("http://127.localhost:3041/"), true).name
    ).toBe("127");
  });
});

describe("TenantMiddleware hosted routing", () => {
  beforeEach(() => {
    mocks.env.server.IS_HOSTED = true;
  });

  it("preserves reserved app host behavior", async () => {
    expect(await route("grida.co", "/settings")).toBeNull();
    expect((await route("grida.co", "/~/studio/private"))?.status).toBe(307);
    expect(mocks.serviceRolePublicClient).not.toHaveBeenCalled();
  });

  it("preserves canonical platform tenant rewriting", async () => {
    const response = await route("studio.grida.site", "/portfolio?q=one");
    const rewritten = new URL(response!.headers.get("x-middleware-rewrite")!);
    expect(rewritten.pathname).toBe("/~/studio/portfolio");
    expect(rewritten.search).toBe("?q=one");
    expect(mocks.rpc).toHaveBeenCalledWith("www_get_canonical_hostname", {
      p_www_name: "studio",
    });
  });

  it("preserves canonical redirects from the alternate platform domain", async () => {
    const response = await route("studio.grida.app", "/portfolio?q=one");
    expect(response?.status).toBe(301);
    expect(response?.headers.get("location")).toBe(
      "https://studio.grida.site/portfolio?q=one"
    );
  });
});
