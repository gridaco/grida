import { grida_forms_service_client } from "@/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * create a new form_field
 * @returns
 */
export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const form_id = context.params.id;
  const data = await req.json();

  return NextResponse.json(
    {
      message: "Not implemented yet",
    },
    {
      status: 501,
    }
  );

  const { data: inserted, error } = await grida_forms_service_client
    .from("form_field")
    .insert({
      name: data.name,
      form_id: form_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.error();
  }

  if (!inserted) {
  }

  return;
}
