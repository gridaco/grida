import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { unwrapFeildValue } from "@/grida-forms/lib/unwrap";
import { fmt_local_index } from "@/utils/fmt";
import { createFormsClient } from "@/lib/supabase/server";
import Papa from "papaparse";

type Params = { form_id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { form_id } = await context.params;
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
    .eq("id", form_id)
    .single();

  if (!data) {
    console.warn("export/csv form notfound", form_id);
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

  // Convert to CSV using PapaParse
  const csvContent = Papa.unparse({
    fields: headers,
    data: rows,
  });

  // BOM for CJK characters in file content
  const BOM = "\uFEFF";

  const csvContentWithBOM = BOM + csvContent;

  const filename = `${form_id}-responses.csv`;
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
