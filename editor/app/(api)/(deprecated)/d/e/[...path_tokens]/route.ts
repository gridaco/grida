import { Env } from "@/env";
import { service_role } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

/**
 * legacy /d/e/[id] redirection to tenant.grida.site
 * Handles both /d/e/[id] and /d/e/[id]/[...path_tokens] cases
 */
export async function GET(
  request: NextRequest,
  segmentData: {
    params: Promise<{
      path_tokens?: string[];
    }>;
  }
) {
  const { path_tokens: _path_tokens = [] } = await segmentData.params;
  const [id, ...path_tokens] = _path_tokens;

  try {
    const { baseUrl } = await query_d_e(id);
    const path =
      path_tokens.length > 0
        ? `/d/e/${id}/${path_tokens.join("/")}`
        : `/d/e/${id}`;

    const searchParams = request.nextUrl.searchParams.toString();
    const redirectUrl = new URL(path, baseUrl);

    if (searchParams) {
      redirectUrl.search = searchParams;
    }

    return NextResponse.redirect(redirectUrl, {
      status: 301,
    });
  } catch (error) {
    return notFound();
  }
}

async function query_d_e(id: string) {
  const { data, error } = await service_role.forms
    .from("form")
    .select("id, project_id")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error();
  }

  const { data: www_data, error: www_error } = await service_role.www
    .from("www")
    .select("*")
    .eq("project_id", data.project_id)
    .single();

  if (www_error) {
    throw new Error();
  }

  const baseUrl = Env.server.IS_HOSTED
    ? `https://${www_data.name}.grida.site`
    : `http://${www_data.name}.localhost:3000`;

  return {
    id,
    baseUrl,
  };
}
