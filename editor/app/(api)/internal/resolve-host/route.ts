import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { serviceRolePublicClient } from "@/lib/supabase/service-role-cookie-free-clients";
import { isReservedAppHostname } from "@/lib/domains";

import {
  DEFAULT_PLATFORM_APEX_DOMAIN,
  isPlatformSiteHostname,
  platformSiteHostnameForTenant,
  platformSiteTenantFromHostname,
} from "@/lib/domains";

function normalizeHost(input: string) {
  const host = input.trim().toLowerCase();
  // strip port if present
  return host.split(":")[0] ?? host;
}

function isPlatformHost(hostname: string) {
  return isPlatformSiteHostname(hostname);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstCanonicalHostname(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!isPlainObject(first)) return null;
  const v = first.canonical_hostname;
  return typeof v === "string" || v === null ? v : null;
}

type Resolution = {
  www_name: string;
  canonical_host: string;
  source: "custom" | "platform";
} | null;

const resolveHostCached = unstable_cache(
  async (hostname: string): Promise<Resolution> => {
    const pub = serviceRolePublicClient();

    // App hosts are never tenant identities.
    if (isReservedAppHostname(hostname)) return null;

    // Custom domain: resolve by hostname mapping.
    if (!isPlatformHost(hostname)) {
      const { data, error } = await pub.rpc("www_resolve_hostname", {
        p_hostname: hostname,
      });

      if (error || !Array.isArray(data) || data.length === 0) return null;

      const row = data[0] as unknown as {
        www_name: string;
        canonical_hostname: string | null;
      };

      if (!row?.www_name) return null;

      return {
        www_name: row.www_name,
        canonical_host:
          row.canonical_hostname ??
          platformSiteHostnameForTenant(
            row.www_name,
            DEFAULT_PLATFORM_APEX_DOMAIN
          ),
        source: "custom",
      };
    }

    // Platform host: derive tenant name from hostname, then fetch canonical.
    const parsed = platformSiteTenantFromHostname(hostname);
    const tenant = parsed?.tenant ?? null;
    if (!tenant) return null;

    const { data, error } = await pub.rpc("www_get_canonical_hostname", {
      p_www_name: tenant,
    });

    const canonical = error ? null : firstCanonicalHostname(data);

    return {
      www_name: tenant,
      canonical_host:
        canonical ??
        platformSiteHostnameForTenant(tenant, DEFAULT_PLATFORM_APEX_DOMAIN),
      source: "platform",
    };
  },
  ["grida:resolve-host"],
  { revalidate: 60, tags: ["grida:domain-registry"] }
);

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-grida-internal-token");
  const expected = process.env.GRIDA_INTERNAL_PROXY_TOKEN;

  if (!expected || token !== expected) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  const host = req.nextUrl.searchParams.get("host");
  if (!host) {
    return NextResponse.json(
      { error: "missing host" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const hostname = normalizeHost(host);
  if (!hostname) {
    return NextResponse.json(
      { error: "invalid host" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const data = await resolveHostCached(hostname);
  return NextResponse.json(
    { data },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
