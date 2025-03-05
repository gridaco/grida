import { grida_forms_client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { id: string };

/**
 * create a new form_field
 * @returns
 */
export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { id: form_id } = await context.params;
  const data = await req.json();

  return NextResponse.json(
    {
      message: "Not implemented yet",
    },
    {
      status: 501,
    }
  );

  const { data: inserted, error } = await grida_forms_client
    .from("attribute")
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
