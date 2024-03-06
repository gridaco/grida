import { client } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;

  // #region 1 prevalidate request form data
  let data: FormData;
  try {
    data = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: "You must submit form with formdata attatched" },
      { status: 400 }
    );
  }
  // #endregion

  // check if form exists
  const { data: form_reference } = await client
    .from("form")
    .select("id, is_unknown_field_allowed")
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const { is_unknown_field_allowed } = form_reference;

  const entries = data.entries();
  const keys = Array.from(data.keys());

  // create new form response
  const { data: response_reference_obj } = await client
    .from("response")
    .insert({
      raw: JSON.stringify(Object.fromEntries(entries)),
      form_id: form_id,
    })
    .select("id")
    .single();

  // get the fields ready
  const { data: form_fields } = await client
    .from("form_field")
    .select("*")
    .eq("form_id", form_id);

  // group by existing and new fields
  const known_names = keys.filter((key) => {
    return form_fields!.some((field) => field.name === key);
  });

  const unknown_names = keys.filter((key) => {
    return !form_fields!.some((field) => field.name === key);
  });
  const ignored_names: string[] = [];
  const target_names: string[] = [];
  let needs_to_be_created: string[] | null = null;

  // create new fields by preference
  if (!is_unknown_field_allowed && unknown_names.length > 0) {
    // ignore new fields
    ignored_names.push(...unknown_names);
    // add only existing fields to mapping
    target_names.push(...known_names);
  } else {
    // add all fields to mapping
    target_names.push(...known_names);
    target_names.push(...unknown_names);

    needs_to_be_created = [...unknown_names];
  }

  // create new fields
  if (needs_to_be_created) {
    const { data: new_fields } = await client
      .from("form_field")
      .insert(
        needs_to_be_created.map((key) => ({
          form_id: form_id,
          name: key,
          type: "text" as const,
        }))
      )
      .select("*");

    // extend form_fields with new fields
    form_fields!.push(...new_fields!);
  }

  // save each field value
  const { data: response_fields } = await client
    .from("response_field")
    .insert(
      form_fields!.map((field) => ({
        response_id: response_reference_obj!.id,
        form_field_id: field.id,
        value: JSON.stringify(data.get(field.name)),
      }))
    )
    .select();

  // finally fetch the response for pingback
  const { data: response } = await client
    .from("response")
    .select(
      `
        *,
        response_field (
          *,
          form_field (
            *
          )
        )
      `
    )
    .eq("id", response_reference_obj!.id)
    .single();

  return Response.json({
    data: response,
    raw: JSON.stringify(Object.fromEntries(entries)),
    warning: {
      ignored_keys: ignored_names,
    },
  });
}
