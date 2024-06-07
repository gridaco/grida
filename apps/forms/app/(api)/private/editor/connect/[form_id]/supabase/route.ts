import { parseSupabaseSchema } from "@/lib/supabase-postgrest";
import { createRouteHandlerClient } from "@/lib/supabase/server";
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
    .select(`*, connection_table:connection_supabase_table(*)`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: conn });
}

export async function PATCH(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: conn } = await supabase
    .from("connection_supabase")
    .select(`*, connection_table:connection_supabase_table(*)`)
    .eq("form_id", form_id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const { sb_public_schema } = await parseSupabaseSchema({
    url: conn.sb_project_url,
    anonKey: conn.sb_anon_key,
  });

  if (conn.connection_table) {
    await supabase.from("connection_supabase_table").update({
      sb_table_schema: sb_public_schema[conn.connection_table.sb_table_name],
    });
  }

  const { data: patch, error: patch_error } = await supabase
    .from("connection_supabase")
    .update({
      sb_public_schema: sb_public_schema,
    })
    .eq("form_id", form_id)
    .select(`*, connection_table:connection_supabase_table(*)`)
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
    await parseSupabaseSchema({
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

  const { data: conn, error } = await supabase
    .from("connection_supabase")
    .insert({
      sb_anon_key,
      sb_project_reference_id,
      sb_public_schema,
      sb_project_url,
      form_id,
      project_id: form_ref.project_id,
    })
    .select();

  if (error) console.error(error);

  if (conn) {
    return NextResponse.json({ data: conn });
  }

  return NextResponse.json({ error }, { status: 401 });
}

export async function DELETE(req: NextRequest, context: Context) {
  const form_id = context.params.form_id;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { count } = await supabase
    .from("connection_supabase")
    .delete({ count: "exact" })
    .eq("form_id", form_id);

  if (count) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  return NextResponse.error();
}
