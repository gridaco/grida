import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormFieldUpsert } from "@/types/private/api";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const init = (await req.json()) as FormFieldUpsert;
  const operation = init.id ? "update" : "create";

  const { form_id } = init;

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: upserted, error } = await supabase
    .from("form_field")
    .upsert({
      id: init.id,
      form_id: form_id,
      type: init.type,
      name: init.name,
      label: init.label,
      placeholder: init.placeholder,
      help_text: init.helpText,
      required: init.required,
      pattern: init.pattern,
      // 'autocomplete': init.autocomplete,
      // 'description': init.description,
      // 'max': init.max,
      // 'min': init.min,
      // 'step': init.step,
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
          data: init,
        },
      },
      {
        status: 400,
      }
    );
  }

  // create options if any
  const { options } = init;
  let field_options: any[] | undefined = undefined;
  if (options) {
    const { data: upserted_options, error } = await supabase
      .from("form_field_option")
      .upsert(
        options.map((option) => ({
          label: option.label,
          value: option.value,
          form_field_id: upserted.id,
          form_id: form_id,
        })),
        {
          onConflict: "value,form_field_id",
        }
      )
      .select();

    field_options = upserted_options ?? undefined;

    if (error) {
      console.error("error while upserting field options", error);
      if (operation === "create") {
        // revert field if options failed
        await supabase.from("form_field").delete().eq("id", upserted.id);
      } else {
        // just let only the options fail, keep the updated field
      }
      return NextResponse.error();
    }
  }

  return NextResponse.json(
    {
      data: {
        ...upserted,
        options: field_options,
      },
      message: `Field ${operation}d`,
    },
    {
      status: operation === "create" ? 201 : 200,
    }
  );
}
