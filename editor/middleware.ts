import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import type { NextRequest } from "next/server";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    "[CONTRIBUTER MODE]: Supabase Backedn is not configured - some feature may restricted"
  );
}

const __local_test_domain_map: Record<string, string> = {
  "a.localhost:3000": "/grida",
  "b.localhost:3000": "/grida",
};

export async function middleware(req: NextRequest) {
  // #region maintenance mode
  if (process.env.NODE_ENV === "production") {
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

  const res = NextResponse.next();

  // Get hostname of request (e.g. demo.grida.site, demo.localhost:3000)
  let hostname = req.headers
    .get("host")!
    .replace(".localhost:3000", `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`);
  const pathname = req.nextUrl.pathname;

  const basePath = __local_test_domain_map[hostname || ""];

  if (basePath) {
    const rewriteUrl = new URL(`${basePath}${pathname}`, req.url);
    return NextResponse.rewrite(rewriteUrl);
  }

  // Check if the request path starts with /dev/ and NODE_ENV is not development
  if (
    req.nextUrl.pathname.startsWith("/dev/") &&
    process.env.NODE_ENV !== "development"
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // check if dev env (contributor env)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return res;
  }

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired - required for Server Components
  await supabase.auth.getUser();

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
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
