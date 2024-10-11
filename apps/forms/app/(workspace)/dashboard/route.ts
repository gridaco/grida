import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const cookieStore = cookies();
  const supabase = createRouteHandlerWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.redirect(origin + "/sign-in", {
      status: 302,
    });
  }

  // get the user organization
  const { data: memberships, error } = await supabase
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
    .eq("user_id", auth.user.id);

  if (error) console.error(error);
  if (!memberships || memberships.length === 0) {
    return NextResponse.redirect(origin + "/organizations/new", {
      status: 307,
    });
  }

  const { data: state, error: stateerr } = await supabase
    .from("user_project_access_state")
    .select()
    .eq("user_id", auth.user.id)
    .single();

  const organizations = memberships.map((m) => m.organization);

  const lastproject = state?.project_id
    ? organizations
        ?.flatMap((o) => o!.projects)
        .find((p) => p.id === state.project_id)
    : null;

  const organization = lastproject
    ? organizations.find((o) => o!.id === lastproject?.organization_id)!
    : organizations[0]!;

  const dashboard =
    origin +
    "/" +
    organization.name +
    (lastproject ? "/" + lastproject.name : "");

  return NextResponse.redirect(dashboard, {
    status: 307,
  });
}
