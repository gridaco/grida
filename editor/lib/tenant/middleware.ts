import { NextResponse, type NextRequest } from "next/server";
import { Env } from "@/env";
import { serviceRolePublicClient } from "@/lib/supabase/service-role-cookie-free-clients";
import {
  DEFAULT_PLATFORM_APEX_DOMAIN,
  isPlatformSiteHostname,
  isReservedAppHostname,
  platformSiteHostnameForTenant,
  platformSiteTenantFromHostname,
} from "@/lib/domains";

export namespace TanantMiddleware {
  const IS_DEV = process.env.NODE_ENV === "development";

  export const analyze = function (
    url: URL,
    LOCALHOST = false
  ): {
    name: string | null;
    apex: string;
    domain: string;
  } {
    const hostname = url.hostname; // strips port if any
    const parts = hostname.split(".");

    if (LOCALHOST) {
      if (hostname === "localhost") {
        return {
          name: null,
          apex: "localhost",
          domain: "localhost",
        };
      } else {
        return {
          name: parts[0],
          apex: "localhost",
          domain: hostname,
        };
      }
    }

    // App hosts (e.g. `*.grida.co`) are never tenant identities.
    // This is code-managed via `APP_APEX_DOMAINS`.
    if (isReservedAppHostname(hostname)) {
      return {
        name: null,
        apex: hostname,
        domain: hostname,
      };
    }

    const apex = parts.slice(-2).join("."); // e.g. "grida.site" from my-site.grida.site
    const subdomain = parts.slice(0, -2).join("."); // e.g. "my-site" from my-site.grida.site

    return {
      name: subdomain,
      apex: apex,
      domain: hostname,
    };
  };

