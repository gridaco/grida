import { fetch_supabase_postgrest_swagger } from "@/lib/supabase-postgrest";
import {
  createRouteHandlerClient,
  grida_xsupabase_client,
} from "@/lib/supabase/server";
import { GridaXSupabaseClient } from "@/services/x-supabase";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

interface Context {
  params: {
    form_id: string;
  };
}

export async function GET(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: conn } = await supabase
    .from("connection_supabase")
    .select(`*`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const client = new GridaXSupabaseClient();

  const data = await client.getConnection(conn);

  if (!data) {
    return notFound();
  }

  return NextResponse.json({
    data: data,
  });
}

export async function PATCH(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: conn } = await supabase
    .from("connection_supabase")
    .select(`*`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const { supabase_project_id, main_supabase_table_id } = conn;

  const { data: supabase_project } = await grida_xsupabase_client
    .from("supabase_project")
    .select(`*`)
    .eq("id", supabase_project_id)
    .single();

  const { sb_public_schema } = await fetch_supabase_postgrest_swagger({
    url: supabase_project!.sb_project_url,
    anonKey: supabase_project!.sb_anon_key,
  });

  if (conn.main_supabase_table_id) {
    const { data: main_table } = await grida_xsupabase_client
      .from("supabase_table")
      .select(`sb_table_name`)
      .eq("id", conn.main_supabase_table_id)
      .single();

    await grida_xsupabase_client.from("supabase_table").update({
      sb_table_schema: sb_public_schema[main_table!.sb_table_name],
    });
  }

  const { data: patch, error: patch_error } = await grida_xsupabase_client
    .from("supabase_project")
    .update({
      sb_public_schema: sb_public_schema,
    })
    .eq("id", supabase_project_id)
    .select(`*, tables:supabase_table(*)`)
    .single();

  if (patch_error) {
    console.error(patch_error);
    return NextResponse.error();
  }

  return NextResponse.json({ data: patch });
}

export async function POST(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const data = await req.json();
  const { sb_project_url, sb_anon_key } = data;

  const { sb_project_reference_id, sb_public_schema } =
    await fetch_supabase_postgrest_swagger({
      url: sb_project_url,
      anonKey: sb_anon_key,
    });

  const { data: form_ref, error: form_ref_err } = await supabase
    .from("form")
    .select("project_id")
    .eq("id", form_id)
    .single();

  if (!form_ref) return notFound();
  if (form_ref_err) console.error(form_ref_err);

  // 1. create supabase project
  const { data: supabase_project } = await grida_xsupabase_client
    .from("supabase_project")
    .insert({
      project_id: form_ref.project_id,
      sb_anon_key,
      sb_project_reference_id,
      sb_public_schema,
      sb_project_url,
    })
    .select()
    .single();

  const { data: conn, error } = await supabase
    .from("connection_supabase")
    .insert({
      form_id,
      supabase_project_id: supabase_project!.id,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error }, { status: 401 });
  }

  return NextResponse.json({ data: conn });
}

export async function DELETE(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { count, error } = await supabase
    .from("connection_supabase")
    .delete({ count: "exact" })
    .eq("form_id", form_id);

  if (error) {
    console.error(error);
    return NextResponse.error();
  }

  if (count) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  return NextResponse.error();
}
