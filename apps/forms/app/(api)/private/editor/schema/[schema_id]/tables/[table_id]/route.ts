import { createRouteHandlerClient } from "@/lib/supabase/server";
import { EditorApiResponseOk } from "@/types/private/api";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  params: {
    schema_id: string;
    table_id: string;
  };
};

export async function DELETE(req: NextRequest, context: Context) {
  const { schema_id, table_id } = context.params;

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { user_confirmation_txt } = await req.json();

  // validate user confirmation text
  const { data: ref, error: ref_err } = await supabase
    .from("form")
    .select("id, schema_id, name:title")
    .eq("id", table_id)
    .eq("schema_id", schema_id)
    .single();

  if (ref_err) {
    console.error("ERR: while fetching schema table", ref_err);
    return notFound();
  }

  assert(
    user_confirmation_txt === `DELETE ${ref.name}`,
    "Invalid confirmation text"
  );

  const { count, error } = await supabase
    .from("form")
    .delete({ count: "exact" })
    .eq("id", table_id)
    .eq("schema_id", schema_id);

  assert(count === 1, "Failed to delete table - count is not 1");
  if (error) {
    // although on delete operation, supabase won't throw any errors.
    console.error("ERR: while deleting schema table", error);
    return notFound();
  }

  return NextResponse.json({
    data: null,
    error: null,
  } satisfies EditorApiResponseOk);
}