  /**
   * Host-based tenant routing for Next.js `proxy.ts`.
   *
   * This centralizes the routing invariants so `editor/proxy.ts` stays short:
   * - localhost tenant routing (`tenant.localhost`)
   * - app hosts (reserved) are never tenant identities
   * - platform sites (`*.grida.site`, `*.grida.app`) + canonicalization
   * - user-imported custom domains (via DB/Vercel) + canonicalization
   */
  export async function routeProxyRequest(
    req: NextRequest,
    res: NextResponse
  ): Promise<NextResponse | null> {
    const host = req.headers.get("host");
    if (!host) return null;

    // Ignore Vercel preview hosts entirely (they are not tenant/custom-domain identities).
    if (
      Env.server.IS_HOSTED &&
      (host === process.env.VERCEL_URL ||
        host === process.env.VERCEL_BRANCH_URL)
    ) {
      return null;
    }

    let url: URL;
    try {
      url = new URL(`https://${host}`);
    } catch {
      return null;
    }

    const hostname = url.hostname;

    // App hosts are never tenant identities. Still block direct `/~/...` access.
    if (isReservedAppHostname(hostname)) {
      if (req.nextUrl.pathname.startsWith("/~/")) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return null;
    }

    const tenant = analyze(url, !Env.server.IS_HOSTED);

    // www.<platform apex> => main app host
    if (tenant.name === "www" && isPlatformSiteHostname(hostname)) {
      return NextResponse.redirect(new URL("/", Env.web.HOST), { status: 301 });
    }

    // Local dev tenant routing: `tenant.localhost:3000` -> `/~/<tenant>/**`
    if (!Env.server.IS_HOSTED) {
      const isLocalTenantHost = tenant.apex === "localhost" && !!tenant.name;
      if (isLocalTenantHost) {
        const prefix = `/~/${tenant.name}`;
        if (!req.nextUrl.pathname.startsWith(prefix)) {
          const rewritten = req.nextUrl.clone();
          rewritten.pathname = `${prefix}${req.nextUrl.pathname}`;
          return NextResponse.rewrite(rewritten, {
            request: { headers: req.headers },
            status: res.status,
          });
        }
      }
    }

    const isPlatformHost = isPlatformSiteHostname(hostname);

    // Hosted custom-domain routing & canonical redirects
    if (Env.server.IS_HOSTED) {
      // Prefer internal resolver route (cached/observable), called via deploy host to avoid recursion.
      const internalToken = process.env.GRIDA_INTERNAL_PROXY_TOKEN;
      const deployHost = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : null;

      if (internalToken && deployHost) {
        try {
          const u = new URL("/internal/resolve-host", deployHost);
          u.searchParams.set("host", hostname);
          const r = await fetch(u.toString(), {
            method: "GET",
            headers: { "x-grida-internal-token": internalToken },
          });

          if (r.ok) {
            const json = (await r.json().catch(() => null)) as {
              data: { www_name: string; canonical_host: string } | null;
            } | null;
            const data = json?.data ?? null;
            if (data?.www_name) {
              if (data.canonical_host && data.canonical_host !== hostname) {
                const redirectTo = new URL(
                  req.nextUrl.pathname + req.nextUrl.search,
                  `https://${data.canonical_host}`
                );
                return NextResponse.redirect(redirectTo, { status: 301 });
              }

              const rewritten = req.nextUrl.clone();
              rewritten.pathname = `/~/${data.www_name}${req.nextUrl.pathname}`;
              return NextResponse.rewrite(rewritten, {
                request: { headers: req.headers },
                status: res.status,
              });
            }
          }
        } catch {
          // fall back to DB resolution below
        }
      }

      // Reliability-first: resolve from DB using cookie-free service role client.
      try {
        const pub = serviceRolePublicClient();

        // A) Custom domain request: resolve by hostname mapping.
        if (!isPlatformHost) {
          const { data: rows, error } = await pub.rpc("www_resolve_hostname", {
            p_hostname: hostname,
          });

          if (!error && Array.isArray(rows) && rows.length > 0) {
            const row = rows[0] as unknown as {
              www_name: string;
              canonical_hostname: string | null;
            };

            if (row?.www_name) {
              const canonicalHost =
                row.canonical_hostname ??
                platformSiteHostnameForTenant(
                  row.www_name,
                  DEFAULT_PLATFORM_APEX_DOMAIN
                );

              if (canonicalHost !== hostname) {
                const redirectTo = new URL(
                  req.nextUrl.pathname + req.nextUrl.search,
                  `https://${canonicalHost}`
                );
                return NextResponse.redirect(redirectTo, { status: 301 });
              }

              const rewritten = req.nextUrl.clone();
              rewritten.pathname = `/~/${row.www_name}${req.nextUrl.pathname}`;
              return NextResponse.rewrite(rewritten, {
                request: { headers: req.headers },
                status: res.status,
              });
            }
          }
        }

        // B) Platform host request: enforce canonical by querying canonical custom domain (if any).
        if (tenant.name && isPlatformHost) {
          const { data: rows, error } = await pub.rpc(
            "www_get_canonical_hostname",
            { p_www_name: tenant.name }
          );

          if (!error && Array.isArray(rows) && rows.length > 0) {
            const first = rows[0] as unknown;
            const canonical =
              typeof (first as { canonical_hostname?: unknown })
                ?.canonical_hostname === "string"
                ? (first as { canonical_hostname: string }).canonical_hostname
                : null;
            if (canonical && canonical !== hostname) {
              const redirectTo = new URL(
                req.nextUrl.pathname + req.nextUrl.search,
                `https://${canonical}`
              );
              return NextResponse.redirect(redirectTo, { status: 301 });
            }
          }

          // If no canonical custom domain is set, enforce canonical platform suffix.
          const platformParsed = platformSiteTenantFromHostname(hostname);
          if (
            platformParsed?.tenant &&
            platformParsed.apex !== DEFAULT_PLATFORM_APEX_DOMAIN
          ) {
            const redirectTo = new URL(
              req.nextUrl.pathname + req.nextUrl.search,
              `https://${platformSiteHostnameForTenant(
                platformParsed.tenant,
                DEFAULT_PLATFORM_APEX_DOMAIN
              )}`
            );
            return NextResponse.redirect(redirectTo, { status: 301 });
          }

          const rewritten = req.nextUrl.clone();
          rewritten.pathname = `/~/${tenant.name}${req.nextUrl.pathname}`;
          return NextResponse.rewrite(rewritten, {
            request: { headers: req.headers },
            status: res.status,
          });
        }
      } catch {
        // ignore and fall through to hosted fallback
      }
    }

    // Hosted fallback: preserve existing platform behavior even if DB lookup fails.
    if (tenant.name && isPlatformHost) {
      const rewritten = req.nextUrl.clone();
      rewritten.pathname = `/~/${tenant.name}${req.nextUrl.pathname}`;
      return NextResponse.rewrite(rewritten, {
        request: { headers: req.headers },
        status: res.status,
      });
    }

    // Block direct access to tenant layout on app host (localhost / editor apex).
    // Allow direct `/~/...` only on tenant hosts (e.g. `tenant.localhost` or platform/custom domains).
    // In hosted env, `Env.web.HOST` includes scheme; use `NEXT_PUBLIC_URL` (host only) to detect editor apex.
    const editorHost = process.env.NEXT_PUBLIC_URL;
    const isEditorApexHost =
      hostname === "localhost" || (!!editorHost && hostname === editorHost);
    if (isEditorApexHost && req.nextUrl.pathname.startsWith("/~/")) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return null;
  }
}
