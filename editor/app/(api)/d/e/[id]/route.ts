import { Env } from "@/env";
import { service_role } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

/**
 * legacy /d/e/[id] redirection to tenant.grida.site
 */
export async function GET(
  request: NextRequest,
  segmentData: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await segmentData.params;
  const { data, error } = await service_role.forms
    .from("form")
    .select("id, project_id")
    .eq("id", id)
    .single();

  if (error) {
    console.warn("d/e/[id] error: ", error);
    return notFound();
  }

  const { data: www_data, error: www_error } = await service_role.www
    .from("www")
    .select("*")
    .eq("project_id", data.project_id)
    .single();

  if (www_error) {
    console.warn("d/e/[id] www error: ", www_error);
    return notFound();
  }

  const baseUrl = Env.server.IS_HOSTED
    ? `https://${www_data.name}.grida.site`
    : `http://${www_data.name}.localhost:3000`;

  return NextResponse.redirect(new URL(`/d/e/${id}`, baseUrl), {
    status: 301,
  });
}
