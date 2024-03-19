import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const id = context.params.id;
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  //
  const { data } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(*),
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
  const headers = ["id", "created_at", ...fields.map((field) => field.name)];

  // rows
  const rows = responses.map((response) => {
    const responseValues = data.fields.map((field) => {
      const responseField = response.fields.find(
        (f) => f.form_field_id === field.id
      );
      return responseField ? responseField.value : "";
    });
    return [response.id, response.created_at, ...responseValues];
  });

  const csvContent = stringify([headers, ...rows], {
    header: false,
    columns: headers,
  });

  // Set up the headers to return a CSV file
  const responseHeaders = new Headers({
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${title}-responses.csv"`,
  });

  // Return the CSV file
  return new NextResponse(csvContent, {
    status: 200,
    headers: responseHeaders,
  });
}
