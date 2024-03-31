import { createRouteHandlerClient } from "@/lib/supabase/server";
import { FormFieldDataSchema, FormFieldType, PaymentFieldData } from "@/types";
import { FormFieldUpsert } from "@/types/private/api";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const init = (await req.json()) as FormFieldUpsert;
  const operation = init.id ? "update" : "create";

  const { form_id } = init;

  console.log("POST /private/editor/fields", init);

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
      autocomplete: init.autocomplete,
      data: safe_data_field({ type: init.type, data: init.data as any }) as any,
      accept: init.accept,
      multiple: init.multiple,
      // 'description': init.description,
      // 'max': init.max,
      // 'min': init.min,
      // 'step': init.step,
      updated_at: new Date().toISOString(),
    })
    .select("*, existing_options:form_field_option(*)")
    .single();

  console.log("upserted", upserted, init.data);

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

  const { existing_options } = upserted;

  // upsert options if any
  const { options } = init;
  const upserting_option_ids = options?.map((option) => option.id) ?? [];
  // options to be deleted
  const deleting_option_ids = existing_options
    .map((option) => option.id)
    .filter((id) => !upserting_option_ids.includes(id));

  let field_options: any[] | undefined = undefined;

  if (options) {
    const { data: upserted_options, error } = await supabase
      .from("form_field_option")
      .upsert(
        options.map((option) => ({
          label: option.label,
          value: option.value,
          index: option.index ?? 0,
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
      console.info("failed options payload", init.options);
      if (operation === "create") {
        // revert field if options failed
        await supabase.from("form_field").delete().eq("id", upserted.id);
      } else {
        // just let only the options fail, keep the updated field
      }
      return NextResponse.error();
    }
  }

  if (deleting_option_ids?.length) {
    console.log("removing_option_ids", deleting_option_ids);
    await supabase
      .from("form_field_option")
      .delete()
      .in("id", deleting_option_ids);
  }

  return NextResponse.json(
    {
      data: {
        ...upserted,
        options: field_options,
      },
      message: `Field ${operation}d`,
      info: {
        deleted_options: deleting_option_ids,
      },
    },
    {
      status: operation === "create" ? 201 : 200,
    }
  );
}

/**
 * this function ensures that dynamic json data is structured correctly by the field type
 * @returns
 */
function safe_data_field({
  type,
  data,
}: {
  type: FormFieldType;
  data?: FormFieldDataSchema;
}): FormFieldDataSchema | undefined | null {
  switch (type) {
    case "payment": {
      // TODO: enhance the schema validation with external libraries
      if (!data || !(data as PaymentFieldData).type) {
        return <PaymentFieldData>{
          type: "payment",
          service_provider: "stripe",
        };
      }
      break;
    }
  }

  return data;
}

function omit<T extends Record<string, any>>(
  obj: T,
  ...keys: string[]
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key))
  ) as Partial<T>;
}
