import { createServerClient } from "@/lib/supabase/server";
import { Grid } from "@/scaffolds/grid";
import { DownloadIcon } from "@radix-ui/react-icons";
import { cookies } from "next/headers";

import { GridEditor } from "@/scaffolds/grid-editor";

export default async function FormResponsesPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const { id: form_id } = params;

  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const { data: form, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(*),
        responses: response(*, fields:response_field(*))
      `
    )
    .eq("id", form_id)
    .single();

  if (error) {
    console.error(error);
  }

  const columns =
    form?.fields?.map((field) => ({
      key: field.id,
      name: field.label ?? field.name,
      frozen: false,
      // You can add more properties here as needed by react-data-grid
    })) ?? [];

  // Transforming the responses into the format expected by react-data-grid
  const rows =
    form?.responses?.map((response, index) => {
      const row: any = {
        __gf_id: response.id,
        __gf_created_at: response.created_at,
      }; // react-data-grid expects each row to have a unique 'id' property
      response.fields.forEach((field) => {
        row[field.form_field_id] = {
          type: field.type,
          value: field.value,
        };
      });
      return row;
    }) ?? [];

  return (
    <div className="h-full flex flex-col flex-1 w-full overflow-x-hidden">
      <div className="flex flex-col h-full w-full">
        <GridEditor columns={columns} rows={rows} form_id={form_id} />
      </div>
      <footer className="flex min-h-9 overflow-hidden items-center px-2 w-full border-t">
        <div>{form?.responses?.length ?? 0} response(s)</div>
        <button className="flex items-center gap-1 p-2 bg-neutral-100 rounded">
          Export to CSV
          <DownloadIcon />
        </button>
      </footer>
    </div>
  );
}
