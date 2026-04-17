import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_PLATFORM_APEX_DOMAIN } from "@/lib/domains";

// Mirrors the subset of Supabase's `rpc(fn, args)` signature the production
// code actually calls.
type RpcFn = (fn: string, args: unknown) => unknown;
const rpcMock = vi.hoisted(() => vi.fn<RpcFn>());

vi.mock("@/lib/supabase/service-role-cookie-free-clients", () => ({
  serviceRolePublicClient: () => ({ rpc: rpcMock }),
}));

describe("lib/tenant-url", () => {
  async function importSubject() {
    const mod = await import("./tenant-url");
    return mod.buildTenantSiteBaseUrl;
  }

  beforeEach(() => {
    rpcMock.mockReset();
  });

  test("builds localhost tenant base URL in local dev (never calls canonical RPC)", async () => {
    const buildTenantSiteBaseUrl = await importSubject();

    const u = await buildTenantSiteBaseUrl({
      www_name: "acme",
      www_route_path: "/west",
      hosted: false,
      prefer_canonical: true,
    });

    expect(u).toBe("http://acme.localhost:3000/west");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test("builds localhost tenant base URL in local dev", async () => {
    const buildTenantSiteBaseUrl = await importSubject();

    const u = await buildTenantSiteBaseUrl({
      www_name: "acme",
      www_route_path: "/west",
      hosted: false,
      prefer_canonical: true,
    });

    expect(u).toBe("http://acme.localhost:3000/west");
  });

  test("builds platform tenant base URL when hosted and prefer_canonical=false (never calls canonical RPC)", async () => {
    const buildTenantSiteBaseUrl = await importSubject();

    const u = await buildTenantSiteBaseUrl({
      www_name: "acme",
      www_route_path: "/west",
      hosted: true,
      prefer_canonical: false,
    });

    expect(u).toBe(`https://acme.${DEFAULT_PLATFORM_APEX_DOMAIN}/west`);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test("hosted + prefer_canonical=true uses canonical hostname when present, else falls back to platform hostname", async () => {
    const buildTenantSiteBaseUrl = await importSubject();

    const canonicalByTenant: Record<string, string | null> = {
      // canonical custom domain configured
      alpha: "alpha.example.com",
      // no canonical domain configured
      beta: null,
      // example of a tenant that could have multiple custom domains; RPC returns the chosen canonical
      gamma: "tickets.gamma.co",
    };

    rpcMock.mockImplementation(async (fn: string, args: unknown) => {
      expect(fn).toBe("www_get_canonical_hostname");

      const tenant = (args as Record<string, unknown>)?.p_www_name as
        | string
        | undefined;
      const canonical = tenant ? (canonicalByTenant[tenant] ?? null) : null;

      return {
        data: canonical ? [{ canonical_hostname: canonical }] : [],
        error: null,
      };
    });

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "alpha",
        www_route_path: "/west",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe("https://alpha.example.com/west");

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "beta",
        www_route_path: "/west",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe(`https://beta.${DEFAULT_PLATFORM_APEX_DOMAIN}/west`);

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "gamma",
        www_route_path: "/west",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe("https://tickets.gamma.co/west");
  });

  test("normalizes route path and never returns a trailing slash", async () => {
    const buildTenantSiteBaseUrl = await importSubject();

    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "acme",
        www_route_path: "west",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe(`https://acme.${DEFAULT_PLATFORM_APEX_DOMAIN}/west`);

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "acme",
        www_route_path: "/",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe(`https://acme.${DEFAULT_PLATFORM_APEX_DOMAIN}`);

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "acme",
        www_route_path: "   /west   ",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe(`https://acme.${DEFAULT_PLATFORM_APEX_DOMAIN}/west`);

    await expect(
      buildTenantSiteBaseUrl({
        www_name: "acme",
        www_route_path: "/west/",
        hosted: true,
        prefer_canonical: true,
      })
    ).resolves.toBe(`https://acme.${DEFAULT_PLATFORM_APEX_DOMAIN}/west`);
  });
});
