import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  // #region maintenance mode
  if (process.env.EDGE_CONFIG) {
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

  // Check if the request path starts with /dev/ and NODE_ENV is not development
  if (
    req.nextUrl.pathname.startsWith("/dev/") &&
    process.env.NODE_ENV !== "development"
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired - required for Server Components
  await supabase.auth.getSession();

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
