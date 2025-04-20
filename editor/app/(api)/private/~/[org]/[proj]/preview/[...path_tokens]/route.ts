import { createClient, createWWWClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "next/navigation";

const IS_HOSTED = process.env.VERCEL === "1";

type Params = {
  /**
   * organization.id or organization.name
   */
  org: string;

  /**
   * project.id or project.name
   */
  proj: string;

  /**
   * tenant site path
   */
  path_tokens: string[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { org, proj, path_tokens } = await params;

  const client = await createClient();
  const wwwClient = await createWWWClient();

  const { data: project, error: project_err } = await client
    .rpc(
      "find_project",
      {
        p_org_ref: org,
        p_proj_ref: proj,
      },
      { get: true }
    )
    .single();

  if (project_err) {
    console.error("project not found", project_err, "with", {
      project_id: proj,
      organization_id: org,
    });
    return notFound();
  }

  const { data: www, error: www_err } = await wwwClient
    .from("www")
    .select("id, name")
    .eq("project_id", project.id)
    .single();
  if (www_err) return notFound();

  const request_path = path_tokens.join("/");

  const url = new URL(
    request_path,
    IS_HOSTED
      ? `https://${www.name}.grida.site/`
      : `http://${www.name}.localhost:3000/`
  );
  return NextResponse.redirect(url, { status: 302 });
}
