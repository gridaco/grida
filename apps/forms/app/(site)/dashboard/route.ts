import {
  createRouteHandlerClient,
  workspaceclient,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.redirect(origin + "/sign-in", {
      status: 302,
    });
  }

  // TODO: use extra table to store last accessed project rather than using the first project under the organization
  // get the user organization
  const { data: membership, error } = await workspaceclient
    .from("organization_member")
    .select(
      `
      *,
      organization:organization(
        *,
        projects:project(*)
      )
    `
    )
    .eq("user_id", auth.user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.redirect(origin + "/organizations/new", {
      status: 307,
    });
  }

  if (membership.organization!.projects.length === 0) {
    // TODO: redirect to a page that says the user's organization has no projects
    return NextResponse.json({
      error: "User's organization has no projects",
    });
  }

  const { name: project_name } = membership.organization!.projects[0];

  return NextResponse.redirect(origin + "/" + project_name, {
    status: 307,
  });
}
