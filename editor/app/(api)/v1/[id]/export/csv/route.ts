import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { unwrapFeildValue } from "@/lib/forms/unwrap";
import { fmt_local_index } from "@/utils/fmt";
import { createFormsClient } from "@/lib/supabase/server";

type Params = { id: string };

export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { id } = await context.params;
  const formsClient = await createFormsClient();
  //
  const { data } = await formsClient
    .from("form")
    .select(
      `
        *,
        fields:attribute(*),
        responses: response(*, fields:response_field(*))
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { title, fields, responses } = data;

  // headers
  const headers = [
    "id", // id
    "index", // local_index
    "created_at",
    ...fields.map((field) => field.name),
  ];

  // rows
  const rows = responses.map((response) => {
    const responseValues = data.fields.map((field) => {
      const responseField = response.fields.find(
        (f) => f.form_field_id === field.id
      );
      return responseField
        ? unwrapFeildValue(responseField.value, responseField.type)
        : "";
    });
    return [
      response.id,
      fmt_local_index(response.local_index),
      response.created_at,
      ...responseValues,
    ];
  });

  const csvContent = stringify([headers, ...rows], {
    header: false,
    columns: headers,
  });

  // BOM for CJK characters in file content
  const BOM = "\uFEFF";

  const csvContentWithBOM = BOM + csvContent;

  const filename = `${id}-responses.csv`;
  // `${title}-responses.csv` // this throws on non unicode characters

  return new NextResponse(csvContentWithBOM, {
    status: 200,
    headers: {
      // Set up the headers to return a CSV file
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
