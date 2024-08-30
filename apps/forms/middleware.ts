import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const country = req.geo?.country;
  const city = req.geo?.city;
  const region = req.geo?.region;

  console.log("geo", req.geo);

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
