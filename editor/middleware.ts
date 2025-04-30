import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { get } from "@vercel/edge-config";
import type { NextRequest } from "next/server";
import { TanantMiddleware } from "./lib/tenant/middleware";
import { Env } from "./env";

const IS_PROD = process.env.NODE_ENV === "production";
const IS_DEV = process.env.NODE_ENV === "development";
const IS_HOSTED = process.env.VERCEL === "1";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    "[CONTRIBUTER MODE]: Supabase Backedn is not configured - some feature may restricted"
  );
}

export async function middleware(req: NextRequest) {
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

  const res = await updateSession(req);

  // #region tanent

  const host = req.headers.get("host") || "";
  const url = new URL(`https://${host}`);
  const hostname = url.hostname;

  const tanentwww = TanantMiddleware.analyze(url, !IS_HOSTED);

  // www.grida.site => grida.co
  if (tanentwww.name === "www") {
    const website = new URL("/", Env.web.HOST);
    return NextResponse.redirect(website, {
      status: 301,
    });
  }

  // tenant.grida.site => "/~/[tenant]/**"
  if (tanentwww.name) {
    const url = req.nextUrl.clone();
    url.pathname = `/~/${tanentwww.name}${req.nextUrl.pathname}`;

    return NextResponse.rewrite(url, {
      request: { headers: req.headers },
      status: res.status,
    });
  }

  // block direct access to the tanent layout
  if (
    hostname === (IS_DEV ? "localhost" : process.env.NEXT_PUBLIC_URL) &&
    req.nextUrl.pathname.startsWith("/~/")
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // #endregion tanent

  return res;
}

/**
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  await supabase.auth.getUser();

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
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
