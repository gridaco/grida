import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormFieldUpsert } from "@/types/private/api";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const data = (await req.json()) as FormFieldUpsert;
  const operation = data.id ? "update" : "create";

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: upserted, error } = await supabase
    .from("form_field")
    .upsert({
      id: data.id,
      form_id: data.form_id,
      type: data.type,
      name: data.name,
      label: data.label,
      placeholder: data.placeholder,
      help_text: data.helpText,
      required: data.required,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  console.log("upserted", upserted);

  if (error) {
    console.error("error while upserting field", error);
    return NextResponse.json(
      {
        message: `Failed to ${operation} field`,
        error: error,
        request: {
          data,
        },
      },
      {
        status: 400,
      }
    );
  }

  return NextResponse.json(
    {
      data: upserted,
      message: `Field ${operation}d`,
    },
    {
      status: operation === "create" ? 201 : 200,
    }
  );
}
