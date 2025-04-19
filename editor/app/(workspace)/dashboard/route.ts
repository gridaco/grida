import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const cookieStore = await cookies();
  const supabase = createRouteHandlerWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.redirect(origin + "/sign-in", {
      status: 302,
    });
  }

  // 1. go to last document
  // 2. go to last project
  // 3. go to last organization
  // 4. go to first organization

  const { data: state } = await supabase
    .from("user_project_access_state")
    .select(
      `
        *,
        project:project(*, organization:organization(*)),
        document:document(*)
      `
    )
    .single();

  if (state && state.project) {
    const r = link(origin, {
      document_id: state.document_id,
      project_name: state.project?.name,
      organization_name: state.project.organization.name,
    });

    return NextResponse.redirect(r, {
      status: 307,
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

  const organizations = memberships.map((m) => m.organization);
  const organization = organizations[0]!;
  const r = link(origin, {
    organization_name: organization.name,
  });
  return NextResponse.redirect(r, {
    status: 307,
  });
}

type GoToParams =
  | {
      organization_name: string;
      project_name?: string | null | undefined;
      document_id?: string | null | undefined;
    }
  | {
      organization_name: string;
      project_name: string;
      document_id?: string | null | undefined;
    }
  | { organization_name: string; project_name: string; document_id: string };

function link(origin: string, params: GoToParams) {
  // if (params.document_id) {
  //   return `${origin}/${params.organization_name}/${params.project_name}/${params.document_id}`;
  // }

  if (params.project_name) {
    return `${origin}/${params.organization_name}/${params.project_name}`;
  }

  return `${origin}/${params.organization_name}`;
  //
}
