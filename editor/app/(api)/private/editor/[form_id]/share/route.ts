import { Env } from "@/env";
import { service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { form_id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id } = await context.params;

  const { baseUrl } = await queryForm(form_id);
  return NextResponse.json({
    url: `${Env.web.HOST}/d/e/${form_id}`,
    url_tenant: `${baseUrl}/d/e/${form_id}`,
    embed: `${Env.web.HOST}/v1/embed/${form_id}`,
    submit: `${Env.web.HOST}/v1/submit/${form_id}`,
  });
}

async function queryForm(form_id: string) {
  const { data, error } = await service_role.forms
    .from("form")
    .select("id, project_id")
    .eq("id", form_id)
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
    form_id,
    baseUrl,
  };
}
