import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  context: {
    params: {
      org: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  const cookieStore = cookies();
  const org = context.params.org;

  const wsclient = createRouteHandlerWorkspaceClient(cookieStore);

  const body = await req.formData();

  const display_name = body.get("display_name");
  const email = body.get("email");
  const description = body.get("description");
  const blog = body.get("blog");

  const { error } = await wsclient
    .from("organization")
    .update({
      display_name: String(display_name),
      email: String(email),
      description: description ? String(description) : undefined,
      blog: blog ? String(blog) : undefined,
    })
    .eq("name", org);

  if (error) {
    console.error("organization/profile", error);
    return NextResponse.error();
  }

  return NextResponse.redirect(
    origin + `/organizations/${org}/settings/profile`,
    {
      status: 302,
    }
  );
}
