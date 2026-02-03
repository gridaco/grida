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
import { TanantMiddleware } from "./lib/tenant/middleware";
import { updateSession } from "./lib/supabase/proxy";
import { Env } from "./env";

const IS_PROD = process.env.NODE_ENV === "production";
const IS_DEV = process.env.NODE_ENV === "development";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    "[CONTRIBUTER MODE]: Supabase Backedn is not configured - some feature may restricted"
  );
}

export async function proxy(req: NextRequest) {
  // Check if the request path starts with /dev/ and NODE_ENV is not development
  if (req.nextUrl.pathname.startsWith("/dev/") && !IS_DEV) {
    return new NextResponse("Not Found", { status: 404 });
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

  let res: NextResponse;

  // ------------------------------------------------------------
  // contributor dx
  const env_not_set_but_can_skip_on_local_dev =
    process.env.NODE_ENV === "development" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (env_not_set_but_can_skip_on_local_dev) {
    res = NextResponse.next({
      request: req,
    });
    console.warn(
      "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set this will break all db-requests, please set them in the .env.local file",
      "If you are just testing things around, you can ignore this message",
      "Learn more at https://github.com/gridaco/grida/blob/main/CONTRIBUTING.md"
    );
  } else {
    res = await updateSession(req);
  }
  // ------------------------------------------------------------

  const routed = await TanantMiddleware.routeProxyRequest(req, res);
  if (routed) return routed;

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
