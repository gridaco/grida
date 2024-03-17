import { createRouteHandlerClient } from "@/lib/supabase/server";
import { NewFormFieldInit } from "@/types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

type FormFieldUpsert = NewFormFieldInit & {
  form_id: string;
  id?: string;
};

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const data = (await req.json()) as FormFieldUpsert;
  const operation = data.id ? "update" : "create";

  const supabase = createRouteHandlerClient(cookieStore);

  const { data: upserted, error } = await supabase
    .from("form_field")
    .update({
      // id: data.id,
      // form_id: data.form_id,
      type: data.type,
      name: data.name,
      label: data.label,
      placeholder: data.placeholder,
      help_text: data.helpText,
      required: data.required,
    })
    .eq("id", data.id!)
    .select()
    .single();

  // .then(({ data, error }) => {
  //   if (data) {
  //     toast.success("New field added");
  //     closeNewFieldPanel({ refresh: true });
  //   } else {
  //     if (error.code === "23505") {
  //       toast.error(`field with name "${init.name}" already exists`);
  //       console.error(error);
  //       return;
  //     }
  //     toast.error("Failed to add new field");
  //     console.error(error);
  //   }
  // });

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
