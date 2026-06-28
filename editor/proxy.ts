/**
 * @fileoverview
 * Next.js Proxy entrypoint.
 *
 * Starting in **Next.js 16**, `proxy.ts` is the new name for what used to be
 * `middleware.ts` (same runtime + semantics) — it is *not* a custom concept in
 * this repo. Keep implementing and maintaining this file exactly as we would
 * have done in `middleware.ts`.
 *
 * Reference: https://nextjs.org/docs/app/getting-started/proxy
 */
import { NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import type { NextRequest } from "next/server";
import { TenantMiddleware } from "./lib/tenant/middleware";
import { updateSession } from "./lib/supabase/proxy";
import { buildDesktopCsp } from "./lib/desktop/csp";

const IS_PROD = process.env.NODE_ENV === "production";
const IS_DEV = process.env.NODE_ENV === "development";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    "[CONTRIBUTER MODE]: Supabase Backedn is not configured - some feature may restricted"
  );
}

// GRIDA-SEC-004 — desktop CSP lives in ./lib/desktop/csp (Next.js 16 forbids
// extra exports from this proxy entrypoint). `buildDesktopCsp` interpolates the
// per-request nonce into a hoisted template.

type DesktopHeaderState = {
  isDesktop: boolean;
  csp?: string;
  requestHeaders?: Headers;
};

function prepareDesktopHeaders(req: NextRequest): DesktopHeaderState {
  const isDesktop =
    req.nextUrl.pathname === "/desktop" ||
    req.nextUrl.pathname.startsWith("/desktop/");
  if (!isDesktop) return { isDesktop };

  const isPrefetch =
    req.headers.get("next-router-prefetch") !== null ||
    req.headers.get("purpose") === "prefetch";
  if (isPrefetch) return { isDesktop };

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildDesktopCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return { isDesktop, csp, requestHeaders };
}

function applyDesktopResponseHeaders(res: NextResponse, csp?: string): void {
  if (csp) {
    res.headers.set("Content-Security-Policy", csp);
  }
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Content-Type-Options", "nosniff");
}

export async function proxy(req: NextRequest) {
  // Check if the request path starts with /dev/ and NODE_ENV is not development
  if (req.nextUrl.pathname.startsWith("/dev/") && !IS_DEV) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // GRIDA-SEC-002 —
  // see editor/app/(insiders)/layout.tsx and /SECURITY.md.
  //
  // The `(insiders)` route group is a developer harness with intentionally
  // unauthenticated server actions (mutators that take an arbitrary
  // `organizationId` as the first argument). It MUST NOT be reachable from
  // any non-development environment. Block both page loads and server-action
  // POSTs at the proxy — the gate runs before any handler, so this also
  // covers `Next-Action` invocations against `/insiders/*`.
  if (
    (req.nextUrl.pathname === "/insiders" ||
      req.nextUrl.pathname.startsWith("/insiders/")) &&
    !IS_DEV
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // GRIDA-SEC-001 —
  // see editor/app/(ingest)/README.md and /SECURITY.md.
  //
  // Webhook receivers under `/webhooks/*` are signed, machine-callable
  // endpoints invoked by external services on whatever URL was registered
  // (e.g. a cloudflared dev tunnel). Skip every host-based pipeline
  // downstream — tenant routing, Supabase session refresh, maintenance
  // redirects — and let the receiver respond on the canonical path
  // regardless of host. Authenticity is enforced by the receiver itself
  // via the provider's HMAC signature header (see (ingest)/webhooks/*/route.ts).
  //
  // The route group `(ingest)` (file-system) and the URL prefix `/webhooks/`
  // (this bypass + the cloudflared ingress filter) are intentionally
  // matched: anything under `(ingest)/webhooks/<provider>/route.ts` is
  // exposed; nothing else is.
  {
    const p = req.nextUrl.pathname;
    if (p === "/webhooks" || p.startsWith("/webhooks/")) {
      return NextResponse.next({ request: req });
    }
  }

  // #region maintenance mode
  if (IS_PROD) {
    try {
      // Check whether the maintenance page should be shown
      const isInMaintenanceMode = await get<boolean>("IS_IN_MAINTENANCE_MODE");

      // If is in maintenance mode, point the url pathname to the maintenance page
      if (isInMaintenanceMode) {
        req.nextUrl.pathname = `/maintenance`;

        // Rewrite to the url
        return NextResponse.rewrite(req.nextUrl);
      }
    } catch (error) {
      // show the default page if EDGE_CONFIG env var is missing,
      // but log the error to the console
      console.error(error);
    }
  }
  // #endregion maintenance mode

  // GRIDA-SEC-004 — Desktop agent sidecar trust boundary.
  //
  // Every `/desktop/*` response carries a strict CSP that blocks
  // third-party scripts (analytics, sentry, marketing tags) from
  // running inside the desktop renderer. Without this, an XSS in a
  // future third-party include — or in user-generated content rendered
  // through grida.co — could call `window.grida.*` and reach the
  // agent sidecar. Headers are scoped to `/desktop/*`; the rest of grida.co
  // is unaffected — the per-request work below runs only when
  // `isDesktop` holds, so non-desktop requests pay only one pathname
  // compare on this proxy.
  //
  // We follow Next.js's canonical **nonce + `'strict-dynamic'`** pattern
  // (see https://nextjs.org/docs/app/guides/content-security-policy).
  // Next.js's own hydration scripts (`self.__next_f.push(...)`,
  // `self.__next_r`, the dev-mode reload runtime) are inline — without
  // a nonce they violate `script-src`, hydration aborts, and the
  // renderer is stuck on the server snapshot (which for `/desktop/*`
  // routes is the `<OpenInDesktopCta />` fallback, since the bridge
  // gate's server snapshot is `null`).
  //
  // The nonce is generated here, exposed to the SSR pass via the
  // `x-nonce` request header, and Next.js attaches it to every
  // framework script automatically. `'strict-dynamic'` then lets those
  // trusted scripts load further scripts without each needing its own
  // nonce.
  //
  // The other GRIDA-SEC-004 layers (path-scoped preload,
  // `contextIsolation: true`, agent sidecar Basic Auth, agent sidecar Referer check)
  // remain load-bearing; CSP is one layer, not the only boundary.
  const desktopHeaders = prepareDesktopHeaders(req);

  let res: NextResponse;

  // ------------------------------------------------------------
  // contributor dx
  const env_not_set_but_can_skip_on_local_dev =
    process.env.NODE_ENV === "development" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (env_not_set_but_can_skip_on_local_dev) {
    res = NextResponse.next({
      request: desktopHeaders.requestHeaders
        ? { headers: desktopHeaders.requestHeaders }
        : req,
    });
    console.warn(
      "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set this will break all db-requests, please set them in the .env.local file",
      "If you are just testing things around, you can ignore this message",
      "Learn more at https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md"
    );
  } else {
    res = await updateSession(req, desktopHeaders.requestHeaders);
  }
  // ------------------------------------------------------------

  const routed = await TenantMiddleware.routeProxyRequest(req, res);
  if (routed) return routed;

  if (desktopHeaders.isDesktop) {
    applyDesktopResponseHeaders(res, desktopHeaders.csp);
  }

  return res;
}

// Ensure the middleware is only called for relevant paths.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - monitoring (sentry telemetry)
     */
    "/((?!_next/static|_next/image|favicon.ico|monitoring).*)",
  ],
};
